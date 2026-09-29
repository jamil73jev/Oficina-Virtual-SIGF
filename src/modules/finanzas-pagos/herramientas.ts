import type { z } from "zod";
import type { ResultadoCalculo } from "@/modules/finanzas";
import { EntradaArqueoCaja, EntradaProductividadCajas, arqueoCaja, productividadCajas } from "./cajas";
import {
  EntradaProgramarPagos,
  EntradaResumenOrdenesPago,
  EntradaValidarOrdenPago,
  programarPagos,
  resumenOrdenesPago,
  validarOrdenPago,
} from "./pagaduria";

export interface HerramientaPagos<E extends z.ZodType, R> {
  descripcion: string;
  esquemaEntrada: E;
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>;
}

function herramienta<E extends z.ZodType, R>(
  esquemaEntrada: E,
  funcion: (entrada: z.output<E>) => ResultadoCalculo<R>,
  descripcion: string,
): HerramientaPagos<E, R> {
  return { descripcion, esquemaEntrada, funcion };
}

export const HERRAMIENTAS_PAGOS = {
  validar_orden_pago: herramienta(
    EntradaValidarOrdenPago,
    validarOrdenPago,
    "Valida cuenta, valor, partida, disponibilidad y duplicados; no aprueba ni modifica la orden.",
  ),
  programar_pagos: herramienta(
    EntradaProgramarPagos,
    programarPagos,
    "Propone pagos por antiguedad dentro de un tope de liquidez; nunca ejecuta el pago.",
  ),
  resumen_ordenes_pago: herramienta(
    EntradaResumenOrdenesPago,
    resumenOrdenesPago,
    "Resume cantidad y valor de todas las ordenes por estado sin excluir registros.",
  ),
  arqueo_caja: herramienta(
    EntradaArqueoCaja,
    arqueoCaja,
    "Compara contado fisico con fondo y recaudacion del sistema; reporta abiertos aparte.",
  ),
  productividad_cajas: herramienta(
    EntradaProductividadCajas,
    productividadCajas,
    "Agrupa operaciones y valor por caja, cajero, sede y franja horaria.",
  ),
} as const;

export type NombreHerramientaPagos = keyof typeof HERRAMIENTAS_PAGOS;

