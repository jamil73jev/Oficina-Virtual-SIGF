import { diasEntre, type Corte } from "@/modules/finanzas";

/** Utilidades de las calculadoras contables. Los montos se suman en centavos enteros. */

export const aCentavos = (valor: number): number => Math.round(valor * 100);
export const aDolares = (centavos: number): number => centavos / 100;
export const sumarCentavos = (valores: readonly number[]): number => valores.reduce((acc, v) => acc + aCentavos(v), 0);

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

/** Proporcion con 4 decimales; null si el denominador no es positivo (no se inventa un porcentaje). */
export const proporcion = (parte: number, total: number): number | null =>
  total <= 0 ? null : Math.round((parte / total) * 10_000) / 10_000;

/** Conserva el primer registro de cada id y devuelve aparte los ids repetidos (sin ocultarlos). */
export function unicosPorId<T extends { id: string }>(registros: readonly T[]): { unicos: T[]; duplicados: string[] } {
  const vistos = new Map<string, T>();
  const duplicados = new Set<string>();
  for (const r of registros) {
    if (vistos.has(r.id)) duplicados.add(r.id);
    else vistos.set(r.id, r);
  }
  return { unicos: [...vistos.values()], duplicados: [...duplicados].sort() };
}
