import { z } from "zod";
import {
  Corte,
  Juicio,
  Pago,
  Reverso,
  Titulo,
  titulosUnicos,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import {
  aCentavos,
  aDolares,
  diasEntre,
  filtrosDeCorte,
  hastaElCorte,
  movimientosPorPago,
  proporcion,
} from "@/modules/finanzas/comun";
import { HistorialTitulo, MovimientoJuicio, Resolucion } from "./domain";
import { estadoDelTituloAlCorte } from "./estado";

/** Ultimo juicio = mayor fecha; empate: mayor id (orden estable y determinista). */
const masReciente = (a: Juicio, b: Juicio): number => diasEntre(b.fecha, a.fecha) || a.id.localeCompare(b.id);

// ---------------------------------------------------------------------------
// resumen_coactiva
// ---------------------------------------------------------------------------

export const EntradaResumenCoactiva = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  juicios: z.array(Juicio),
  movimientos: z.array(MovimientoJuicio).optional(),
});
export type EntradaResumenCoactiva = z.infer<typeof EntradaResumenCoactiva>;

export interface JuicioConMovimientos {
  juicioId: string;
  codigo: string;
  juzgado: string;
  estado: string;
  fecha: Date;
  movimientos: { id: string; fecha: Date; tipo: string; valor: number | null; observacion: string }[];
}

export interface ResumenTituloCoactiva {
  tituloId: string;
  contribuyenteId: string;
  /** Valor del titulo: se cuenta una sola vez, sin importar cuantos juicios tenga. */
  valorEmitido: number;
  cantidadJuicios: number;
  /** Vista analitica: solo el ultimo juicio. */
  ultimoJuicio: JuicioConMovimientos;
  /** Historial completo (todos los juicios, del mas antiguo al mas reciente). */
  historialJuicios: JuicioConMovimientos[];
}

export interface ResumenCoactiva {
  titulos: ResumenTituloCoactiva[];
  cantidadTitulos: number;
  cantidadJuicios: number;
  titulosConVariosJuicios: number;
  totalValorTitulos: number;
  juiciosPosterioresAlCorte: number;
  juiciosSinTitulo: string[];
  movimientosPosterioresAlCorte: number;
  movimientosSinJuicio: number;
}

export const FORMULA_RESUMEN_COACTIVA =
  "por titulo.id unico: cantidadJuicios = COUNT(juicio.id unico con fecha <= corte); ultimoJuicio = juicio de mayor fecha " +
  "(empate por id); historialJuicios = todos los juicios ordenados por fecha; totalValorTitulos = SUM(titulo.valorEmitido) " +
  "una vez por titulo, nunca por juicio; cantidadJuicios total es un conteo de ids distintos, no de titulos";

