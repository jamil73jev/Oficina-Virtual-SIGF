import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AprobacionesMemoriaRepo,
  type AprobacionRegistro,
  type AprobacionesRepo,
} from "@/core/approvals/repo";
import { AprobacionesDrizzleRepo } from "@/core/approvals/repo-drizzle";
import {
  TIMEOUT_ARRANQUE,
  crearBdPrueba,
  orgEnMemoria,
  type OrgSembrada,
} from "./pglite";

interface Montaje {
  repo: AprobacionesRepo;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => ({
      repo: new AprobacionesMemoriaRepo(),
      nuevaOrg: orgEnMemoria,
      cerrar: async () => {},
    }),
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      return { repo: new AprobacionesDrizzleRepo(bd.db), nuevaOrg: bd.nuevaOrg, cerrar: bd.cerrar };
    },
  },
];

const registro = (o: OrgSembrada, over: Partial<AprobacionRegistro> = {}): AprobacionRegistro => ({
  id: randomUUID(),
  orgId: o.orgId,
  ejecucionId: o.ejecucionId,
  tipo: "borrar_datos",
  payload: { tabla: "clientes", filtro: { activo: false, ids: [1, 2, 3] }, nota: "ñandú ✓" },
  riesgo: "irreversible",
  estado: "pendiente",
  decididoPor: null,
  decididoEn: null,
  expiraEn: new Date(Date.UTC(2026, 0, 1, 12, 0, 0, 123)),
  ...over,
});

const porId = (a: AprobacionRegistro, b: AprobacionRegistro) => a.id.localeCompare(b.id);

describe.each(implementaciones)("contrato AprobacionesRepo: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  it("crea y obtiene con fidelidad (fechas y payload anidado)", async () => {
    const o = await m.nuevaOrg();
    const r = registro(o);
    await m.repo.crear(r);
    expect(await m.repo.obtener(o.orgId, r.id)).toEqual(r);
  });

  it("rechaza un id duplicado", async () => {
    const o = await m.nuevaOrg();
    const r = registro(o);
    await m.repo.crear(r);
    await expect(m.repo.crear(r)).rejects.toThrow();
  });

  it("aisla estrictamente por org en obtener, listar y resolver", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const r = registro(a);
    await m.repo.crear(r);
    expect(await m.repo.obtener(b.orgId, r.id)).toBeNull();
    expect(await m.repo.listar(b.orgId)).toEqual([]);
    const parche = { estado: "aprobada" as const, decididoPor: b.usuarios[0], decididoEn: new Date() };
    expect(await m.repo.resolverSiPendiente(b.orgId, r.id, parche)).toBeNull();
    expect((await m.repo.obtener(a.orgId, r.id))?.estado).toBe("pendiente");
  });

  it("lista todas las de la org", async () => {
    const o = await m.nuevaOrg();
    const rs = [registro(o), registro(o, { tipo: "enviar_correo", riesgo: "escritura_reversible" })];
    for (const r of rs) await m.repo.crear(r);
    expect([...(await m.repo.listar(o.orgId))].sort(porId)).toEqual([...rs].sort(porId));
  });

  it("resolverSiPendiente aplica una sola vez (compare-and-set)", async () => {
    const o = await m.nuevaOrg();
    const r = registro(o);
    await m.repo.crear(r);
    const decididoEn = new Date(Date.UTC(2026, 0, 1, 12, 5, 0, 7));
    const hecho = await m.repo.resolverSiPendiente(o.orgId, r.id, {
      estado: "aprobada",
      decididoPor: o.usuarios[0],
      decididoEn,
    });
    expect(hecho).toEqual({ ...r, estado: "aprobada", decididoPor: o.usuarios[0], decididoEn });
    expect(
      await m.repo.resolverSiPendiente(o.orgId, r.id, {
        estado: "rechazada",
        decididoPor: o.usuarios[1],
        decididoEn: new Date(),
      }),
    ).toBeNull();
    expect(await m.repo.obtener(o.orgId, r.id)).toEqual(hecho);
    expect(
      await m.repo.resolverSiPendiente(o.orgId, randomUUID(), {
        estado: "aprobada",
        decididoPor: o.usuarios[0],
        decididoEn,
      }),
    ).toBeNull();
  });

  it("doble decision concurrente: una sola ganadora", async () => {
    const o = await m.nuevaOrg();
    const r = registro(o);
    await m.repo.crear(r);
    const intentos = Array.from({ length: 10 }, (_, i) =>
      m.repo.resolverSiPendiente(o.orgId, r.id, {
        estado: i % 2 === 0 ? "aprobada" : "rechazada",
        decididoPor: o.usuarios[i % 2] as string,
        decididoEn: new Date(Date.UTC(2026, 0, 1, 12, 0, i)),
      }),
    );
    const resultados = await Promise.all(intentos);
    const ganadoras = resultados.filter((x) => x !== null);
    expect(ganadoras).toHaveLength(1);
    expect(await m.repo.obtener(o.orgId, r.id)).toEqual(ganadoras[0]);
  });

  it("devuelve copias: mutar el resultado no altera lo guardado", async () => {
    const o = await m.nuevaOrg();
    const r = registro(o);
    await m.repo.crear(r);
    const leido = await m.repo.obtener(o.orgId, r.id);
    (leido as AprobacionRegistro).payload.tabla = "otra";
    r.payload.tabla = "mutada";
    expect((await m.repo.obtener(o.orgId, r.id))?.payload.tabla).toBe("clientes");
  });
});
