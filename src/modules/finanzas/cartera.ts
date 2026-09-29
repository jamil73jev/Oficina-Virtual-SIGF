import { z } from "zod";
import {
  Corte,
  EstadoTitulo,
  FinanzasError,
  Juicio,
  Pago,
  Reverso,
  Titulo,
  type ResultadoCalculo,
} from "./domain";
import { aCentavos, aDolares, diasEntre, fechaISO, filtrosDeCorte, movimientosPorPago, proporcion } from "./comun";

const ESTADOS_EN_CARTERA_POR_DEFECTO: EstadoTitulo[] = ["emitido", "pagado", "en_cobranza", "en_coactiva"];

/**
 * Deja un solo registro por `Titulo.id`. Filas repetidas identicas (tipico de un cruce
 * titulo x juicio) se colapsan; si dos filas con el mismo id difieren, se lanza error.
 */
export function titulosUnicos(titulos: readonly Titulo[]): { unicos: Titulo[]; filasRepetidas: number } {
  const porId = new Map<string, Titulo>();
  let filasRepetidas = 0;
  for (const t of titulos) {
    const previo = porId.get(t.id);
    if (!previo) {
      porId.set(t.id, t);
      continue;
    }
    const iguales =
      previo.contribuyenteId === t.contribuyenteId &&
      previo.rubroId === t.rubroId &&
      aCentavos(previo.valorEmitido) === aCentavos(t.valorEmitido) &&
      previo.fechaEmision.getTime() === t.fechaEmision.getTime() &&
      previo.fechaVencimiento.getTime() === t.fechaVencimiento.getTime() &&
      previo.estado === t.estado;
    if (!iguales) throw new FinanzasError("titulo_duplicado_conflictivo", t.id);
    filasRepetidas++;
  }
  return { unicos: [...porId.values()], filasRepetidas };
}

export const EntradaSaldoCartera = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  pagos: z.array(Pago).optional(),
  reversos: z.array(Reverso).optional(),
  juicios: z.array(Juicio).optional(),
  /** Estados incluidos; por defecto todos menos `baja`. */
  estados: z.array(EstadoTitulo).optional(),
});
export type EntradaSaldoCartera = z.infer<typeof EntradaSaldoCartera>;

export interface SaldoTitulo {
  tituloId: string;
  contribuyenteId: string;
  rubroId: string;
  estado: EstadoTitulo;
  fechaEmision: Date;
  fechaVencimiento: Date;
  valorEmitido: number;
  pagadoNeto: number;
  saldo: number;
  saldoAFavor: number;
  /** Solo referencia: los juicios no suman valor. */
  juicios: string[];
}

export interface SaldoCartera {
  titulos: SaldoTitulo[];
  totalSaldo: number;
  totalSaldoAFavor: number;
  cantidadTitulos: number;
  titulosConJuicio: number;
  titulosConVariosJuicios: number;
  filasRepetidasDescartadas: number;
}

export const FORMULA_SALDO_TITULO =
  "saldo(titulo) = MAX(0, valorEmitido - (SUM(pago.valorBruto) - SUM(reverso.valor))) una vez por titulo.id; " +
  "los juicios se asocian por tituloId sin multiplicar el valor; totalSaldo = SUM(saldo) sobre titulos unicos";

export function saldoCarteraPorTitulo(entrada: EntradaSaldoCartera): ResultadoCalculo<SaldoCartera> {
  const { corte } = entrada;
  const estados = new Set(entrada.estados ?? ESTADOS_EN_CARTERA_POR_DEFECTO);
  const { unicos, filasRepetidas } = titulosUnicos(entrada.titulos);
  const { porPago } = movimientosPorPago(entrada.pagos ?? [], entrada.reversos ?? [], corte);

  const pagadoPorTitulo = new Map<string, number>();
  for (const mov of porPago.values()) {
    // Todo reverso (normal o extemporaneo) devuelve el valor a la deuda del titulo.
    const neto = mov.brutoCentavos - mov.reversosNormalesCentavos - mov.reversosExtemporaneosCentavos;
    pagadoPorTitulo.set(mov.pago.tituloId, (pagadoPorTitulo.get(mov.pago.tituloId) ?? 0) + neto);
  }

  const juiciosPorTitulo = new Map<string, Map<string, string>>();
  for (const j of entrada.juicios ?? []) {
    const porId = juiciosPorTitulo.get(j.tituloId) ?? new Map<string, string>();
    porId.set(j.id, j.codigo);
    juiciosPorTitulo.set(j.tituloId, porId);
  }

  const filas: SaldoTitulo[] = [];
  let totalSaldo = 0;
  let totalAFavor = 0;
  let conJuicio = 0;
  let conVarios = 0;
  for (const t of unicos) {
    if (!estados.has(t.estado)) continue;
    const pagado = pagadoPorTitulo.get(t.id) ?? 0;
    const diferencia = aCentavos(t.valorEmitido) - pagado;
    const saldo = Math.max(0, diferencia);
    const aFavor = Math.max(0, -diferencia);
    const juicios = [...(juiciosPorTitulo.get(t.id)?.values() ?? [])].sort();
    totalSaldo += saldo;
    totalAFavor += aFavor;
    if (juicios.length > 0) conJuicio++;
    if (juicios.length > 1) conVarios++;
    filas.push({
      tituloId: t.id,
      contribuyenteId: t.contribuyenteId,
      rubroId: t.rubroId,
      estado: t.estado,
      fechaEmision: t.fechaEmision,
      fechaVencimiento: t.fechaVencimiento,
      valorEmitido: aDolares(aCentavos(t.valorEmitido)),
      pagadoNeto: aDolares(pagado),
      saldo: aDolares(saldo),
      saldoAFavor: aDolares(aFavor),
      juicios,
    });
  }

  return {
    valor: {
      titulos: filas,
      totalSaldo: aDolares(totalSaldo),
      totalSaldoAFavor: aDolares(totalAFavor),
      cantidadTitulos: filas.length,
      titulosConJuicio: conJuicio,
      titulosConVariosJuicios: conVarios,
      filasRepetidasDescartadas: filasRepetidas,
    },
    fuente: corte.fuente,
    formula: FORMULA_SALDO_TITULO,
    filtros: [
      ...filtrosDeCorte(corte),
      `titulo.estado IN (${[...estados].join(", ")})`,
      "titulo.id unico (filas repetidas colapsadas)",
    ],
    corte,
  };
}

