import { randomUUID } from "node:crypto";
import type { Auditor } from "@/core/audit";
import { can, type Accion, type ContextoAcceso } from "@/core/rbac";
import {
  EXIGEN_AGENTE,
  EXIGEN_DEPS_COMPLETAS,
  crearaCiclo,
  transicionPermitida,
  type EstadoDeTarea,
  type ProyectoRegistro,
  type TareaRegistro,
} from "./domain";
import type { ProyectosRepo } from "./repo";

export type CodigoErrorProyecto =
  | "no_encontrado"
  | "rol_insuficiente"
  | "solicitud_invalida"
  | "ciclo_dependencias"
  | "transicion_invalida"
  | "dependencias_incompletas"
  | "sin_agente"
  | "proyecto_cerrado";

export class ProyectoError extends Error {
  constructor(readonly codigo: CodigoErrorProyecto) {
    super(`Proyectos: ${codigo}`);
    this.name = "ProyectoError";
  }
}

export interface OpcionesServicioProyectos {
  nuevoId?: () => string;
}

const MAX_CRITERIOS = 50;
const MAX_TEXTO = 2000;

/** Normaliza criterios: recorta, descarta vacios y exige al menos uno. */
function normalizarCriterios(criterios: readonly string[]): string[] {
  const limpios = criterios.map((c) => c.trim()).filter((c) => c.length > 0);
  if (
    limpios.length === 0 ||
    limpios.length > MAX_CRITERIOS ||
    limpios.some((c) => c.length > MAX_TEXTO)
  ) {
    throw new ProyectoError("solicitud_invalida");
  }
  return limpios;
}

