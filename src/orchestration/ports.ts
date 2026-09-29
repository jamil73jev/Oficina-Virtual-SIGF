import type { z } from "zod";
import type { Riesgo, Tarea } from "@/types";

export type NivelRiesgo = z.infer<typeof Riesgo>;

export type DecisionAprobacion = "aprobada" | "rechazada" | "expirada";

export interface PedidoAprobacion {
  orgId: string;
  ejecucionId: string;
  tareaId: string;
  /** Ej.: "herramienta:enviar_correo". */
  tipo: string;
  riesgo: NivelRiesgo;
  payload: Record<string, unknown>;
}

/**
 * Puerto de aprobacion humana. La implementacion real (otro modulo) crea la `aprobacion`,
 * suspende el workflow y resuelve cuando un humano decide o expira (expira a rechazo).
 * El runtime lo invoca ante riesgo "irreversible" y no ejecuta nada hasta recibir "aprobada".
 */
export type SolicitarAprobacion = (
  pedido: PedidoAprobacion,
) => Promise<DecisionAprobacion>;

/** Tarea del contrato mas el detalle que necesita el orquestador. */
export type TareaOrq = Tarea & {
  titulo: string;
  descripcion: string;
  rolAgente: string;
};

export interface RepositorioTareas {
  crear(tareas: TareaOrq[]): Promise<void>;
  obtener(orgId: string, id: string): Promise<TareaOrq | null>;
  actualizar(
    orgId: string,
    id: string,
    cambios: Partial<Pick<TareaOrq, "estado" | "agenteId">>,
  ): Promise<TareaOrq>;
  listarPorProyecto(orgId: string, proyectoId: string): Promise<TareaOrq[]>;
}

export interface NuevoArtefacto {
  orgId: string;
  proyectoId: string;
  tareaId: string;
  tipo: string;
  contenido: string;
}

/** Los artefactos viajan por referencia, nunca por transcripcion. */
export interface AlmacenArtefactos {
  guardar(a: NuevoArtefacto): Promise<string>;
  /** null si no existe o pertenece a otra organizacion. */
  leer(orgId: string, ref: string): Promise<string | null>;
}
