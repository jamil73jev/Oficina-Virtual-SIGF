import type { z } from "zod";
import type { HerramientaFinanzas, ResultadoCalculo } from "@/modules/finanzas";
import { EntradaRecuperacionCoactiva, EntradaResumenCoactiva, recuperacionCoactiva, resumenCoactiva } from "./coactiva";
import { EntradaEmisionPorRubro, emisionPorRubro } from "./emision";
import { EntradaEstadoVigente, estadoVigenteAlCorte } from "./estado";
import { EntradaEfectoResoluciones, efectoResoluciones } from "./resoluciones";

function herramienta<E extends z.ZodType, R>(
  esquemaEntrada: E,
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>,
  descripcion: string,
): HerramientaFinanzas<E, R> {
  return { descripcion, esquemaEntrada, funcion };
}

/** Herramientas de solo lectura de Rentas y Coactiva; solo proponen, nunca cambian estados. */
export const HERRAMIENTAS_RENTAS = {
  emision_por_rubro: herramienta(
    EntradaEmisionPorRubro,
    emisionPorRubro,
    "Titulos y valor emitido por rubro, tipo (tributario o no tributario) y periodo, sin duplicar el valor de un titulo.",
  ),
  efecto_resoluciones: herramienta(
    EntradaEfectoResoluciones,
    efectoResoluciones,
    "Efecto de las resoluciones vigentes hasta el corte sobre el saldo y el estado propuesto de cada obligacion; ignora las posteriores al corte.",
  ),
  estado_vigente_al_corte: herramienta(
    EntradaEstadoVigente,
    estadoVigenteAlCorte,
    "Reconstruye el estado de cada titulo a la fecha de corte desde su historial, no desde el estado actual.",
  ),
  resumen_coactiva: herramienta(
    EntradaResumenCoactiva,
    resumenCoactiva,
    "Por titulo: ultimo juicio para la vista analitica, conteo de juicios e historial completo; el valor del titulo se cuenta una sola vez.",
  ),
  recuperacion_coactiva: herramienta(
    EntradaRecuperacionCoactiva,
    recuperacionCoactiva,
    "Pagos posteriores al ingreso a coactiva, saldo al corte y porcentaje recuperado de las obligaciones en coactiva.",
  ),
} as const;

export type NombreHerramientaRentas = keyof typeof HERRAMIENTAS_RENTAS;

export const NOMBRES_HERRAMIENTAS_RENTAS = Object.keys(HERRAMIENTAS_RENTAS) as NombreHerramientaRentas[];

/** Valida la entrada cruda (p. ej. argumentos de un modelo) y ejecuta la calculadora. */
export function ejecutarHerramientaRentas(nombre: NombreHerramientaRentas, entrada: unknown): ResultadoCalculo<unknown> {
  const h = HERRAMIENTAS_RENTAS[nombre] as HerramientaFinanzas<z.ZodType, unknown>;
  return h.funcion(h.esquemaEntrada.parse(entrada));
}
