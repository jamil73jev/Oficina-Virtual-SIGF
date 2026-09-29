import type { z } from "zod";
import type { ResultadoCalculo } from "@/modules/finanzas";
import {
  EntradaAlertasDesviacion,
  EntradaAvanceVsMeta,
  EntradaComparativoInteranual,
  EntradaConsolidarEntidades,
  EntradaProyeccionEscenarios,
  EntradaTableroEjecutivo,
  alertasDesviacion,
  avanceVsMeta,
  comparativoInteranual,
  consolidarEntidades,
  proyeccionEscenarios,
  tableroEjecutivo,
} from "./calculadoras";

export interface HerramientaDireccion<E extends z.ZodType, R> {
  descripcion: string;
  esquemaEntrada: E;
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>;
}

function herramienta<E extends z.ZodType, R>(
  esquemaEntrada: E,
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>,
  descripcion: string,
): HerramientaDireccion<E, R> {
  return { descripcion, esquemaEntrada, funcion };
}

export const HERRAMIENTAS_DIRECCION = {
  avance_vs_meta: herramienta(EntradaAvanceVsMeta, avanceVsMeta, "Compara observado contra metas por indicador, periodo y tipo sin imputar faltantes."),
  comparativo_interanual: herramienta(EntradaComparativoInteranual, comparativoInteranual, "Calcula variacion contra el mismo periodo anterior y declara periodos faltantes."),
  consolidar_entidades: herramienta(EntradaConsolidarEntidades, consolidarEntidades, "Consolida reportes con corte homogeneo y elimina transferencias interinstitucionales."),
  proyeccion_escenarios: herramienta(EntradaProyeccionEscenarios, proyeccionEscenarios, "Proyecta base, optimista y pesimista con supuestos explicitos y sin aleatoriedad."),
  alertas_desviacion: herramienta(EntradaAlertasDesviacion, alertasDesviacion, "Detecta desviaciones superiores al umbral y compromisos vencidos."),
  tablero_ejecutivo: herramienta(EntradaTableroEjecutivo, tableroEjecutivo, "Resume indicadores ya calculados con un mismo corte, alertas y compromisos abiertos."),
} as const;

export type NombreHerramientaDireccion = keyof typeof HERRAMIENTAS_DIRECCION;
export const NOMBRES_HERRAMIENTAS_DIRECCION = Object.keys(HERRAMIENTAS_DIRECCION) as NombreHerramientaDireccion[];

