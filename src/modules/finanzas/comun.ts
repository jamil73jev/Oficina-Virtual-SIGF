import { z } from "zod";
import type { Corte, Pago, Reverso } from "./domain";

/** Utilidades compartidas por las calculadoras. Los montos se suman en centavos enteros. */

export const fechaEntrada = z.coerce.date();

export const aCentavos = (valor: number): number => Math.round(valor * 100);
export const aDolares = (centavos: number): number => centavos / 100;

const MS_DIA = 86_400_000;
const diaUTC = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Dias calendario (UTC) de `desde` a `hasta`; negativo si `hasta` es anterior. */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((diaUTC(hasta) - diaUTC(desde)) / MS_DIA);
}

export const fechaISO = (d: Date): string => d.toISOString().slice(0, 10);

export const hastaElCorte = (d: Date, corte: Corte): boolean => diasEntre(d, corte.fechaCorte) >= 0;

export function dentroDeRango(d: Date, desde?: Date, hasta?: Date): boolean {
  if (desde && diasEntre(desde, d) < 0) return false;
  if (hasta && diasEntre(d, hasta) < 0) return false;
  return true;
}

export function filtrosDeCorte(corte: Corte, desde?: Date, hasta?: Date): string[] {
  const filtros = [`fecha <= ${fechaISO(corte.fechaCorte)} (corte ${corte.periodo}, ${corte.horaExtraccion})`];
  if (desde) filtros.push(`fecha >= ${fechaISO(desde)}`);
  if (hasta) filtros.push(`fecha <= ${fechaISO(hasta)}`);
  return filtros;
}

export interface MovimientoPago {
  pago: Pago;
  brutoCentavos: number;
  reversosNormalesCentavos: number;
  reversosExtemporaneosCentavos: number;
  cantidadNormales: number;
  cantidadExtemporaneos: number;
}

export interface MovimientosPagos {
  porPago: Map<string, MovimientoPago>;
  reversosSinPago: Reverso[];
}

/**
 * Agrupa los reversos (fecha <= corte) bajo su pago. Pagos fuera del corte o del rango quedan
 * fuera, y sus reversos se informan como `reversosSinPago` en lugar de restarse.
 */
export function movimientosPorPago(
  pagos: readonly Pago[],
  reversos: readonly Reverso[],
  corte: Corte,
  desde?: Date,
  hasta?: Date,
): MovimientosPagos {
  const porPago = new Map<string, MovimientoPago>();
  for (const pago of pagos) {
    if (!hastaElCorte(pago.fechaPago, corte) || !dentroDeRango(pago.fechaPago, desde, hasta)) continue;
    if (porPago.has(pago.id)) continue; // el id del pago es llave unica
    porPago.set(pago.id, {
      pago,
      brutoCentavos: aCentavos(pago.valorBruto),
      reversosNormalesCentavos: 0,
      reversosExtemporaneosCentavos: 0,
      cantidadNormales: 0,
      cantidadExtemporaneos: 0,
    });
  }
  const reversosSinPago: Reverso[] = [];
  const vistos = new Set<string>();
  for (const reverso of reversos) {
    if (vistos.has(reverso.id) || !hastaElCorte(reverso.fecha, corte)) continue;
    vistos.add(reverso.id);
    const mov = porPago.get(reverso.pagoId);
    if (!mov) {
      reversosSinPago.push(reverso);
      continue;
    }
    if (reverso.extemporaneo) {
      mov.reversosExtemporaneosCentavos += aCentavos(reverso.valor);
      mov.cantidadExtemporaneos++;
    } else {
      mov.reversosNormalesCentavos += aCentavos(reverso.valor);
      mov.cantidadNormales++;
    }
  }
  return { porPago, reversosSinPago };
}

export const proporcion = (parte: number, total: number): number =>
  total === 0 ? 0 : Math.round((parte / total) * 10_000) / 10_000;
