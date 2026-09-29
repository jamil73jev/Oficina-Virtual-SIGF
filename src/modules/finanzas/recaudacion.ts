import { z } from "zod";
import { Corte, OrigenRubro, Pago, Reverso, Rubro, Titulo, TipoRubro, type ResultadoCalculo } from "./domain";
import { aCentavos, aDolares, fechaEntrada, filtrosDeCorte, movimientosPorPago } from "./comun";

export const EntradaRecaudacionNeta = z.object({
  corte: Corte,
  pagos: z.array(Pago),
  reversos: z.array(Reverso).optional(),
  desde: fechaEntrada.optional(),
  hasta: fechaEntrada.optional(),
});
export type EntradaRecaudacionNeta = z.infer<typeof EntradaRecaudacionNeta>;

export interface RecaudacionNeta {
  bruto: number;
  reversosNormales: number;
  /** Columna informativa: ya se desconto en su periodo, no se resta otra vez. */
  reversosExtemporaneos: number;
  neto: number;
  cantidadPagos: number;
  cantidadReversosNormales: number;
  cantidadReversosExtemporaneos: number;
  /** Reversos cuyo pago no esta en el alcance (fuera de corte o de rango): no se restan. */
  reversosSinPago: { cantidad: number; valor: number };
}

export const FORMULA_RECAUDACION_NETA =
  "neto = SUM(pago.valorBruto) - SUM(reverso.valor WHERE extemporaneo = false); " +
  "reversosExtemporaneos = SUM(reverso.valor WHERE extemporaneo = true) se informa aparte y NO se resta";

export function recaudacionNeta(entrada: EntradaRecaudacionNeta): ResultadoCalculo<RecaudacionNeta> {
  const { corte, desde, hasta } = entrada;
  const { porPago, reversosSinPago } = movimientosPorPago(entrada.pagos, entrada.reversos ?? [], corte, desde, hasta);
  let bruto = 0;
  let normales = 0;
  let extemporaneos = 0;
  let cantNormales = 0;
  let cantExtemporaneos = 0;
  for (const mov of porPago.values()) {
    bruto += mov.brutoCentavos;
    normales += mov.reversosNormalesCentavos;
    extemporaneos += mov.reversosExtemporaneosCentavos;
    cantNormales += mov.cantidadNormales;
    cantExtemporaneos += mov.cantidadExtemporaneos;
  }
  return {
    valor: {
      bruto: aDolares(bruto),
      reversosNormales: aDolares(normales),
      reversosExtemporaneos: aDolares(extemporaneos),
      neto: aDolares(bruto - normales),
      cantidadPagos: porPago.size,
      cantidadReversosNormales: cantNormales,
      cantidadReversosExtemporaneos: cantExtemporaneos,
      reversosSinPago: {
        cantidad: reversosSinPago.length,
        valor: aDolares(reversosSinPago.reduce((acc, r) => acc + aCentavos(r.valor), 0)),
      },
    },
    fuente: corte.fuente,
    formula: FORMULA_RECAUDACION_NETA,
    filtros: [...filtrosDeCorte(corte, desde, hasta), "pago.id unico", "reverso.fecha <= corte"],
    corte,
  };
}

export const EntradaSepararIngresos = EntradaRecaudacionNeta.extend({
  titulos: z.array(Titulo),
  rubros: z.array(Rubro),
});
export type EntradaSepararIngresos = z.infer<typeof EntradaSepararIngresos>;

export interface IngresoPorRubro {
  rubroId: string;
  nombre: string | null;
  tipo: TipoRubro | null;
  origen: OrigenRubro | null;
  neto: number;
  cantidadPagos: number;
}

export interface SeparacionIngresos {
  propios: number;
  terceros: number;
  /** Pagos cuyo titulo o rubro no se encontro: se muestran, no se descartan. */
  sinClasificar: number;
  total: number;
  /** propios + terceros + sinClasificar === total (recaudacion neta). */
  cuadra: boolean;
  porRubro: IngresoPorRubro[];
}

/** Separa la recaudacion neta en ingresos propios y fondos de terceros, conciliable con el total. */
export function separarIngresosPorOrigen(entrada: EntradaSepararIngresos): ResultadoCalculo<SeparacionIngresos> {
  const { corte, desde, hasta } = entrada;
  const { porPago } = movimientosPorPago(entrada.pagos, entrada.reversos ?? [], corte, desde, hasta);
  const titulos = new Map(entrada.titulos.map((t) => [t.id, t]));
  const rubros = new Map(entrada.rubros.map((r) => [r.id, r]));
  const acumulado = { propio: 0, tercero: 0, sinClasificar: 0 };
  const porRubro = new Map<string, { centavos: number; cantidad: number }>();
  let total = 0;
  for (const mov of porPago.values()) {
    const neto = mov.brutoCentavos - mov.reversosNormalesCentavos;
    total += neto;
    const rubroId = titulos.get(mov.pago.tituloId)?.rubroId;
    const rubro = rubroId === undefined ? undefined : rubros.get(rubroId);
    acumulado[rubro?.origen ?? "sinClasificar"] += neto;
    const clave = rubroId ?? "(titulo no encontrado)";
    const fila = porRubro.get(clave) ?? { centavos: 0, cantidad: 0 };
    fila.centavos += neto;
    fila.cantidad++;
    porRubro.set(clave, fila);
  }
  return {
    valor: {
      propios: aDolares(acumulado.propio),
      terceros: aDolares(acumulado.tercero),
      sinClasificar: aDolares(acumulado.sinClasificar),
      total: aDolares(total),
      cuadra: acumulado.propio + acumulado.tercero + acumulado.sinClasificar === total,
      porRubro: [...porRubro.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([rubroId, fila]) => {
          const rubro = rubros.get(rubroId);
          return {
            rubroId,
            nombre: rubro?.nombre ?? null,
            tipo: rubro?.tipo ?? null,
            origen: rubro?.origen ?? null,
            neto: aDolares(fila.centavos),
            cantidadPagos: fila.cantidad,
          };
        }),
    },
    fuente: corte.fuente,
    formula:
      "neto_pago = pago.valorBruto - SUM(reversos no extemporaneos); " +
      "propios = SUM(neto_pago WHERE rubro.origen = propio); terceros = SUM(neto_pago WHERE rubro.origen = tercero); " +
      "propios + terceros + sinClasificar = recaudacion neta",
    filtros: [...filtrosDeCorte(corte, desde, hasta), "pago -> titulo -> rubro por id"],
    corte,
  };
}
