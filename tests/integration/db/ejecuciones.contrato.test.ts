import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RepositorioEjecucionesMemoria, type RepositorioEjecuciones } from "@/modules/agentes-area";
import {
  AlmacenArtefactosDrizzle,
  RepositorioEjecucionesDrizzle,
  RepositorioTareasDrizzle,
} from "@/modules/agentes-area/repo-drizzle";
import { AlmacenArtefactosMemoria, RepositorioTareasMemoria } from "@/orchestration/memoria";
import type { AlmacenArtefactos, RepositorioTareas, TareaOrq } from "@/orchestration/ports";
import type { Ejecucion } from "@/types";
import { TIMEOUT_ARRANQUE, crearBdPrueba, orgEnMemoria, type OrgSembrada } from "./pglite";

interface Montaje {
  ejecuciones: RepositorioEjecuciones;
  tareas: RepositorioTareas;
  almacen: AlmacenArtefactos;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => ({
      ejecuciones: new RepositorioEjecucionesMemoria(),
      tareas: new RepositorioTareasMemoria(),
      almacen: new AlmacenArtefactosMemoria(),
      nuevaOrg: orgEnMemoria,
      cerrar: async () => {},
    }),
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      return {
        ejecuciones: new RepositorioEjecucionesDrizzle(bd.db),
        tareas: new RepositorioTareasDrizzle(bd.db),
        almacen: new AlmacenArtefactosDrizzle(bd.db),
        nuevaOrg: bd.nuevaOrgLimpia,
        cerrar: bd.cerrar,
      };
    },
  },
];

/** Agente del catalogo (uuid fijo, sin fila en `agente`) y proyecto logico de operaciones. */
const AGENTE_CATALOGO = "00000000-0000-4000-8000-00000000c001";
const PROYECTO_LOGICO = "00000000-0000-4000-8000-0000000000f1";

const tareaOrq = (o: OrgSembrada, over: Partial<TareaOrq> = {}): TareaOrq => ({
  id: randomUUID(),
  orgId: o.orgId,
  proyectoId: PROYECTO_LOGICO,
  padreId: null,
  agenteId: AGENTE_CATALOGO,
  estado: "en_curso",
  criteriosVerificacion: ["Toda cifra sale de una herramienta permitida"],
  deps: [],
  titulo: "Consulta al Analista de cartera",
  descripcion: "¿Cuál es la cartera vencida?",
  rolAgente: "cartera",
  ...over,
});

const ejecucion = (o: OrgSembrada, tareaId: string, over: Partial<Ejecucion> = {}): Ejecucion => ({
  id: randomUUID(),
  orgId: o.orgId,
  tareaId,
  agenteId: AGENTE_CATALOGO,
  padreEjecucionId: null,
  workflowRunId: null,
  modelo: "simulado",
  tokensIn: 0,
  tokensOut: 0,
  tokensCache: 0,
  costo: 0,
  estado: "en_curso",
  resumen: null,
  ...over,
});

const porId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

