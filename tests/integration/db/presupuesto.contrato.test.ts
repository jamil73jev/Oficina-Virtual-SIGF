import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PresupuestoMemoriaRepo,
  ServicioPresupuesto,
  type ClavePresupuesto,
  type PeticionReserva,
  type PresupuestoRepo,
} from "@/core/budget";
import { PresupuestoDrizzleRepo } from "@/core/budget/repo-drizzle";
import type { ContextoAcceso } from "@/core/rbac";
import type { AmbitoGuard, EstadoPresupuesto, Uso } from "@/orchestration/runtime";
import { TIMEOUT_ARRANQUE, crearBdPrueba, orgEnMemoria, type OrgSembrada } from "./pglite";

interface Montaje {
  repo: PresupuestoRepo;
  definir(orgId: string, c: ClavePresupuesto, e: EstadoPresupuesto): Promise<void>;
  leer(orgId: string, c: ClavePresupuesto): Promise<EstadoPresupuesto | null>;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => {
      const repo = new PresupuestoMemoriaRepo();
      return {
        repo,
        definir: async (o, c, e) => repo.definir(o, c, e),
        leer: async (o, c) => repo.leer(o, c),
        nuevaOrg: orgEnMemoria,
        cerrar: async () => {},
      };
    },
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      const repo = new PresupuestoDrizzleRepo(bd.db);
      return {
        repo,
        definir: (o, c, e) => repo.definir(o, c, e),
        leer: (o, c) => repo.leer(o, c),
        nuevaOrg: bd.nuevaOrg,
        cerrar: bd.cerrar,
      };
    },
  },
];

const uso = (tokens: number, costo = 0, iteraciones = 0): Uso => ({ tokens, costo, iteraciones });
const est = (ambito: AmbitoGuard, tope: Uso, consumido = uso(0)): EstadoPresupuesto => ({
  ambito,
  tope,
  consumido,
});
const TOPE_ALTO = uso(1_000_000, 1_000, 1_000);

const claves = (o: OrgSembrada) => ({
  agente: { ambito: "agente", refId: o.agenteId } as const,
  proyecto: { ambito: "proyecto", refId: o.proyectoId } as const,
  org: { ambito: "org", refId: o.orgId } as const,
});

