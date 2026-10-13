import type { EventoTraza, InstantaneaOperacion } from "@/orchestration/traza/eventos";

/**
 * Estados operativos visibles de un agente.
 * - esperando: pausado por presupuesto a la espera de una decision.
 * - degradado: termino con sus tablas, pero el modelo no produjo comentario.
 */
export type EstadoAgenteOperacion =
  | "inactivo" | "trabajando" | "esperando" | "completado" | "degradado" | "sin_datos" | "error";
export const IDS_AGENTES_OPERACION = ["control-estadistica", "cartera", "datos", "tesorero", "presupuestista", "contador", "pagador", "cajero-mayor", "rentas", "coactiva", "director", "planificacion"] as const;
export type IdAgenteOperacion = (typeof IDS_AGENTES_OPERACION)[number];

export interface EstadoOperacionUi {
  instantanea: InstantaneaOperacion | null;
  eventos: EventoTraza[];
  ultimaSecuencia: number;
}

export const estadoInicialOperacion: EstadoOperacionUi = { instantanea: null, eventos: [], ultimaSecuencia: 0 };

export function combinarEventos(actuales: readonly EventoTraza[], nuevos: readonly EventoTraza[]): EventoTraza[] {
  const porSecuencia = new Map(actuales.map((evento) => [evento.secuencia, evento]));
  for (const evento of nuevos) if (!porSecuencia.has(evento.secuencia)) porSecuencia.set(evento.secuencia, evento);
  return [...porSecuencia.values()].sort((a, b) => a.secuencia - b.secuencia);
}

export function aplicarInstantanea(actual: EstadoOperacionUi, instantanea: InstantaneaOperacion): EstadoOperacionUi {
  const eventos = combinarEventos(actual.eventos, instantanea.eventos);
  return { instantanea: { ...instantanea, eventos }, eventos, ultimaSecuencia: eventos.at(-1)?.secuencia ?? 0 };
}

export function aplicarEvento(actual: EstadoOperacionUi, evento: EventoTraza): EstadoOperacionUi {
  const eventos = combinarEventos(actual.eventos, [evento]);
  return { ...actual, eventos, ultimaSecuencia: eventos.at(-1)?.secuencia ?? actual.ultimaSecuencia };
}

export function estadosAgentes(eventos: readonly EventoTraza[]): Record<IdAgenteOperacion, EstadoAgenteOperacion> {
  const estados = Object.fromEntries(IDS_AGENTES_OPERACION.map((id) => [id, "inactivo"])) as Record<IdAgenteOperacion, EstadoAgenteOperacion>;
  for (const evento of eventos) {
    if (!evento.agenteId || !(evento.agenteId in estados)) continue;
    const id = evento.agenteId as IdAgenteOperacion;
    if (evento.tipo === "error" || evento.estado === "fallido") {
      estados[id] = evento.detalle?.codigo === "presupuesto_pausado" ? "esperando" : "error";
    } else if (evento.estado === "sin_datos") estados[id] = "sin_datos";
    else if (evento.estado === "completado" || (evento.tipo === "entregable" && estados[id] !== "sin_datos" && estados[id] !== "error")) {
      estados[id] = evento.detalle?.falloModelo === true ? "degradado" : "completado";
    }
    else if (evento.tipo === "agente_inicia" || evento.estado === "en_curso") estados[id] = "trabajando";
    if (evento.tipo === "traspaso" && estados[id] === "trabajando") estados[id] = "completado";
  }
  return estados;
}

export const ultimoTraspaso = (eventos: readonly EventoTraza[]) =>
  [...eventos].reverse().find((evento) => evento.tipo === "traspaso" && evento.agenteId && evento.haciaAgenteId) ?? null;

export const agentesInvolucrados = (eventos: readonly EventoTraza[]) =>
  new Set(eventos.flatMap((evento) => [evento.agenteId, evento.haciaAgenteId].filter((id): id is string => Boolean(id)))).size;

export const totalTokens = (eventos: readonly EventoTraza[]) =>
  eventos.reduce((total, evento) => total + (evento.tokens?.entrada ?? 0) + (evento.tokens?.salida ?? 0), 0);
