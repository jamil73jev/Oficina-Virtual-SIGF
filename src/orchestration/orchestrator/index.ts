import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Auditor } from "@/core/audit";
import type { ModoDatos } from "@/core/datos";
import type { ServicioPresupuesto } from "@/core/budget";
import type { Agente } from "@/types";
import { parsearCriterio, tieneCriterioSustantivo, verificar } from "../guards/qa";
import type { AlmacenArtefactos, RepositorioTareas, TareaOrq } from "../ports";
import {
  LimiteEjecucionError,
  PresupuestoPausadoError,
} from "../runtime/agent-runtime";
import { PRECIO_TOKEN, estimarTokens, type ModeloLenguaje } from "../runtime/modelo";
import { exigirModeloPermitido } from "../runtime/politica-datos";
import type { AgentRuntime } from "../runtime/types";
import { ejecutarSubagente } from "../subagents";

export const MAX_TAREAS = 20;

/** Salida estructurada del orquestador. Los criterios son ejecutables (ver guards/qa). */
export const PlanSchema = z.object({
  tareas: z
    .array(
      z.object({
        clave: z.string().min(1),
        titulo: z.string().min(1),
        descripcion: z.string().min(1),
        rol: z.string().min(1),
        criterios: z.array(z.string().min(1)).min(1),
        deps: z.array(z.string()),
      }),
    )
    .min(1)
    .max(MAX_TAREAS),
});
export type Plan = z.infer<typeof PlanSchema>;