export const TRAMOS_ANTIGUEDAD = [
  { tramo: "0-30", desde: 0, hasta: 30 },
  { tramo: "31-90", desde: 31, hasta: 90 },
  { tramo: "91-180", desde: 91, hasta: 180 },
  { tramo: "181-360", desde: 181, hasta: 360 },
  { tramo: "mas_de_360", desde: 361, hasta: null },
] as const;

export type NombreTramo = (typeof TRAMOS_ANTIGUEDAD)[number]["tramo"];

export const EntradaAntiguedadCartera = EntradaSaldoCartera.extend({
  /** Fecha desde la que se cuentan los dias; por defecto el vencimiento. */
  base: z.enum(["vencimiento", "emision"]).optional(),
});
export type EntradaAntiguedadCartera = z.infer<typeof EntradaAntiguedadCartera>;

export interface TramoAntiguedad {
  tramo: NombreTramo;
  desde: number;
  hasta: number | null;
  titulos: number;
  saldo: number;
  proporcion: number;
  /** Porcentaje sobre totalSaldo, calculado por la herramienta. */
  porcentaje: number;
}

export interface AntiguedadCartera {
  tramos: TramoAntiguedad[];
  /** Titulos con saldo cuya fecha base es posterior al corte (dias < 0). */
  porVencer: { titulos: number; saldo: number };
  totalSaldo: number;
  /** SUM(tramos) + porVencer === totalSaldo. */
  cuadra: boolean;
}

export function tramoDeDias(dias: number): NombreTramo | null {
  if (dias < 0) return null;
  const tramo = TRAMOS_ANTIGUEDAD.find((t) => dias >= t.desde && (t.hasta === null || dias <= t.hasta));
  return tramo?.tramo ?? null;
}

export function antiguedadCartera(entrada: EntradaAntiguedadCartera): ResultadoCalculo<AntiguedadCartera> {
  const base = entrada.base ?? "vencimiento";
  const saldos = saldoCarteraPorTitulo(entrada);
  const acumulado = new Map<NombreTramo, { titulos: number; centavos: number }>(
    TRAMOS_ANTIGUEDAD.map((t) => [t.tramo, { titulos: 0, centavos: 0 }]),
  );
  const porVencer = { titulos: 0, centavos: 0 };
  let total = 0;
  for (const fila of saldos.valor.titulos) {
    const centavos = aCentavos(fila.saldo);
    if (centavos <= 0) continue;
    total += centavos;
    const fechaBase = base === "vencimiento" ? fila.fechaVencimiento : fila.fechaEmision;
    const tramo = tramoDeDias(diasEntre(fechaBase, entrada.corte.fechaCorte));
    const destino = tramo === null ? porVencer : acumulado.get(tramo);
    if (!destino) continue;
    destino.titulos++;
    destino.centavos += centavos;
  }
  const tramos = TRAMOS_ANTIGUEDAD.map((t) => {
    const a = acumulado.get(t.tramo) ?? { titulos: 0, centavos: 0 };
    return {
      tramo: t.tramo,
      desde: t.desde,
      hasta: t.hasta,
      titulos: a.titulos,
      saldo: aDolares(a.centavos),
      proporcion: proporcion(a.centavos, total),
      porcentaje: proporcion(a.centavos, total) * 100,
    };
  });
  const sumaTramos = [...acumulado.values()].reduce((acc, a) => acc + a.centavos, 0);
  return {
    valor: {
      tramos,
      porVencer: { titulos: porVencer.titulos, saldo: aDolares(porVencer.centavos) },
      totalSaldo: aDolares(total),
      cuadra: sumaTramos + porVencer.centavos === total,
    },
    fuente: saldos.fuente,
    formula:
      `dias = fechaCorte (${fechaISO(entrada.corte.fechaCorte)}) - fecha${base === "vencimiento" ? "Vencimiento" : "Emision"}; ` +
      "tramos 0-30, 31-90, 91-180, 181-360, mas de 360 (limites incluidos); dias < 0 = por vencer; " +
      FORMULA_SALDO_TITULO,
    filtros: [...saldos.filtros, "saldo > 0"],
    corte: entrada.corte,
  };
}

