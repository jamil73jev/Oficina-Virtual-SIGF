import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Auditor,
  AuditoriaMemoriaRepo,
  VALOR_REDACTADO,
  calcularHash,
  verificarCadena,
  type AuditoriaRepo,
  type EntradaAuditoria,
} from "@/core/audit";
import { AuditoriaDrizzleRepo } from "@/core/audit/repo-drizzle";
import { TIMEOUT_ARRANQUE, crearBdPrueba, orgEnMemoria, type OrgSembrada } from "./pglite";

const CLAVE = "clave-hmac-de-pruebas-0123456789";

interface Montaje {
  repo: AuditoriaRepo;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => ({
      repo: new AuditoriaMemoriaRepo(),
      nuevaOrg: orgEnMemoria,
      cerrar: async () => {},
    }),
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      return { repo: new AuditoriaDrizzleRepo(bd.db), nuevaOrg: bd.nuevaOrg, cerrar: bd.cerrar };
    },
  },
];

/** Entrada valida "a mano" que continua `prev`. */
const entrada = (orgId: string, prev: EntradaAuditoria | null, seq = (prev?.seq ?? 0) + 1) => {
  const base = {
    id: randomUUID(),
    orgId,
    seq,
    actor: "u1",
    accion: "probar",
    entidad: "x:1",
    antes: null,
    despues: { n: seq },
    hashPrev: prev?.hash ?? null,
    creadoEn: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
  };
  return { ...base, hash: calcularHash(base, CLAVE) } satisfies EntradaAuditoria;
};

const seqs = (l: readonly EntradaAuditoria[]) => l.map((e) => e.seq);
const rango = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe.each(implementaciones)("contrato AuditoriaRepo: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  it("org nueva: sin entradas", async () => {
    const { orgId } = await m.nuevaOrg();
    expect(await m.repo.ultima(orgId)).toBeNull();
    expect(await m.repo.listar(orgId)).toEqual([]);
  });

  it("Auditor: encadena, redacta y la cadena verifica tras el ida y vuelta", async () => {
    const { orgId } = await m.nuevaOrg();
    const auditor = new Auditor(m.repo, { claveHmac: CLAVE });
    const e1 = await auditor.anexar({ orgId, actor: "u1", accion: "crear", entidad: "proyecto:1" });
    const e2 = await auditor.anexar({
      orgId,
      actor: "agente:7",
      accion: "actualizar",
      entidad: "proyecto:1",
      antes: { estado: "borrador", password: "x" },
      despues: { estado: "activo", z: [1, 2.5, "ñ"], a: { apiKey: "k", tokens: 42 }, nulo: null },
    });
    const lista = await m.repo.listar(orgId);
    expect(lista).toEqual([e1, e2]);
    expect(await m.repo.ultima(orgId)).toEqual(e2);
    expect((lista[1]?.antes as { password: string }).password).toBe(VALOR_REDACTADO);
    expect(verificarCadena(orgId, lista, CLAVE)).toEqual({ valida: true, total: 2 });
  });

  it("rechaza seq fuera de secuencia (hueco o duplicado)", async () => {
    const { orgId } = await m.nuevaOrg();
    const e1 = entrada(orgId, null);
    await m.repo.agregar(e1);
    await expect(m.repo.agregar(entrada(orgId, e1, 3))).rejects.toThrow();
    await expect(m.repo.agregar(entrada(orgId, null, 1))).rejects.toThrow();
    expect(seqs(await m.repo.listar(orgId))).toEqual([1]);
  });

  it("aisla por org: cada org tiene su propia cadena", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const auditor = new Auditor(m.repo, { claveHmac: CLAVE });
    await auditor.anexar({ orgId: a.orgId, actor: "u", accion: "x", entidad: "e" });
    await auditor.anexar({ orgId: a.orgId, actor: "u", accion: "y", entidad: "e" });
    const b1 = await auditor.anexar({ orgId: b.orgId, actor: "u", accion: "x", entidad: "e" });
    expect(b1.seq).toBe(1);
    expect(b1.hashPrev).toBeNull();
    expect((await m.repo.listar(b.orgId)).map((e) => e.orgId)).toEqual([b.orgId]);
    expect(seqs(await m.repo.listar(a.orgId))).toEqual([1, 2]);
  });

  it("N escrituras concurrentes por org: seq contiguos, sin duplicados, cadena integra", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const auditor = new Auditor(m.repo, { claveHmac: CLAVE });
    const N = 40;
    await Promise.all(
      rango(N).flatMap((i) => [
        auditor.anexar({ orgId: a.orgId, actor: `u${i}`, accion: "x", entidad: `e:${i}` }),
        auditor.anexar({ orgId: b.orgId, actor: `u${i}`, accion: "y", entidad: `e:${i}` }),
      ]),
    );
    for (const { orgId } of [a, b]) {
      const lista = await m.repo.listar(orgId);
      expect(seqs(lista)).toEqual(rango(N));
      expect(new Set(lista.map((e) => e.hash)).size).toBe(N);
      expect(verificarCadena(orgId, lista, CLAVE)).toEqual({ valida: true, total: N });
    }
  });

  it("dos auditores (dos procesos) a la vez: la cadena nunca se bifurca", async () => {
    const { orgId } = await m.nuevaOrg();
    const p1 = new Auditor(m.repo, { claveHmac: CLAVE });
    const p2 = new Auditor(m.repo, { claveHmac: CLAVE });
    const N = 15;
    const r = await Promise.allSettled(
      rango(N).flatMap((i) => [
        p1.anexar({ orgId, actor: "p1", accion: "x", entidad: `e:${i}` }),
        p2.anexar({ orgId, actor: "p2", accion: "x", entidad: `e:${i}` }),
      ]),
    );
    const ok = r.filter((x) => x.status === "fulfilled");
    const lista = await m.repo.listar(orgId);
    // Cada anexo o entra en la cadena o falla; nunca dos entradas con el mismo seq.
    expect(lista).toHaveLength(ok.length);
    expect(ok.length).toBeGreaterThanOrEqual(N);
    expect(seqs(lista)).toEqual(rango(lista.length));
    expect(verificarCadena(orgId, lista, CLAVE)).toEqual({ valida: true, total: lista.length });
  });
});
