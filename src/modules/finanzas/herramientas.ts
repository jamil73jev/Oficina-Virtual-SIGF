import type { z } from "zod";
import type { ResultadoCalculo } from "./domain";
import { EntradaCalidadDatos, EntradaContarUnicos, calidadDatos, contarUnicos } from "./calidad";
import {
  EntradaAntiguedadCartera,
  EntradaSaldoCartera,
  EntradaSegmentarPareto,
  antiguedadCartera,
  saldoCarteraPorTitulo,
  segmentarPareto,
} from "./cartera";
import { EntradaCruzarIdentificaciones, cruzarIdentificaciones } from "./cruces";
import { EntradaConciliarBanco, conciliarBanco } from "./conciliacion";
import { EntradaCompararCortes, compararCortes } from "./cortes";
import { EntradaRecaudacionNeta, recaudacionNeta } from "./recaudacion";

/** Herramientas de solo lectura: calculadoras puras con entrada validada por Zod. */
export interface HerramientaFinanzas<E extends z.ZodType, R> {
  descripcion: string;
  esquemaEntrada: E;
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>;
}

function herramienta<E extends z.ZodType, R>(
  esquemaEntrada: E,
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>,
  descripcion: string,
): HerramientaFinanzas<E, R> {
  return { descripcion, esquemaEntrada, funcion };
}

export const HERRAMIENTAS_FINANZAS = {
  recaudacion_neta: herramienta(
    EntradaRecaudacionNeta,
    recaudacionNeta,
    "Recaudacion bruta, reversos normales, reversos extemporaneos (aparte, no se restan otra vez) y neta.",
  ),
  saldo_cartera_por_titulo: herramienta(
    EntradaSaldoCartera,
    saldoCarteraPorTitulo,
    "Saldo de cartera por titulo unico; los juicios se listan sin duplicar el valor.",
  ),
  antiguedad_cartera: herramienta(
    EntradaAntiguedadCartera,
    antiguedadCartera,
    "Saldo de cartera por tramos de dias vencidos: 0-30, 31-90, 91-180, 181-360 y mas de 360.",
  ),
  segmentar_pareto: herramienta(
    EntradaSegmentarPareto,
    segmentarPareto,
    "Segmentacion ABC de la concentracion de deuda por clave (p. ej. contribuyente).",
  ),
  conciliar_banco: herramienta(
    EntradaConciliarBanco,
    conciliarBanco,
    "Concilia transacciones contra depositos: conciliado, pendiente, diferencias y depositos sin transaccion.",
  ),
  calidad_datos: herramienta(
    EntradaCalidadDatos,
    calidadDatos,
    "Calidad de contribuyentes (identificaciones, parroquia, sector, ubicacion) sin excluirlos del total.",
  ),
  cruzar_identificaciones: herramienta(
    EntradaCruzarIdentificaciones,
    cruzarIdentificaciones,
    "Cruce titulo-juicio: identificacion del contribuyente vs la del juicio (coincidente, diferente o no utilizable), un par por juicio.",
  ),
  comparar_cortes: herramienta(
    EntradaCompararCortes,
    compararCortes,
    "Compara mediciones de varias fuentes; en modo simultaneo falla si los cortes difieren.",
  ),
  contar_unicos: herramienta(
    EntradaContarUnicos,
    contarUnicos,
    "Cuenta unicos de grupos solapados mediante la union, sin sumar conteos por grupo.",
  ),
} as const;

export type NombreHerramientaFinanzas = keyof typeof HERRAMIENTAS_FINANZAS;

export const NOMBRES_HERRAMIENTAS_FINANZAS = Object.keys(HERRAMIENTAS_FINANZAS) as NombreHerramientaFinanzas[];

/** Valida la entrada cruda (p. ej. argumentos de un modelo) y ejecuta la calculadora. */
export function ejecutarHerramientaFinanzas(nombre: NombreHerramientaFinanzas, entrada: unknown): ResultadoCalculo<unknown> {
  const h: HerramientaFinanzas<z.ZodType, unknown> = HERRAMIENTAS_FINANZAS[nombre] as HerramientaFinanzas<
    z.ZodType,
    unknown
  >;
  return h.funcion(h.esquemaEntrada.parse(entrada));
}