export class ServicioProyectos {
  private readonly nuevoId: () => string;
  /** Serializa las mutaciones: la comprobacion de ciclos y el guardado son atomicos. */
  private cola: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repo: ProyectosRepo,
    private readonly auditor: Auditor,
    opciones: OpcionesServicioProyectos = {},
  ) {
    this.nuevoId = opciones.nuevoId ?? randomUUID;
  }

  // --- lecturas -----------------------------------------------------------

  async listarProyectos(ctx: ContextoAcceso): Promise<ProyectoRegistro[]> {
    await this.exigir(ctx, "proyecto:leer", "proyecto:*");
    return this.repo.listarProyectos(ctx.orgId);
  }

  async obtenerProyecto(ctx: ContextoAcceso, id: string): Promise<ProyectoRegistro> {
    await this.exigir(ctx, "proyecto:leer", `proyecto:${id}`);
    return this.proyecto(ctx, id);
  }

  async listarTareas(ctx: ContextoAcceso, proyectoId: string): Promise<TareaRegistro[]> {
    await this.exigir(ctx, "tarea:leer", `proyecto:${proyectoId}`);
    await this.proyecto(ctx, proyectoId);
    return this.repo.listarTareas(ctx.orgId, proyectoId);
  }

  // --- mutaciones ---------------------------------------------------------

  crearProyecto(ctx: ContextoAcceso, datos: { objetivo: string }): Promise<ProyectoRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "proyecto:crear", "proyecto:*");
      const objetivo = datos.objetivo.trim();
      if (!objetivo || objetivo.length > MAX_TEXTO) throw new ProyectoError("solicitud_invalida");
      const p: ProyectoRegistro = {
        id: this.nuevoId(),
        orgId: ctx.orgId,
        objetivo,
        estado: "activo",
        presupuestoId: null,
        ownerId: ctx.usuarioId,
      };
      await this.repo.crearProyecto(p);
      await this.auditar(ctx, "proyecto:crear", `proyecto:${p.id}`, null, p);
      return p;
    });
  }

  crearTarea(
    ctx: ContextoAcceso,
    datos: {
      proyectoId: string;
      criteriosVerificacion: readonly string[];
      deps?: readonly string[];
      padreId?: string | null;
    },
  ): Promise<TareaRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "tarea:crear", `proyecto:${datos.proyectoId}`);
      const proyecto = await this.proyecto(ctx, datos.proyectoId);
      this.exigirAbierto(proyecto);
      const criterios = normalizarCriterios(datos.criteriosVerificacion);
      const deps = [...new Set(datos.deps ?? [])];
      const existentes = await this.repo.listarTareas(ctx.orgId, proyecto.id);
      const ids = new Set(existentes.map((t) => t.id));
      // Dependencias y padre solo dentro del mismo proyecto y org.
      if (deps.some((d) => !ids.has(d))) throw new ProyectoError("no_encontrado");
      const padreId = datos.padreId ?? null;
      if (padreId !== null && !ids.has(padreId)) throw new ProyectoError("no_encontrado");
      const t: TareaRegistro = {
        id: this.nuevoId(),
        orgId: ctx.orgId,
        proyectoId: proyecto.id,
        padreId,
        agenteId: null,
        estado: "pendiente",
        criteriosVerificacion: criterios,
        deps,
      };
      await this.repo.crearTarea(t);
      await this.auditar(ctx, "tarea:crear", `tarea:${t.id}`, null, t);
      return t;
    });
  }

  /** Asigna (o desasigna con null) un agente. Una tarea pendiente pasa a asignada. */
  asignarTarea(
    ctx: ContextoAcceso,
    tareaId: string,
    agenteId: string | null,
  ): Promise<TareaRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "tarea:asignar", `tarea:${tareaId}`);
      const antes = await this.tarea(ctx, tareaId);
      this.exigirAbierto(await this.proyecto(ctx, antes.proyectoId));
      if (agenteId !== null && !agenteId.trim()) throw new ProyectoError("solicitud_invalida");
      const despues: TareaRegistro = { ...antes, agenteId };
      if (agenteId !== null && antes.estado === "pendiente") despues.estado = "asignada";
      if (agenteId === null && EXIGEN_AGENTE.includes(antes.estado)) {
        // Sin agente no puede haber trabajo en curso: solo "asignada" vuelve a pendiente.
        if (antes.estado !== "asignada") throw new ProyectoError("sin_agente");
        despues.estado = "pendiente";
      }
      await this.guardar(despues);
      await this.auditar(ctx, "tarea:asignar", `tarea:${tareaId}`, antes, despues);
      return despues;
    });
  }

  moverTarea(ctx: ContextoAcceso, tareaId: string, estado: EstadoDeTarea): Promise<TareaRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "tarea:editar", `tarea:${tareaId}`);
      const antes = await this.tarea(ctx, tareaId);
      this.exigirAbierto(await this.proyecto(ctx, antes.proyectoId));
      if (!transicionPermitida(antes.estado, estado)) throw new ProyectoError("transicion_invalida");
      if (EXIGEN_AGENTE.includes(estado) && antes.agenteId === null) {
        throw new ProyectoError("sin_agente");
      }
      if (EXIGEN_DEPS_COMPLETAS.includes(estado)) {
        const todas = await this.repo.listarTareas(ctx.orgId, antes.proyectoId);
        const porId = new Map(todas.map((t) => [t.id, t]));
        if (antes.deps.some((d) => porId.get(d)?.estado !== "completada")) {
          throw new ProyectoError("dependencias_incompletas");
        }
      }
      const despues: TareaRegistro = { ...antes, estado };
      await this.guardar(despues);
      await this.auditar(ctx, "tarea:mover", `tarea:${tareaId}`, antes, despues);
      return despues;
    });
  }

  definirCriterios(
    ctx: ContextoAcceso,
    tareaId: string,
    criterios: readonly string[],
  ): Promise<TareaRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "tarea:editar", `tarea:${tareaId}`);
      const antes = await this.tarea(ctx, tareaId);
      this.exigirAbierto(await this.proyecto(ctx, antes.proyectoId));
      const despues: TareaRegistro = {
        ...antes,
        criteriosVerificacion: normalizarCriterios(criterios),
      };
      await this.guardar(despues);
      await this.auditar(ctx, "tarea:criterios", `tarea:${tareaId}`, antes, despues);
      return despues;
    });
  }

  agregarDependencia(ctx: ContextoAcceso, tareaId: string, depId: string): Promise<TareaRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "tarea:editar", `tarea:${tareaId}`);
      const antes = await this.tarea(ctx, tareaId);
      this.exigirAbierto(await this.proyecto(ctx, antes.proyectoId));
      const todas = await this.repo.listarTareas(ctx.orgId, antes.proyectoId);
      const dep = todas.find((t) => t.id === depId);
      if (!dep) throw new ProyectoError("no_encontrado");
      if (antes.deps.includes(depId)) return antes;
      if (crearaCiclo(todas, tareaId, depId)) {
        await this.auditar(ctx, "tarea:dependencia_rechazada", `tarea:${tareaId}`, null, {
          depId,
          motivo: "ciclo_dependencias",
        });
        throw new ProyectoError("ciclo_dependencias");
      }
      // Una tarea ya avanzada no puede quedar con una dependencia sin completar.
      if (EXIGEN_DEPS_COMPLETAS.includes(antes.estado) && dep.estado !== "completada") {
        throw new ProyectoError("dependencias_incompletas");
      }
      const despues: TareaRegistro = { ...antes, deps: [...antes.deps, depId] };
      await this.guardar(despues);
      await this.auditar(ctx, "tarea:dependencia_agregar", `tarea:${tareaId}`, antes, despues);
      return despues;
    });
  }

  quitarDependencia(ctx: ContextoAcceso, tareaId: string, depId: string): Promise<TareaRegistro> {
    return this.mutar(async () => {
      await this.exigir(ctx, "tarea:editar", `tarea:${tareaId}`);
      const antes = await this.tarea(ctx, tareaId);
      this.exigirAbierto(await this.proyecto(ctx, antes.proyectoId));
      if (!antes.deps.includes(depId)) throw new ProyectoError("no_encontrado");
      const despues: TareaRegistro = { ...antes, deps: antes.deps.filter((d) => d !== depId) };
      await this.guardar(despues);
      await this.auditar(ctx, "tarea:dependencia_quitar", `tarea:${tareaId}`, antes, despues);
      return despues;
    });
  }

  // --- internos -----------------------------------------------------------

  private mutar<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.cola.then(fn);
    this.cola = r.catch(() => undefined);
    return r;
  }

  /** Comprueba el rol con can(); si falla, audita la denegacion y lanza. */
  private async exigir(ctx: ContextoAcceso, accion: Accion, entidad: string): Promise<void> {
    if (can(ctx.rol, accion)) return;
    await this.auditor.anexar({
      orgId: ctx.orgId,
      actor: ctx.usuarioId,
      accion: `${accion}_denegada`,
      entidad,
      despues: { motivo: "rol_insuficiente", rol: ctx.rol },
    });
    throw new ProyectoError("rol_insuficiente");
  }

  /** Busqueda acotada a la org del contexto: otra org equivale a no encontrado. */
  private async proyecto(ctx: ContextoAcceso, id: string): Promise<ProyectoRegistro> {
    const p = await this.repo.obtenerProyecto(ctx.orgId, id);
    if (!p) throw new ProyectoError("no_encontrado");
    return p;
  }

  private async tarea(ctx: ContextoAcceso, id: string): Promise<TareaRegistro> {
    const t = await this.repo.obtenerTarea(ctx.orgId, id);
    if (!t) throw new ProyectoError("no_encontrado");
    return t;
  }

  private exigirAbierto(p: ProyectoRegistro): void {
    if (p.estado === "archivado" || p.estado === "completado") {
      throw new ProyectoError("proyecto_cerrado");
    }
  }

  private async guardar(t: TareaRegistro): Promise<void> {
    if (!(await this.repo.guardarTarea(t))) throw new ProyectoError("no_encontrado");
  }

  private async auditar(
    ctx: ContextoAcceso,
    accion: string,
    entidad: string,
    antes: unknown,
    despues: unknown,
  ): Promise<void> {
    await this.auditor.anexar({
      orgId: ctx.orgId,
      actor: ctx.usuarioId,
      accion,
      entidad,
      antes,
      despues,
    });
  }
}
