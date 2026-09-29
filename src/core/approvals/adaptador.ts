import type {
  PedidoAprobacion,
  SolicitarAprobacion,
} from "@/orchestration/ports";
import type { ServicioAprobaciones } from "./service";

export interface OpcionesAdaptador {
  /** Tiempo maximo que una solicitud espera decision humana antes de expirar (rechazo). */
  vigenciaMs?: number;
  /** Intervalo de consulta del estado. */
  sondeoMs?: number;
  ahora?: () => Date;
  dormir?: (ms: number) => Promise<void>;
}

const VIGENCIA_POR_DEFECTO_MS = 24 * 60 * 60 * 1000;
const SONDEO_POR_DEFECTO_MS = 2_000;

/**
 * Conecta el puerto SolicitarAprobacion del orquestador con ServicioAprobaciones.
 * Fail-closed: expirada o desconocida cuenta como rechazo. El sondeo es una
 * solucion provisional hasta el workflow durable, que suspendera sin consultar.
 */
export function crearSolicitarAprobacion(
  servicio: ServicioAprobaciones,
  opciones: OpcionesAdaptador = {},
): SolicitarAprobacion {
  const vigenciaMs = opciones.vigenciaMs ?? VIGENCIA_POR_DEFECTO_MS;
  const sondeoMs = opciones.sondeoMs ?? SONDEO_POR_DEFECTO_MS;
  const ahora = opciones.ahora ?? (() => new Date());
  const dormir =
    opciones.dormir ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  return async (pedido: PedidoAprobacion) => {
    const registro = await servicio.solicitar(
      {
        orgId: pedido.orgId,
        ejecucionId: pedido.ejecucionId,
        tipo: pedido.tipo,
        datos: { ...pedido.payload, tareaId: pedido.tareaId },
      },
      pedido.riesgo,
      new Date(ahora().getTime() + vigenciaMs),
    );

    for (;;) {
      const actual = await servicio.obtener(pedido.orgId, registro.id);
      if (!actual) return "rechazada";
      if (actual.estado === "aprobada") return "aprobada";
      if (actual.estado === "rechazada") return "rechazada";
      if (actual.estado === "expirada") return "expirada";
      await dormir(sondeoMs);
    }
  };
}