describe.each(implementaciones)("contrato ejecuciones, tareas y artefactos: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  it("tareas del orquestador: crear (alta o reemplazo), obtener, actualizar y listar", async () => {
    const o = await m.nuevaOrg();
    const t1 = tareaOrq(o);
    const t2 = tareaOrq(o, { deps: [t1.id], padreId: t1.id, rolAgente: "tesoreria" });
    await m.tareas.crear([t1, t2]);
    expect(await m.tareas.obtener(o.orgId, t1.id)).toEqual(t1);
    const reemplazo = { ...t1, titulo: "Titulo nuevo" };
    await m.tareas.crear([reemplazo]);
    expect(await m.tareas.obtener(o.orgId, t1.id)).toEqual(reemplazo);
    const actualizada = await m.tareas.actualizar(o.orgId, t2.id, { estado: "completada" });
    expect(actualizada).toEqual({ ...t2, estado: "completada" });
    expect(await m.tareas.obtener(o.orgId, t2.id)).toEqual(actualizada);
    expect([...(await m.tareas.listarPorProyecto(o.orgId, PROYECTO_LOGICO))].sort(porId)).toEqual(
      [reemplazo, actualizada].sort(porId),
    );
    await expect(m.tareas.actualizar(o.orgId, randomUUID(), { estado: "fallida" })).rejects.toThrow("Tarea no encontrada");
  });

  it("ejecuciones: crear, obtener, actualizar y listar; duplicado rechazado", async () => {
    const o = await m.nuevaOrg();
    const t = tareaOrq(o);
    await m.tareas.crear([t]);
    const e1 = ejecucion(o, t.id);
    const e2 = ejecucion(o, t.id, { padreEjecucionId: e1.id, workflowRunId: "wf-1", modelo: "ollama:qwen2.5:3b" });
    await m.ejecuciones.crear(e1);
    await m.ejecuciones.crear(e2);
    await expect(m.ejecuciones.crear(e1)).rejects.toThrow();
    expect(await m.ejecuciones.obtener(o.orgId, e2.id)).toEqual(e2);
    const cambios = { estado: "completada" as const, tokensIn: 120, tokensOut: 45, tokensCache: 3, costo: 0.0125, resumen: "Listo ✓" };
    const nueva = await m.ejecuciones.actualizar(o.orgId, e1.id, cambios);
    expect(nueva).toEqual({ ...e1, ...cambios });
    expect(await m.ejecuciones.obtener(o.orgId, e1.id)).toEqual(nueva);
    expect([...(await m.ejecuciones.listar(o.orgId))].sort(porId)).toEqual([nueva, e2].sort(porId));
    await expect(m.ejecuciones.actualizar(o.orgId, randomUUID(), { estado: "fallida" })).rejects.toThrow(
      "Ejecucion no encontrada",
    );
  });

  it("artefactos por referencia: guardar, leer e idempotencia por contenido", async () => {
    const o = await m.nuevaOrg();
    const t = tareaOrq(o);
    const nuevo = { orgId: o.orgId, proyectoId: PROYECTO_LOGICO, tareaId: t.id, tipo: "texto", contenido: "Informe — cifras ✓" };
    const ref = await m.almacen.guardar(nuevo);
    expect(ref).toMatch(new RegExp(`^artefacto://${o.orgId}/${t.id}/[0-9a-f]{16}$`));
    expect(await m.almacen.guardar(nuevo)).toBe(ref);
    expect(await m.almacen.leer(o.orgId, ref)).toBe(nuevo.contenido);
    expect(await m.almacen.leer(o.orgId, `artefacto://${o.orgId}/${t.id}/0000000000000000`)).toBeNull();
  });

  it("aisla estrictamente por org", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const t = tareaOrq(a);
    await m.tareas.crear([t]);
    const e = ejecucion(a, t.id);
    await m.ejecuciones.crear(e);
    expect(await m.tareas.obtener(b.orgId, t.id)).toBeNull();
    expect(await m.tareas.listarPorProyecto(b.orgId, PROYECTO_LOGICO)).toEqual([]);
    await expect(m.tareas.actualizar(b.orgId, t.id, { estado: "fallida" })).rejects.toThrow();
    expect(await m.ejecuciones.obtener(b.orgId, e.id)).toBeNull();
    expect(await m.ejecuciones.listar(b.orgId)).toEqual([]);
    await expect(m.ejecuciones.actualizar(b.orgId, e.id, { estado: "fallida" })).rejects.toThrow();
    expect((await m.ejecuciones.obtener(a.orgId, e.id))?.estado).toBe("en_curso");
    const ref = await m.almacen.guardar({ orgId: a.orgId, proyectoId: PROYECTO_LOGICO, tareaId: t.id, tipo: "texto", contenido: "secreto" });
    expect(await m.almacen.leer(b.orgId, ref)).toBeNull();
  });
});
