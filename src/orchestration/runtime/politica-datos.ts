import type { Auditor } from "@/core/audit";
import { permitirModelo, type ModoDatos } from "@/core/datos";
import type { ModeloLenguaje } from "./modelo";

/** La politica de clasificacion de datos impide usar este modelo; no se llamo al modelo. */
export class ModeloNoPermitidoError extends Error {
  constructor(
    readonly modeloId: string,
    readonly motivo: string,
  ) {
    super(`Modelo "${modeloId}" no permitido: ${motivo}`);
    this.name = "ModeloNoPermitidoError";
  }
}

/**
 * Punto unico de aplicacion de la politica de datos antes de invocar un ModeloLenguaje.
 * Por defecto modoDatos es "real" (falla cerrado). Si se rechaza, audita y lanza
 * ModeloNoPermitidoError; quien llama NO debe llamar al modelo.
 *
 * Inventario de llamadas directas al puerto ModeloLenguaje (verificado con Grep de
 * `.generarTexto(` / `.generarObjeto(` en src, excluyendo tests y el adaptador):
 *  - runtime/agent-runtime.ts        -> generarTexto   (protegido con esta funcion)
 *  - orchestrator/index.ts           -> generarObjeto  (protegido con esta funcion)
 *  - modules/operaciones/servicio.ts -> generarObjeto (plan del Director) y generarTexto
 *                                       (comentario de cada paso); cada una precedida de esta funcion
 *  - modules/agentes-area/ejecutar.ts -> generarTexto (comentario de la consulta), protegido
 *  - subagents/index.ts              -> no llama al modelo; delega en AgentRuntime (protegido)
 * Toda llamada nueva al modelo debe pasar por aqui.
 */
export async function exigirModeloPermitido(
  deps: { modelo: ModeloLenguaje; auditor: Auditor; modoDatos?: ModoDatos },
  c: { orgId: string; actor: string; agenteId: string; entidad: string },
): Promise<void> {
  const modoDatos = deps.modoDatos ?? "real";
  const politica = permitirModelo(modoDatos, deps.modelo.alojamiento);
  if (politica.permitido) return;
  await deps.auditor.anexar({
    orgId: c.orgId,
    actor: c.actor,
    accion: "modelo.rechazado_politica_datos",
    entidad: c.entidad,
    despues: {
      agenteId: c.agenteId,
      modelo: deps.modelo.id,
      alojamiento: deps.modelo.alojamiento,
      modoDatos,
      motivo: politica.motivo,
    },
  });
  throw new ModeloNoPermitidoError(deps.modelo.id, politica.motivo);
}
