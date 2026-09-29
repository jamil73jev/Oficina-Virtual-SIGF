import type { Agente, Tarea } from "@/types";

/** Estimacion o consumo de una llamada. */
export interface Uso {
  tokens: number;
  costo: number;
  iteraciones: number;
}

export type AmbitoGuard = "org" | "proyecto" | "agente";

export interface EstadoPresupuesto {
  ambito: AmbitoGuard;
  tope: Uso;
  consumido: Uso;
}

export type ResultadoGuard =
  | { ok: true; siguiente: EstadoPresupuesto[]; avisos: AmbitoGuard[] }
  | { ok: false; excedidos: AmbitoGuard[] };

/** Guard: se invoca antes de cada llamada, en ambitos agente, proyecto y org. */
export type PresupuestoGuard = (
  ambitos: readonly EstadoPresupuesto[],
  estimado: Uso,
) => ResultadoGuard;

export interface SolicitudEjecucion {
  orgId: string;
  agente: Agente;
  tarea: Tarea;
  /** Referencias a artefactos (no transcripciones). */
  referencias: string[];
  profundidad: number;
}

export interface ResultadoEjecucion {
  resumen: string;
  /** Artefacto devuelto por referencia. */
  documentoRef: string | null;
  uso: Uso;
}

/** Interfaz que aisla el runtime (AI SDK + Gateway + Workflow) para poder cambiarlo. */
export interface AgentRuntime {
  ejecutar(solicitud: SolicitudEjecucion): Promise<ResultadoEjecucion>;
  pausar(ejecucionId: string): Promise<void>;
  reanudar(ejecucionId: string, aprobacionId?: string): Promise<void>;
  cancelar(ejecucionId: string): Promise<void>;
}
