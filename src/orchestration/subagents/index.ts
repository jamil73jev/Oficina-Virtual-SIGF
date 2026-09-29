import type { Agente } from "@/types";
import type { TareaOrq } from "../ports";
import type { AgentRuntime, Uso } from "../runtime";

/** Lo unico que un subagente devuelve al orquestador: resumen + artefacto por referencia. */
export interface ResultadoSubagente {
  resumen: string;
  documentoRef: string | null;
  uso: Uso;
}

export interface PeticionSubagente {
  orgId: string;
  agente: Agente;
  tarea: TareaOrq;
  /** Artefactos de dependencias (referencias, no contenido). */
  referencias: string[];
  /** Fallos de QA del intento anterior, si es un reintento. */
  fallosPrevios?: string[];
  profundidad: number;
}

/**
 * Contexto aislado: el subagente solo recibe la tarea, referencias y (si reintenta) los
 * criterios incumplidos. No ve el objetivo global, otras tareas ni conversaciones previas.
 */
export async function ejecutarSubagente(
  runtime: AgentRuntime,
  p: PeticionSubagente,
): Promise<ResultadoSubagente> {
  const referencias = [
    ...p.referencias,
    ...(p.fallosPrevios ?? []).map((f) => `qa_fallo:${f}`),
  ];
  const r = await runtime.ejecutar({
    orgId: p.orgId,
    agente: p.agente,
    tarea: p.tarea,
    referencias,
    profundidad: p.profundidad,
  });
  return { resumen: r.resumen, documentoRef: r.documentoRef, uso: r.uso };
}