export const EntradaSegmentarPareto = z.object({
  corte: Corte,
  partidas: z.array(z.object({ clave: z.string().min(1), valor: z.number().finite() })),
  /** Proporciones acumuladas que cierran los segmentos A y B (por defecto 0.8 y 0.95). */
  umbrales: z.tuple([z.number(), z.number()]).optional(),
});
export type EntradaSegmentarPareto = z.infer<typeof EntradaSegmentarPareto>;

export type SegmentoPareto = "A" | "B" | "C";

export interface SegmentacionPareto {
  segmentos: { segmento: SegmentoPareto; claves: number; valor: number; proporcionValor: number; proporcionClaves: number }[];
  detalle: {
    clave: string;
    valor: number;
    proporcion: number;
    acumulado: number;
    porcentajeAcumulado: number;
    segmento: SegmentoPareto;
  }[];
  total: number;
  cantidadClaves: number;
  /** Proporcion del valor que concentra el 20 % de claves con mayor valor. */
  concentracionTop20: number;
  /** Claves con valor <= 0: no entran a la segmentacion. */
  sinValor: string[];
}

/**
 * Concentracion de deuda: agrega por clave (p. ej. contribuyente), ordena de mayor a menor y
 * asigna A mientras la proporcion acumulada previa sea menor al primer umbral, B al segundo, C el resto.
 */
export function segmentarPareto(entrada: EntradaSegmentarPareto): ResultadoCalculo<SegmentacionPareto> {
  const [umbralA, umbralB] = entrada.umbrales ?? [0.8, 0.95];
  if (!(umbralA > 0 && umbralA < umbralB && umbralB <= 1)) {
    throw new FinanzasError("umbrales_invalidos", `${umbralA}, ${umbralB}`);
  }
  const porClave = new Map<string, number>();
  for (const p of entrada.partidas) porClave.set(p.clave, (porClave.get(p.clave) ?? 0) + aCentavos(p.valor));
  const sinValor = [...porClave.entries()].filter(([, v]) => v <= 0).map(([c]) => c).sort();
  const ordenadas = [...porClave.entries()]
    .filter(([, v]) => v > 0)
    .sort(([ca, va], [cb, vb]) => vb - va || ca.localeCompare(cb));
  const total = ordenadas.reduce((acc, [, v]) => acc + v, 0);

  let acumulado = 0;
  const detalle = ordenadas.map(([clave, centavos]) => {
    const previo = total === 0 ? 0 : acumulado / total;
    const segmento: SegmentoPareto = previo < umbralA ? "A" : previo < umbralB ? "B" : "C";
    acumulado += centavos;
    return {
      clave,
      valor: aDolares(centavos),
      proporcion: proporcion(centavos, total),
      acumulado: proporcion(acumulado, total),
      segmento,
      centavos,
    };
  });
  const segmentos = (["A", "B", "C"] as const).map((segmento) => {
    const filas = detalle.filter((d) => d.segmento === segmento);
    const centavos = filas.reduce((acc, d) => acc + d.centavos, 0);
    return {
      segmento,
      claves: filas.length,
      valor: aDolares(centavos),
      proporcionValor: proporcion(centavos, total),
      proporcionClaves: proporcion(filas.length, detalle.length),
    };
  });
  const top20 = detalle.slice(0, Math.ceil(detalle.length * 0.2)).reduce((acc, d) => acc + d.centavos, 0);

  return {
    valor: {
      segmentos,
      detalle: detalle.map((d) => ({
        clave: d.clave,
        valor: d.valor,
        proporcion: d.proporcion,
        acumulado: d.acumulado,
        porcentajeAcumulado: d.acumulado * 100,
        segmento: d.segmento,
      })),
      total: aDolares(total),
      cantidadClaves: detalle.length,
      concentracionTop20: proporcion(top20, total),
      sinValor,
    },
    fuente: entrada.corte.fuente,
    formula:
      `valor(clave) = SUM(partida.valor); orden descendente; segmento = A si acumuladoPrevio < ${umbralA}, ` +
      `B si < ${umbralB}, C en otro caso`,
    filtros: [...filtrosDeCorte(entrada.corte), "valor agregado por clave > 0"],
    corte: entrada.corte,
  };
}

/** Convierte saldos por titulo en partidas por contribuyente para `segmentarPareto`. */
export function partidasPorContribuyente(titulos: readonly SaldoTitulo[]): { clave: string; valor: number }[] {
  return titulos.map((t) => ({ clave: t.contribuyenteId, valor: t.saldo }));
}
