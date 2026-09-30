import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ProyectosMemoriaRepo,
  type ProyectoRegistro,
  type ProyectosRepo,
  type TareaRegistro,
} from "@/modules/proyectos";
import { ProyectosDrizzleRepo } from "@/modules/proyectos/repo-drizzle";
import { TIMEOUT_ARRANQUE, crearBdPrueba, orgEnMemoria, type OrgSembrada } from "./pglite";

interface Montaje {
  repo: ProyectosRepo;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => ({ repo: new ProyectosMemoriaRepo(), nuevaOrg: orgEnMemoria, cerrar: async () => {} }),
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      return { repo: new ProyectosDrizzleRepo(bd.db), nuevaOrg: bd.nuevaOrgLimpia, cerrar: bd.cerrar };
    },
  },
];

const proyecto = (o: OrgSembrada, over: Partial<ProyectoRegistro> = {}): ProyectoRegistro => ({
  id: randomUUID(),
  orgId: o.orgId,
  objetivo: "Conciliar la cartera — ñandú ✓",
  estado: "borrador",
  presupuestoId: null,
  ownerId: o.usuarios[0],
  ...over,
});

const tarea = (o: OrgSembrada, proyectoId: string, over: Partial<TareaRegistro> = {}): TareaRegistro => ({
  id: randomUUID(),
  orgId: o.orgId,
  proyectoId,
  padreId: null,
  agenteId: null,
  estado: "pendiente",
  criteriosVerificacion: ["cifras con fuente", "sin datos inventados"],
  deps: [],
  ...over,
});

const porId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

describe.each(implementaciones)("contrato ProyectosRepo: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  it("crea, obtiene y lista proyectos con fidelidad", async () => {
    const o = await m.nuevaOrg();
    const p1 = proyecto(o);
    const p2 = proyecto(o, { estado: "activo", objetivo: "Otro objetivo" });
    await m.repo.crearProyecto(p1);
    await m.repo.crearProyecto(p2);
    expect(await m.repo.obtenerProyecto(o.orgId, p1.id)).toEqual(p1);
    expect([...(await m.repo.listarProyectos(o.orgId))].sort(porId)).toEqual([p1, p2].sort(porId));
  });

  it("rechaza proyectos y tareas duplicados", async () => {
    const o = await m.nuevaOrg();
    const p = proyecto(o);
    await m.repo.crearProyecto(p);
    await expect(m.repo.crearProyecto(p)).rejects.toThrow();
    const t = tarea(o, p.id);
    await m.repo.crearTarea(t);
    await expect(m.repo.crearTarea(t)).rejects.toThrow();
  });

  it("tareas: crea, obtiene, lista por proyecto y guarda (arrays y nulos)", async () => {
    const o = await m.nuevaOrg();
    const p = proyecto(o);
    const otro = proyecto(o);
    await m.repo.crearProyecto(p);
    await m.repo.crearProyecto(otro);
    const t1 = tarea(o, p.id);
    const t2 = tarea(o, p.id, { deps: [t1.id], padreId: t1.id, agenteId: o.agenteId, estado: "asignada" });
    const t3 = tarea(o, otro.id);
    for (const t of [t1, t2, t3]) await m.repo.crearTarea(t);
    expect(await m.repo.obtenerTarea(o.orgId, t2.id)).toEqual(t2);
    expect([...(await m.repo.listarTareas(o.orgId, p.id))].sort(porId)).toEqual([t1, t2].sort(porId));

    const cambiada = { ...t1, estado: "bloqueada" as const, criteriosVerificacion: [], agenteId: o.agenteId };
    expect(await m.repo.guardarTarea(cambiada)).toBe(true);
    expect(await m.repo.obtenerTarea(o.orgId, t1.id)).toEqual(cambiada);
    expect(await m.repo.guardarTarea(tarea(o, p.id))).toBe(false);
  });

  it("aisla estrictamente por org", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const p = proyecto(a);
    await m.repo.crearProyecto(p);
    const t = tarea(a, p.id);
    await m.repo.crearTarea(t);
    expect(await m.repo.obtenerProyecto(b.orgId, p.id)).toBeNull();
    expect(await m.repo.listarProyectos(b.orgId)).toEqual([]);
    expect(await m.repo.obtenerTarea(b.orgId, t.id)).toBeNull();
    expect(await m.repo.listarTareas(b.orgId, p.id)).toEqual([]);
    // Guardar con el orgId de otra organizacion no toca la tarea ajena.
    expect(await m.repo.guardarTarea({ ...t, orgId: b.orgId, estado: "fallida" })).toBe(false);
    expect((await m.repo.obtenerTarea(a.orgId, t.id))?.estado).toBe("pendiente");
  });

  it("devuelve copias: mutar el resultado no altera lo guardado", async () => {
    const o = await m.nuevaOrg();
    const p = proyecto(o);
    await m.repo.crearProyecto(p);
    const t = tarea(o, p.id);
    await m.repo.crearTarea(t);
    const leida = (await m.repo.obtenerTarea(o.orgId, t.id)) as TareaRegistro;
    leida.criteriosVerificacion.push("mutado");
    t.deps.push(randomUUID());
    expect((await m.repo.obtenerTarea(o.orgId, t.id))?.criteriosVerificacion).toHaveLength(2);
    expect((await m.repo.obtenerTarea(o.orgId, t.id))?.deps).toEqual([]);
  });
});