export function resumenCoactiva(entrada: EntradaResumenCoactiva): ResultadoCalculo<ResumenCoactiva> {
  const { corte } = entrada;
  const { unicos } = titulosUnicos(entrada.titulos);
  const titulosPorId = new Map(unicos.map((t) => [t.id, t]));

  const juiciosVistos = new Map<string, Juicio>();
  let posteriores = 0;
  for (const j of entrada.juicios) {
    if (juiciosVistos.has(j.id)) continue;
    if (!hastaElCorte(j.fecha, corte)) {
      posteriores++;
      continue;
    }
    juiciosVistos.set(j.id, j);
  }
  const movsPorJuicio = new Map<string, MovimientoJuicio[]>();
  let movsPosteriores = 0;
  let movsSinJuicio = 0;
  const movsVistos = new Set<string>();
  for (const m of entrada.movimientos ?? []) {
    if (movsVistos.has(m.id)) continue;
    movsVistos.add(m.id);
    if (!hastaElCorte(m.fecha, corte)) {
      movsPosteriores++;
      continue;
    }
    if (!juiciosVistos.has(m.juicioId)) {
      movsSinJuicio++;
      continue;
    }
    movsPorJuicio.set(m.juicioId, [...(movsPorJuicio.get(m.juicioId) ?? []), m]);
  }

  const detalle = (j: Juicio): JuicioConMovimientos => ({
    juicioId: j.id,
    codigo: j.codigo,
    juzgado: j.juzgado,
    estado: j.estado,
    fecha: j.fecha,
    movimientos: (movsPorJuicio.get(j.id) ?? [])
      .slice()
      .sort((a, b) => diasEntre(b.fecha, a.fecha) || a.id.localeCompare(b.id))
      .map((m) => ({
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        valor: m.valor ?? null,
        observacion: m.observacion,
      })),
  });

  const juiciosPorTitulo = new Map<string, Juicio[]>();
  const sinTitulo: string[] = [];
  for (const j of juiciosVistos.values()) {
    if (!titulosPorId.has(j.tituloId)) {
      sinTitulo.push(j.id);
      continue;
    }
    juiciosPorTitulo.set(j.tituloId, [...(juiciosPorTitulo.get(j.tituloId) ?? []), j]);
  }

  const filas: ResumenTituloCoactiva[] = [];
  let totalCent = 0;
  let totalJuicios = 0;
  for (const t of unicos) {
    const js = juiciosPorTitulo.get(t.id);
    if (!js) continue;
    const ordenados = js.slice().sort(masReciente);
    const ultimo = ordenados[ordenados.length - 1];
    if (!ultimo) continue;
    totalCent += aCentavos(t.valorEmitido);
    totalJuicios += ordenados.length;
    filas.push({
      tituloId: t.id,
      contribuyenteId: t.contribuyenteId,
      valorEmitido: aDolares(aCentavos(t.valorEmitido)),
      cantidadJuicios: ordenados.length,
      ultimoJuicio: detalle(ultimo),
      historialJuicios: ordenados.map(detalle),
    });
  }

  return {
    valor: {
      titulos: filas,
      cantidadTitulos: filas.length,
      cantidadJuicios: totalJuicios,
      titulosConVariosJuicios: filas.filter((f) => f.cantidadJuicios > 1).length,
      totalValorTitulos: aDolares(totalCent),
      juiciosPosterioresAlCorte: posteriores,
      juiciosSinTitulo: sinTitulo,
      movimientosPosterioresAlCorte: movsPosteriores,
      movimientosSinJuicio: movsSinJuicio,
    },
    fuente: corte.fuente,
    formula: FORMULA_RESUMEN_COACTIVA,
    filtros: [...filtrosDeCorte(corte), "juicio.id unico", "titulo.id unico", "solo titulos con al menos un juicio"],
    corte,
  };
}

// ---------------------------------------------------------------------------
// recuperacion_coactiva
// ---------------------------------------------------------------------------

export const EntradaRecuperacionCoactiva = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  pagos: z.array(Pago),
  reversos: z.array(Reverso).optional(),
  juicios: z.array(Juicio).optional(),
  /** Define el estado al corte y la fecha de ingreso a coactiva; sin el se usa el estado actual. */
  historial: z.array(HistorialTitulo).optional(),
  resoluciones: z.array(Resolucion).optional(),
});
export type EntradaRecuperacionCoactiva = z.infer<typeof EntradaRecuperacionCoactiva>;

export interface RecuperacionTitulo {
  tituloId: string;
  fechaIngresoCoactiva: Date;
  origenFechaIngreso: "historial" | "primer_juicio";
  valorEmitido: number;
  efectoResoluciones: number;
  /** Deuda exigible al ingresar a coactiva (emitido - resoluciones - pagos netos previos). */
  baseCoactiva: number;
  recuperado: number;
  pagosPosteriores: number;
  saldoAlCorte: number;
  saldoAFavor: number;
}

export interface RecuperacionCoactiva {
  titulos: RecuperacionTitulo[];
  cantidadTitulos: number;
  totalBaseCoactiva: number;
  totalRecuperado: number;
  totalSaldo: number;
  /** recuperado / base, en [0, 1] con 4 decimales. */
  porcentajeRecuperado: number;
  titulosSinFechaDeIngreso: string[];
}

export const FORMULA_RECUPERACION_COACTIVA =
  "sobre titulos unicos en estado en_coactiva al corte: base = MAX(0, valorEmitido - efecto resoluciones vigentes <= corte - pagos netos con fechaPago <= ingreso); " +
  "recuperado = MIN(base, SUM(pago.valorBruto - reversos) con ingreso < fechaPago <= corte); saldo = MAX(0, valorEmitido - efecto - pagos netos totales); " +
  "porcentajeRecuperado = SUM(recuperado) / SUM(base); el valor del titulo se cuenta una sola vez y los juicios no aportan valor; " +
  "los movimientos de juicio tipo pago son informativos y no se suman para no duplicar los pagos";

