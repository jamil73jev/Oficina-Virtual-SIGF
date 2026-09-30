import { z } from "zod";

/**
 * CONTRATO de la Sala de operaciones: cada paso de una operacion (tarea que el usuario
 * encarga y que los agentes se van traspasando) se publica como un EventoTraza.
 * Lo produce ServicioOperaciones y lo consume la interfaz por SSE. No cambiar sin
 * acordarlo: la logica y la interfaz se construyen contra este archivo.
 */

export const TIPOS_EVENTO_TRAZA = [
  "operacion_creada",
  "plan_creado",
  "agente_inicia",
  "herramienta",
  "tabla",
  "traspaso",
  "aprobacion_pendiente",
  "aprobacion_resuelta",
  "qa",
  "comentario",
  "entregable",
  "operacion_finalizada",
  "error",
] as const;
export type TipoEventoTraza = (typeof TIPOS_EVENTO_TRAZA)[number];

export const ESTADOS_PASO = ["en_curso", "completado", "fallido", "sin_datos"] as const;
export type EstadoPaso = (typeof ESTADOS_PASO)[number];

export const EventoTraza = z.object({
  id: z.uuid(),
  orgId: z.string().min(1),
  /** Identificador de la operacion raiz (la tarea que encargo el usuario). */
  operacionId: z.uuid(),
  /** Numero creciente y contiguo por operacion (1, 2, 3...). Sirve de Last-Event-ID. */
  secuencia: z.number().int().positive(),
  ts: z.iso.datetime(),
  tipo: z.enum(TIPOS_EVENTO_TRAZA),
  /** Agente que actua (id del catalogo de agentes de area, p. ej. "cartera"). */
  agenteId: z.string().optional(),
  /** Solo en traspaso: agente que recibe el trabajo. */
  haciaAgenteId: z.string().optional(),
  ejecucionId: z.string().optional(),
  padreEjecucionId: z.string().nullable().optional(),
  /** Texto humano corto para la linea de tiempo, en el idioma de la operacion. */
  titulo: z.string().min(1).max(300),
  /** Datos del evento: nombre de herramienta, tablas, resumen del traspaso, etc. */
  detalle: z.record(z.string(), z.unknown()).optional(),
  estado: z.enum(ESTADOS_PASO).optional(),
  tokens: z.object({ entrada: z.number().int().nonnegative(), salida: z.number().int().nonnegative() }).optional(),
});
export type EventoTraza = z.infer<typeof EventoTraza>;

export const ESTADOS_OPERACION = ["en_curso", "completada", "parcial", "fallida", "sin_datos", "esperando_aprobacion"] as const;
export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];

/** Vista instantanea de una operacion (respuesta de GET /api/operaciones/[id]). */
export const InstantaneaOperacion = z.object({
  operacionId: z.uuid(),
  texto: z.string(),
  idioma: z.enum(["es", "en"]),
  estado: z.enum(ESTADOS_OPERACION),
  creadaEn: z.iso.datetime(),
  eventos: z.array(EventoTraza),
});
export type InstantaneaOperacion = z.infer<typeof InstantaneaOperacion>;

/** Formato SSE: `id: <secuencia>` / `event: traza` / `data: <EventoTraza en JSON>`. */
export const NOMBRE_EVENTO_SSE = "traza";

/** Puerto de publicacion y lectura de la traza (memoria hoy; Postgres y Realtime en la ola B). */
export interface PublicadorTraza {
  /** Asigna id, secuencia contigua y ts, guarda y notifica a los suscriptores. */
  publicar(evento: Omit<EventoTraza, "id" | "secuencia" | "ts">): Promise<EventoTraza>;
  /** Eventos de una operacion con secuencia mayor que `desdeSecuencia` (0 = todos). */
  listar(orgId: string, operacionId: string, desdeSecuencia?: number): Promise<EventoTraza[]>;
  /** Suscripcion en vivo; devuelve la funcion para cancelarla. Siempre aislada por orgId. */
  suscribir(orgId: string, operacionId: string, alRecibir: (evento: EventoTraza) => void): () => void;
}
