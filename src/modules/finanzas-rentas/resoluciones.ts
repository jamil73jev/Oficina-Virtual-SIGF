import { z } from "zod";
import {
  Corte,
  Pago,
  Reverso,
  Titulo,
  titulosUnicos,
  type EstadoTitulo,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import { aCentavos, aDolares, fechaISO, filtrosDeCorte, hastaElCorte, movimientosPorPago } from "@/modules/finanzas/comun";
import { HistorialTitulo, Resolucion } from "./domain";
import { estadoDelTituloAlCorte } from "./estado";

export const EntradaEfectoResoluciones = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  resoluciones: z.array(Resolucion),
  pagos: z.array(Pago).optional(),
  reversos: z.array(Reverso).optional(),
  /** Si se informa, el estado al corte se reconstruye desde el historial y no del estado actual. */
  historial: z.array(HistorialTitulo).optional(),
});
export type EntradaEfectoResoluciones = z.infer<typeof EntradaEfectoResoluciones>;

export interface EfectoTitulo {
  tituloId: string;
  valorEmitido: number;
  pagadoNeto: number;
  saldoAntes: number;
  efectoAplicado: number;
  /** Efecto declarado por las resoluciones que excede el valor emitido; no se aplica. */
  efectoExcedente: number;
  saldoDespues: number;
  estadoAlCorte: EstadoTitulo | null;
  /** Solo una propuesta: cambiar el estado requiere aprobacion humana. */
  estadoPropuesto: EstadoTitulo | null;
  resolucionesAplicadas: string[];
  resolucionesPosterioresAlCorte: string[];
  resolucionesNoVigentes: string[];
}

export interface EfectoResoluciones {
  titulos: EfectoTitulo[];
  totalEfectoAplicado: number;
  totalSaldoAntes: number;
  totalSaldoDespues: number;
  resolucionesSinTitulo: string[];
  resolucionesRepetidasDescartadas: number;
}

export const FORMULA_EFECTO_RESOLUCIONES =
  "efecto(titulo) = MIN(valorEmitido, SUM(resolucion.valorEfecto)) sobre resoluciones unicas por id con estado = vigente, " +
  "fecha <= corte y tipo distinto de 'otro'; saldoAntes = MAX(0, valorEmitido - pagadoNeto); " +
  "saldoDespues = MAX(0, valorEmitido - efecto - pagadoNeto); pagadoNeto = SUM(pago.valorBruto) - SUM(todos los reversos) a la fecha de corte; " +
  "estadoPropuesto = baja si el efecto cubre todo el valor emitido, pagado si deja saldo 0 con pagos; solo propone";

export function efectoResoluciones(entrada: EntradaEfectoResoluciones): ResultadoCalculo<EfectoResoluciones> {
  const { corte } = entrada;
  const { unicos } = titulosUnicos(entrada.titulos);
  const { porPago } = movimientosPorPago(entrada.pagos ?? [], entrada.reversos ?? [], corte);
  const pagadoPorTitulo = new Map<string, number>();
  for (const m of porPago.values()) {
    const neto = m.brutoCentavos - m.reversosNormalesCentavos - m.reversosExtemporaneosCentavos;
    pagadoPorTitulo.set(m.pago.tituloId, (pagadoPorTitulo.get(m.pago.tituloId) ?? 0) + neto);
  }

  const vistas = new Set<string>();
  let repetidas = 0;
  const porTitulo = new Map<string, Resolucion[]>();
  for (const r of entrada.resoluciones) {
    if (vistas.has(r.id)) {
      repetidas++;
      continue;
    }
    vistas.add(r.id);
    porTitulo.set(r.tituloId, [...(porTitulo.get(r.tituloId) ?? []), r]);
  }
  const historialPorTitulo = new Map<string, HistorialTitulo[]>();
  for (const h of entrada.historial ?? []) {
    historialPorTitulo.set(h.tituloId, [...(historialPorTitulo.get(h.tituloId) ?? []), h]);
  }

  const idsTitulos = new Set(unicos.map((t) => t.id));
  const resolucionesSinTitulo = [...porTitulo.entries()]
    .filter(([id]) => !idsTitulos.has(id))
    .flatMap(([, rs]) => rs.map((r) => r.id));

  const filas: EfectoTitulo[] = [];
  let totalEfecto = 0;
  let totalAntes = 0;
  let totalDespues = 0;
  for (const t of unicos) {
    const rs = porTitulo.get(t.id);
    if (!rs) continue;
    const aplicadas = rs.filter((r) => r.estado === "vigente" && hastaElCorte(r.fecha, corte));
    const declarado = aplicadas.filter((r) => r.tipo !== "otro").reduce((s, r) => s + aCentavos(r.valorEfecto), 0);
    const emitido = aCentavos(t.valorEmitido);
    const pagado = pagadoPorTitulo.get(t.id) ?? 0;
    const efecto = Math.min(emitido, declarado);
    const saldoAntes = Math.max(0, emitido - pagado);
    const saldoDespues = Math.max(0, emitido - efecto - pagado);
    const estadoAlCorte = entrada.historial
      ? estadoDelTituloAlCorte(t, historialPorTitulo.get(t.id) ?? [], corte).estadoAlCorte
      : t.estado;

    let propuesto: EstadoTitulo | null = null;
    const abierto = estadoAlCorte !== null && estadoAlCorte !== "baja" && estadoAlCorte !== "pagado";
    if (abierto && efecto > 0 && saldoAntes > 0 && saldoDespues === 0) {
      propuesto = efecto >= emitido ? "baja" : "pagado";
    }
    totalEfecto += Math.min(efecto, saldoAntes);
    totalAntes += saldoAntes;
    totalDespues += saldoDespues;
    filas.push({
      tituloId: t.id,
      valorEmitido: aDolares(emitido),
      pagadoNeto: aDolares(pagado),
      saldoAntes: aDolares(saldoAntes),
      efectoAplicado: aDolares(efecto),
      efectoExcedente: aDolares(declarado - efecto),
      saldoDespues: aDolares(saldoDespues),
      estadoAlCorte,
      estadoPropuesto: propuesto,
      resolucionesAplicadas: aplicadas.map((r) => r.id),
      resolucionesPosterioresAlCorte: rs
        .filter((r) => r.estado === "vigente" && !hastaElCorte(r.fecha, corte))
        .map((r) => r.id),
      resolucionesNoVigentes: rs.filter((r) => r.estado !== "vigente").map((r) => r.id),
    });
  }

  return {
    valor: {
      titulos: filas,
      totalEfectoAplicado: aDolares(totalEfecto),
      totalSaldoAntes: aDolares(totalAntes),
      totalSaldoDespues: aDolares(totalDespues),
      resolucionesSinTitulo,
      resolucionesRepetidasDescartadas: repetidas,
    },
    fuente: corte.fuente,
    formula: FORMULA_EFECTO_RESOLUCIONES,
    filtros: [
      ...filtrosDeCorte(corte),
      `resolucion.fecha <= ${fechaISO(corte.fechaCorte)}`,
      "resolucion.estado = vigente",
      "solo titulos con al menos una resolucion",
      "titulo.id unico",
    ],
    corte,
  };
}