export function recuperacionCoactiva(entrada: EntradaRecuperacionCoactiva): ResultadoCalculo<RecuperacionCoactiva> {
  const { corte } = entrada;
  const { unicos } = titulosUnicos(entrada.titulos);
  const { porPago } = movimientosPorPago(entrada.pagos, entrada.reversos ?? [], corte);
  const pagosPorTitulo = new Map<string, { fecha: Date; neto: number }[]>();
  for (const m of porPago.values()) {
    const neto = m.brutoCentavos - m.reversosNormalesCentavos - m.reversosExtemporaneosCentavos;
    const lista = pagosPorTitulo.get(m.pago.tituloId) ?? [];
    lista.push({ fecha: m.pago.fechaPago, neto });
    pagosPorTitulo.set(m.pago.tituloId, lista);
  }
  const historialPorTitulo = new Map<string, HistorialTitulo[]>();
  for (const h of entrada.historial ?? []) {
    historialPorTitulo.set(h.tituloId, [...(historialPorTitulo.get(h.tituloId) ?? []), h]);
  }
  const primerJuicio = new Map<string, Date>();
  for (const j of entrada.juicios ?? []) {
    if (!hastaElCorte(j.fecha, corte)) continue;
    const previo = primerJuicio.get(j.tituloId);
    if (!previo || diasEntre(j.fecha, previo) > 0) primerJuicio.set(j.tituloId, j.fecha);
  }
  const efectoPorTitulo = new Map<string, number>();
  const resVistas = new Set<string>();
  for (const r of entrada.resoluciones ?? []) {
    if (resVistas.has(r.id)) continue;
    resVistas.add(r.id);
    if (r.estado !== "vigente" || r.tipo === "otro" || !hastaElCorte(r.fecha, corte)) continue;
    efectoPorTitulo.set(r.tituloId, (efectoPorTitulo.get(r.tituloId) ?? 0) + aCentavos(r.valorEfecto));
  }

  const filas: RecuperacionTitulo[] = [];
  const sinFecha: string[] = [];
  let totalBase = 0;
  let totalRecuperado = 0;
  let totalSaldo = 0;
  for (const t of unicos) {
    const eventos = historialPorTitulo.get(t.id) ?? [];
    const estado = entrada.historial ? estadoDelTituloAlCorte(t, eventos, corte).estadoAlCorte : t.estado;
    if (estado !== "en_coactiva") continue;

    const ingresoHistorial = eventos
      .filter((e) => e.estadoNuevo === "en_coactiva" && hastaElCorte(e.fecha, corte))
      .sort((a, b) => diasEntre(b.fecha, a.fecha))[0]?.fecha;
    const ingreso = ingresoHistorial ?? primerJuicio.get(t.id);
    if (!ingreso) {
      sinFecha.push(t.id);
      continue;
    }

    const emitido = aCentavos(t.valorEmitido);
    const efecto = Math.min(emitido, efectoPorTitulo.get(t.id) ?? 0);
    const pagos = pagosPorTitulo.get(t.id) ?? [];
    const previos = pagos.filter((p) => diasEntre(p.fecha, ingreso) >= 0).reduce((s, p) => s + p.neto, 0);
    const posteriores = pagos.filter((p) => diasEntre(p.fecha, ingreso) < 0);
    const posterioresNeto = posteriores.reduce((s, p) => s + p.neto, 0);
    const base = Math.max(0, emitido - efecto - previos);
    const recuperado = Math.min(base, Math.max(0, posterioresNeto));
    const diferencia = emitido - efecto - (previos + posterioresNeto);

    totalBase += base;
    totalRecuperado += recuperado;
    totalSaldo += Math.max(0, diferencia);
    filas.push({
      tituloId: t.id,
      fechaIngresoCoactiva: ingreso,
      origenFechaIngreso: ingresoHistorial ? "historial" : "primer_juicio",
      valorEmitido: aDolares(emitido),
      efectoResoluciones: aDolares(efecto),
      baseCoactiva: aDolares(base),
      recuperado: aDolares(recuperado),
      pagosPosteriores: posteriores.length,
      saldoAlCorte: aDolares(Math.max(0, diferencia)),
      saldoAFavor: aDolares(Math.max(0, -diferencia)),
    });
  }

  return {
    valor: {
      titulos: filas,
      cantidadTitulos: filas.length,
      totalBaseCoactiva: aDolares(totalBase),
      totalRecuperado: aDolares(totalRecuperado),
      totalSaldo: aDolares(totalSaldo),
      porcentajeRecuperado: proporcion(totalRecuperado, totalBase),
      titulosSinFechaDeIngreso: sinFecha,
    },
    fuente: corte.fuente,
    formula: FORMULA_RECUPERACION_COACTIVA,
    filtros: [
      ...filtrosDeCorte(corte),
      "estado al corte = en_coactiva",
      entrada.historial ? "estado reconstruido desde historial" : "estado actual del titulo (sin historial)",
      "titulo.id unico",
    ],
    corte,
  };
}
