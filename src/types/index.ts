import { z } from "zod";

/** Contratos Zod compartidos (docs/arquitectura.md). Todo dato de negocio lleva orgId. */

const id = z.uuid();
const fecha = z.coerce.date();

export const Rol = z.enum(["owner", "admin", "supervisor", "viewer"]);
export const AutorTipo = z.enum(["humano", "agente"]);
export const AmbitoPresupuesto = z.enum(["org", "proyecto", "agente"]);
export const Riesgo = z.enum(["lectura", "escritura_reversible", "irreversible"]);
export const EstadoAprobacion = z.enum(["pendiente", "aprobada", "rechazada", "expirada"]);
export const EstadoEjecucion = z.enum([
  "pendiente",
  "en_curso",
  "pausada",
  "completada",
  "fallida",
  "cancelada",
]);
export const EstadoTarea = z.enum([
  "pendiente",
  "asignada",
  "en_curso",
  "en_verificacion",
  "completada",
  "fallida",
  "bloqueada",
]);
export const EstadoProyecto = z.enum(["borrador", "activo", "pausado", "completado", "archivado"]);
export const EstadoAgente = z.enum(["activo", "inactivo", "pausado"]);

export const Organizacion = z.object({
  id,
  nombre: z.string().min(1),
  huso: z.string().min(1),
  moneda: z.string().length(3),
  locale: z.string().min(2),
});

export const Usuario = z.object({ id, email: z.email(), mfa: z.boolean() });

export const Membresia = z.object({ usuarioId: id, orgId: id, rol: Rol });

export const Agente = z.object({
  id,
  orgId: id,
  rol: z.string().min(1),
  skills: z.array(z.string()),
  herramientasPermitidas: z.array(z.string()),
  modelo: z.string().min(1),
  presupuestoId: id.nullable(),
  estado: EstadoAgente,
  promptVersion: z.number().int().nonnegative(),
});

export const Proyecto = z.object({
  id,
  orgId: id,
  objetivo: z.string().min(1),
  estado: EstadoProyecto,
  presupuestoId: id.nullable(),
  ownerId: id,
});

export const Tarea = z.object({
  id,
  orgId: id,
  proyectoId: id,
  padreId: id.nullable(),
  agenteId: id.nullable(),
  estado: EstadoTarea,
  criteriosVerificacion: z.array(z.string()),
  deps: z.array(id),
});

export const Documento = z.object({
  id,
  orgId: id,
  proyectoId: id,
  tareaId: id.nullable(),
  blobUrl: z.url(),
  hash: z.string().min(1),
  version: z.number().int().positive(),
  tipo: z.string().min(1),
});

export const Mensaje = z.object({
  id,
  orgId: id,
  proyectoId: id,
  hilo: z.string().min(1),
  autorTipo: AutorTipo,
  autorId: id,
  contenido: z.string(),
});

export const Ejecucion = z.object({
  id,
  orgId: id,
  tareaId: id,
  agenteId: id,
  padreEjecucionId: id.nullable(),
  workflowRunId: z.string().nullable(),
  modelo: z.string().min(1),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  tokensCache: z.number().int().nonnegative(),
  costo: z.number().nonnegative(),
  estado: EstadoEjecucion,
  resumen: z.string().nullable(),
});

export const Aprobacion = z.object({
  id,
  orgId: id,
  ejecucionId: id,
  tipo: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  riesgo: Riesgo,
  estado: EstadoAprobacion,
  decididoPor: id.nullable(),
  decididoEn: fecha.nullable(),
  expiraEn: fecha,
});

export const Auditoria = z.object({
  id,
  orgId: id,
  actor: z.string().min(1),
  accion: z.string().min(1),
  entidad: z.string().min(1),
  antes: z.unknown().nullable(),
  despues: z.unknown().nullable(),
  hashPrev: z.string().nullable(),
});

export const Presupuesto = z.object({
  id,
  orgId: id,
  ambito: AmbitoPresupuesto,
  topeTokens: z.number().int().nonnegative(),
  topeCosto: z.number().nonnegative(),
  topeIteraciones: z.number().int().nonnegative(),
  consumido: z.object({
    tokens: z.number().int().nonnegative(),
    costo: z.number().nonnegative(),
    iteraciones: z.number().int().nonnegative(),
  }),
  periodo: z.string().min(1),
});

export type Organizacion = z.infer<typeof Organizacion>;
export type Usuario = z.infer<typeof Usuario>;
export type Membresia = z.infer<typeof Membresia>;
export type Agente = z.infer<typeof Agente>;
export type Proyecto = z.infer<typeof Proyecto>;
export type Tarea = z.infer<typeof Tarea>;
export type Documento = z.infer<typeof Documento>;
export type Mensaje = z.infer<typeof Mensaje>;
export type Ejecucion = z.infer<typeof Ejecucion>;
export type Aprobacion = z.infer<typeof Aprobacion>;
export type Auditoria = z.infer<typeof Auditoria>;
export type Presupuesto = z.infer<typeof Presupuesto>;
