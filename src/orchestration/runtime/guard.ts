import type { EstadoPresupuesto, PresupuestoGuard, Uso } from "./types";

export const UMBRAL_AVISO = 0.8;

const DIMENSIONES = ["tokens", "costo", "iteraciones"] as const;

const sumar = (a: Uso, b: Uso): Uso => ({
  tokens: a.tokens + b.tokens,
  costo: a.costo + b.costo,
  iteraciones: a.iteraciones + b.iteraciones,
});

/**
 * Guard puro: reserva `estimado` en todos los ambitos o en ninguno (en BD se traduce a
 * `UPDATE ... WHERE consumido+est <= tope`). No muta la entrada.
 * Fail-closed: un tope 0 (o negativo / no finito) NO significa "sin tope": bloquea todo
 * consumo positivo en esa dimension. Un limite alto debe ser explicito.
 */
export const reservar: PresupuestoGuard = (ambitos, estimado) => {
  const excedidos = ambitos
    .filter((a) =>
      DIMENSIONES.some((d) => !(a.consumido[d] + estimado[d] <= Math.max(a.tope[d], 0))),
    )
    .map((a) => a.ambito);
  if (excedidos.length > 0) return { ok: false, excedidos };

  const siguiente: EstadoPresupuesto[] = ambitos.map((a) => ({
    ...a,
    consumido: sumar(a.consumido, estimado),
  }));
  const avisos = siguiente
    .filter((a) =>
      DIMENSIONES.some((d) => a.tope[d] > 0 && a.consumido[d] >= a.tope[d] * UMBRAL_AVISO),
    )
    .map((a) => a.ambito);
  return { ok: true, siguiente, avisos };
};