describe.each(implementaciones)("contrato PresupuestoRepo: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  /** Org con los tres ambitos; el agente con `topeAgente` tokens. */
  const preparar = async (topeAgente: Uso = uso(100, 10, 100)) => {
    const o = await m.nuevaOrg();
    const k = claves(o);
    await m.definir(o.orgId, k.agente, est("agente", topeAgente));
    await m.definir(o.orgId, k.proyecto, est("proyecto", TOPE_ALTO));
    await m.definir(o.orgId, k.org, est("org", TOPE_ALTO));
    const pet = (over: Partial<PeticionReserva> = {}): PeticionReserva => ({
      orgId: o.orgId,
      agenteId: o.agenteId,
      proyectoId: o.proyectoId,
      estimado: uso(10, 1, 1),
      profundidad: 1,
      iteracion: 1,
      ...over,
    });
    const owner: ContextoAcceso = { usuarioId: o.usuarios[0], orgId: o.orgId, rol: "owner" };
    return { o, k, pet, owner, svc: new ServicioPresupuesto(m.repo) };
  };

  it("definir y leer: ida y vuelta fiel", async () => {
    const { o, k } = await preparar(uso(100, 2.5, 7));
    expect(await m.leer(o.orgId, k.agente)).toEqual(est("agente", uso(100, 2.5, 7)));
  });

  it("reserva en los tres ambitos y avisa al 80 %", async () => {
    const { o, k, pet, svc } = await preparar();
    expect(await svc.reservar(pet())).toEqual({ estado: "ok", avisos: [] });
    for (const c of Object.values(k)) {
      expect((await m.leer(o.orgId, c))?.consumido).toEqual(uso(10, 1, 1));
    }
    expect(await svc.reservar(pet({ estimado: uso(70, 1, 1) }))).toEqual({
      estado: "ok",
      avisos: ["agente"],
    });
  });

  it("al exceder pausa sin consumir y reutiliza la solicitud pendiente", async () => {
    const { o, k, pet, svc } = await preparar();
    const r1 = await svc.reservar(pet({ estimado: uso(101) }));
    expect(r1.estado).toBe("pausado");
    if (r1.estado !== "pausado") return;
    expect(r1.excedidos).toEqual(["agente"]);
    expect(r1.solicitud).toMatchObject({ estado: "pendiente", claves: [k.agente] });
    expect((await m.leer(o.orgId, k.agente))?.consumido).toEqual(uso(0));
    const r2 = await svc.reservar(pet({ estimado: uso(500) }));
    expect(r2.estado === "pausado" && r2.solicitud.id).toBe(r1.solicitud.id);
  });

  it("fail-closed: sin presupuesto en algun ambito rechaza", async () => {
    const { pet, svc } = await preparar();
    expect(await svc.reservar(pet({ proyectoId: randomUUID() }))).toEqual({
      estado: "rechazado",
      motivo: "sin_presupuesto",
    });
  });

  it("aisla por org: los presupuestos de otra org no existen", async () => {
    const a = await preparar();
    const b = await m.nuevaOrg();
    const svc = new ServicioPresupuesto(m.repo);
    await m.definir(b.orgId, { ambito: "org", refId: b.orgId }, est("org", TOPE_ALTO));
    // Mismos agente/proyecto de A, pero pedidos desde B.
    expect(await svc.reservar(a.pet({ orgId: b.orgId }))).toEqual({
      estado: "rechazado",
      motivo: "sin_presupuesto",
    });
    expect(await m.leer(b.orgId, a.k.agente)).toBeNull();
  });

  it("decidir ampliacion: aplica topes una sola vez y nunca entre orgs", async () => {
    const { o, k, pet, owner, svc } = await preparar();
    const r = await svc.reservar(pet({ estimado: uso(150) }));
    if (r.estado !== "pausado") throw new Error("se esperaba pausa");
    const otra = await m.nuevaOrg();
    await expect(
      svc.decidirAmpliacion({ ...owner, orgId: otra.orgId }, r.solicitud.id, { aprobar: false }),
    ).rejects.toThrow("Solicitud no encontrada");
    const nuevosTopes = uso(1000, 50, 500);
    const d = await svc.decidirAmpliacion(owner, r.solicitud.id, { aprobar: true, nuevosTopes });
    expect(d).toMatchObject({ estado: "aprobada", decididoPor: owner.usuarioId });
    expect((await m.leer(o.orgId, k.agente))?.tope).toEqual(nuevosTopes);
    await expect(
      svc.decidirAmpliacion(owner, r.solicitud.id, { aprobar: false }),
    ).rejects.toThrow("Solicitud ya decidida");
    expect((await svc.reservar(pet({ estimado: uso(150) }))).estado).toBe("ok");
  });

  it("conciliar sustituye lo estimado por lo real (nunca bajo 0)", async () => {
    const { o, k, pet, svc } = await preparar();
    await svc.reservar(pet());
    await svc.conciliar({ ...pet(), real: uso(25, 0.5, 1) });
    expect((await m.leer(o.orgId, k.agente))?.consumido).toEqual(uso(25, 0.5, 1));
    await svc.conciliar({ ...pet(), estimado: uso(1000, 100, 100), real: uso(0) });
    expect((await m.leer(o.orgId, k.org))?.consumido).toEqual(uso(0));
  });

  it("reservas concurrentes nunca superan el tope", async () => {
    const { o, k, pet, svc } = await preparar(uso(100, 1_000, 1_000));
    const r = await Promise.all(Array.from({ length: 25 }, () => svc.reservar(pet())));
    expect(r.filter((x) => x.estado === "ok")).toHaveLength(10);
    expect(r.filter((x) => x.estado === "pausado")).toHaveLength(15);
    expect((await m.leer(o.orgId, k.agente))?.consumido.tokens).toBe(100);
    expect((await m.leer(o.orgId, k.org))?.consumido.tokens).toBe(100);
    // Una sola solicitud de ampliacion para todas las pausas.
    const ids = new Set(r.flatMap((x) => (x.estado === "pausado" ? [x.solicitud.id] : [])));
    expect(ids.size).toBe(1);
  });

  it("guardarSolicitud sobre una solicitud inexistente falla", async () => {
    const { o } = await preparar();
    await expect(
      m.repo.transaccion((tx) =>
        tx.guardarSolicitud({
          id: randomUUID(),
          orgId: o.orgId,
          tipo: "ampliacion_presupuesto",
          claves: [],
          estimado: uso(1),
          estado: "aprobada",
          decididoPor: null,
          creadaEn: new Date().toISOString(),
        }),
      ),
    ).rejects.toThrow("Solicitud inexistente");
  });
});