export class PlanInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Plan invalido: ${motivo}`);
    this.name = "PlanInvalidoError";
  }
}

/** Valida claves unicas, dependencias existentes, ausencia de ciclos y criterios ejecutables. */
export function validarPlan(plan: Plan): void {
  const claves = new Set(plan.tareas.map((t) => t.clave));
  if (claves.size !== plan.tareas.length) throw new PlanInvalidoError("claves duplicadas");
  for (const t of plan.tareas) {
    for (const d of t.deps) {
      if (!claves.has(d) || d === t.clave) throw new PlanInvalidoError(`dependencia ${d}`);
    }
    for (const c of t.criterios) {
      if (!parsearCriterio(c)) throw new PlanInvalidoError(`criterio no ejecutable: ${c}`);
    }
    if (!tieneCriterioSustantivo(t.criterios)) {
      throw new PlanInvalidoError(`criterios triviales en ${t.clave}`);
    }
  }
  const estado = new Map<string, "visitando" | "listo">();
  const porClave = new Map(plan.tareas.map((t) => [t.clave, t]));
  const visitar = (k: string) => {
    if (estado.get(k) === "listo") return;
    if (estado.get(k) === "visitando") throw new PlanInvalidoError("ciclo de dependencias");
    estado.set(k, "visitando");
    for (const d of porClave.get(k)?.deps ?? []) visitar(d);
    estado.set(k, "listo");
  };
  for (const k of claves) visitar(k);
}

export interface DepsOrquestador {
  modelo: ModeloLenguaje;
  presupuesto: ServicioPresupuesto;
  runtime: AgentRuntime;
  repo: RepositorioTareas;
  almacen: AlmacenArtefactos;
  auditor: Auditor;
  /** Reintentos de QA tras el primer intento antes de escalar al humano. */
  maxReintentosQA?: number;
  nuevoId?: () => string;
  /** Clasificacion de los datos. Por defecto "real" (falla cerrado), igual que RuntimeAgente. */
  modoDatos?: ModoDatos;
}

export interface EntradaOrquestador {
  orgId: string;
  proyectoId: string;
  objetivo: string;
  /** Agente del orquestador (su presupuesto respalda la planificacion). */
  orquestador: Agente;
  agentes: Agente[];
}

export interface ResumenTarea {
  tareaId: string;
  titulo: string;
  estado: TareaOrq["estado"];
  intentos: number;
  resumen: string | null;
  documentoRef: string | null;
  /** Criterios de QA incumplidos si escalo. */
  fallosQA: string[];
}

export type EstadoOrquestacion =
  | "completado"
  | "escalado_humano"
  | "pausado_presupuesto"
  | "fallido";

export interface ResultadoOrquestacion {
  estado: EstadoOrquestacion;
  tareas: ResumenTarea[];
  solicitudAmpliacionId: string | null;
}

const SISTEMA_PLAN =
  "Eres el orquestador. Descompon el objetivo en tareas con rol, dependencias y criterios " +
  "de verificacion ejecutables (contiene:, seccion:, longitud_min:, json_valido).";

export async function orquestar(
  deps: DepsOrquestador,
  entrada: EntradaOrquestador,
): Promise<ResultadoOrquestacion> {
  const { orgId, proyectoId, orquestador } = entrada;
  const nuevoId = deps.nuevoId ?? randomUUID;
  const maxReintentos = deps.maxReintentosQA ?? 2;
  const actor = `agente:${orquestador.id}`;
  const auditar = (accion: string, entidad: string, despues?: unknown) =>
    deps.auditor.anexar({ orgId, actor, accion, entidad, despues });

  // Politica de datos antes de reservar presupuesto y de llamar al modelo.
  await exigirModeloPermitido(deps, {
    orgId,
    actor,
    agenteId: orquestador.id,
    entidad: `proyecto:${proyectoId}`,
  });

  // 1. Planificacion (con guard de presupuesto, profundidad 0).
  const tokensEst = estimarTokens(SISTEMA_PLAN + entrada.objetivo) + 1024;
  const estimado = { tokens: tokensEst, costo: tokensEst * PRECIO_TOKEN, iteraciones: 1 };
  const reserva = await deps.presupuesto.reservar({
    orgId,
    agenteId: orquestador.id,
    proyectoId,
    estimado,
    profundidad: 0,
    iteracion: 1,
  });
  if (reserva.estado === "rechazado") throw new LimiteEjecucionError(reserva.motivo);
  if (reserva.estado === "pausado") {
    await auditar("orquestador.pausado_presupuesto", `proyecto:${proyectoId}`, {
      solicitudId: reserva.solicitud.id,
    });
    return { estado: "pausado_presupuesto", tareas: [], solicitudAmpliacionId: reserva.solicitud.id };
  }

  const conciliar = (real: { tokens: number; costo: number }) =>
    deps.presupuesto.conciliar({
      orgId,
      agenteId: orquestador.id,
      proyectoId,
      estimado,
      real: { ...real, iteraciones: 1 },
    });
  let generado;
  try {
    generado = await deps.modelo.generarObjeto({
      sistema: SISTEMA_PLAN,
      entrada: entrada.objetivo,
      esquema: PlanSchema,
    });
  } catch (e) {
    await conciliar({ tokens: 0, costo: 0 });
    throw e;
  }
  await conciliar(generado.uso);
  const plan = generado.objeto;
  validarPlan(plan);

  // 2. Crear tareas y asignarlas por rol (agentes activos de la misma org).
  const idPorClave = new Map(plan.tareas.map((t) => [t.clave, nuevoId()]));
  const tareas: TareaOrq[] = plan.tareas.map((t) => {
    const agente = entrada.agentes.find(
      (a) => a.orgId === orgId && a.estado === "activo" && a.rol === t.rol,
    );
    return {
      id: idPorClave.get(t.clave) as string,
      orgId,
      proyectoId,
      padreId: null,
      agenteId: agente?.id ?? null,
      estado: agente ? "asignada" : "bloqueada",
      criteriosVerificacion: t.criterios,
      deps: t.deps.map((d) => idPorClave.get(d) as string),
      titulo: t.titulo,
      descripcion: t.descripcion,
      rolAgente: t.rol,
    };
  });
  await deps.repo.crear(tareas);
  await auditar("orquestador.plan_creado", `proyecto:${proyectoId}`, {
    tareas: tareas.map((t) => ({ id: t.id, rol: t.rolAgente, agenteId: t.agenteId })),
  });

  // 3. Ejecucion en orden topologico (el plan ya es aciclico).
  const resumenes = new Map<string, ResumenTarea>();
  let solicitudAmpliacionId: string | null = null;
  let pausado = false;

  const pendientes = [...tareas];
  while (pendientes.length > 0 && !pausado) {
    const idx = pendientes.findIndex((t) => t.deps.every((d) => resumenes.has(d)));
    const tarea = pendientes.splice(idx === -1 ? 0 : idx, 1)[0] as TareaOrq;
    const previas = tarea.deps.map((d) => resumenes.get(d) as ResumenTarea);
    const base: ResumenTarea = {
      tareaId: tarea.id,
      titulo: tarea.titulo,
      estado: tarea.estado,
      intentos: 0,
      resumen: null,
      documentoRef: null,
      fallosQA: [],
    };

    const agente = entrada.agentes.find((a) => a.id === tarea.agenteId);
    if (!agente || previas.some((p) => p.estado !== "completada")) {
      await deps.repo.actualizar(orgId, tarea.id, { estado: "bloqueada" });
      resumenes.set(tarea.id, { ...base, estado: "bloqueada" });
      continue;
    }

    const referencias = previas.flatMap((p) => (p.documentoRef ? [p.documentoRef] : []));
    let fallos: string[] = [];
    let ultimo = base;
    await deps.repo.actualizar(orgId, tarea.id, { estado: "en_curso" });

    for (let intento = 1; intento <= 1 + maxReintentos; intento++) {
      let r;
      try {
        r = await ejecutarSubagente(deps.runtime, {
          orgId,
          agente,
          tarea,
          referencias,
          fallosPrevios: fallos,
          profundidad: 1,
        });
      } catch (e) {
        if (e instanceof PresupuestoPausadoError) {
          pausado = true;
          solicitudAmpliacionId = e.solicitud.id;
          await deps.repo.actualizar(orgId, tarea.id, { estado: "bloqueada" });
          ultimo = { ...ultimo, estado: "bloqueada", intentos: intento };
          break;
        }
        throw e;
      }

      await deps.repo.actualizar(orgId, tarea.id, { estado: "en_verificacion" });
      const contenido = r.documentoRef ? await deps.almacen.leer(orgId, r.documentoRef) : null;
      // Sin documento no hay nada que verificar: falla (nunca se valida contenido vacio).
      const qa =
        contenido === null
          ? { ok: false, fallos: ["sin_documento"] }
          : verificar(contenido, tarea.criteriosVerificacion);
      await auditar("qa.verificada", `tarea:${tarea.id}`, { intento, ok: qa.ok, fallos: qa.fallos });
      ultimo = {
        ...base,
        intentos: intento,
        resumen: r.resumen,
        documentoRef: r.documentoRef,
        fallosQA: qa.fallos,
      };
      if (qa.ok) {
        await deps.repo.actualizar(orgId, tarea.id, { estado: "completada" });
        ultimo = { ...ultimo, estado: "completada" };
        break;
      }
      fallos = qa.fallos;
      // Reintentos agotados: escalar al humano (la tarea queda bloqueada).
      if (intento === 1 + maxReintentos) {
        await deps.repo.actualizar(orgId, tarea.id, { estado: "bloqueada" });
        await auditar("qa.escalada_humano", `tarea:${tarea.id}`, { fallos: qa.fallos });
        ultimo = { ...ultimo, estado: "bloqueada" };
      }
    }
    resumenes.set(tarea.id, ultimo);
  }

  const lista = tareas.map(
    (t) => resumenes.get(t.id) ?? { tareaId: t.id, titulo: t.titulo, estado: "pendiente" as const, intentos: 0, resumen: null, documentoRef: null, fallosQA: [] },
  );
  const estado: EstadoOrquestacion = pausado
    ? "pausado_presupuesto"
    : lista.every((t) => t.estado === "completada")
      ? "completado"
      : lista.some((t) => t.fallosQA.length > 0 && t.estado === "bloqueada")
        ? "escalado_humano"
        : "fallido";
  await auditar("orquestador.finalizado", `proyecto:${proyectoId}`, { estado });
  return { estado, tareas: lista, solicitudAmpliacionId };
}
