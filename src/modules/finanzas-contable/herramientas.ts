import type { z } from "zod";
import type { HerramientaFinanzas, ResultadoCalculo } from "@/modules/finanzas";
import { EntradaBalanceComprobacion, EntradaConciliacionContable, balanceComprobacion, conciliacionContable } from "./contabilidad";
import { EntradaCuadreFinContPres, cuadreFinContPres } from "./cuadre";
import {
  EntradaDisponibilidadPartida,
  EntradaEjecucionPresupuestaria,
  EntradaReformasCertificaciones,
  disponibilidadPartida,
  ejecucionPresupuestaria,
  reformasCertificaciones,
} from "./presupuesto";

/** Herramientas de solo lectura del presupuesto y la contabilidad; mismo formato que HERRAMIENTAS_FINANZAS. */
function herramienta<E extends z.ZodType, R>(
  esquemaEntrada: E,
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>,
  descripcion: string,
): HerramientaFinanzas<E, R> {
  return { descripcion, esquemaEntrada, funcion };
}

export const HERRAMIENTAS_CONTABLE = {
  ejecucion_presupuestaria: herramienta(
    EntradaEjecucionPresupuestaria,
    ejecucionPresupuestaria,
    "Codificado (asignado inicial + reformas al corte), porcentajes de certificado, comprometido, devengado y recaudado o pagado sobre el codificado, y desviaciones.",
  ),
  disponibilidad_partida: herramienta(
    EntradaDisponibilidadPartida,
    disponibilidadPartida,
    "Disponible = codificado - certificado por partida de gasto; alerta si es negativo y rechaza (en simulacion) solicitudes sin disponibilidad.",
  ),
  reformas_certificaciones: herramienta(
    EntradaReformasCertificaciones,
    reformasCertificaciones,
    "Resumen de reformas y certificaciones; verifica que los traspasos sumen 0, el equilibrio ingresos-gastos y lista certificaciones sin comprometer.",
  ),
  conciliacion_contable: herramienta(
    EntradaConciliacionContable,
    conciliacionContable,
    "Totales de asientos por origen frente a los totales de los subsistemas con el mismo corte; lista asientos descuadrados.",
  ),
  cuadre_fin_cont_pres: herramienta(
    EntradaCuadreFinContPres,
    cuadreFinContPres,
    "Matriz fuente vs conciliado vs contabilizado vs presupuestario; separa diferencias justificadas de pendientes por resolver.",
  ),
  balance_comprobacion: herramienta(
    EntradaBalanceComprobacion,
    balanceComprobacion,
    "Balance de comprobacion por cuenta: total debe = total haber, saldos segun naturaleza y asientos descuadrados.",
  ),
} as const;

export type NombreHerramientaContable = keyof typeof HERRAMIENTAS_CONTABLE;

export const NOMBRES_HERRAMIENTAS_CONTABLE = Object.keys(HERRAMIENTAS_CONTABLE) as NombreHerramientaContable[];

/** Valida la entrada cruda (p. ej. argumentos de un modelo) y ejecuta la calculadora. */
export function ejecutarHerramientaContable(nombre: NombreHerramientaContable, entrada: unknown): ResultadoCalculo<unknown> {
  const h = HERRAMIENTAS_CONTABLE[nombre] as HerramientaFinanzas<z.ZodType, unknown>;
  return h.funcion(h.esquemaEntrada.parse(entrada));
}
