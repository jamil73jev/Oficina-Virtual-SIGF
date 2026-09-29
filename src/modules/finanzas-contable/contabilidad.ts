import { z } from "zod";
import { Corte, exigirCortesSimultaneos, type ResultadoCalculo } from "@/modules/finanzas";
import {
  Asiento,
  CuentaContable,
  ORIGENES_ASIENTO,
  OrigenAsiento,
  TotalSubsistema,
  type NaturalezaCuenta,
} from "./domain";
import { aCentavos, aDolares, dentroDeRango, fechaISO, filtrosDeCorte, hastaElCorte, unicosPorId } from "./comun";

/** Debe y haber de un asiento en centavos. */
export function totalesAsiento(asiento: Pick<Asiento, "lineas">): { debe: number; haber: number } {
  let debe = 0;
  let haber = 0;
  for (const l of asiento.lineas) {
    debe += aCentavos(l.debe);
    haber += aCentavos(l.haber);
  }
  return { debe, haber };
}

export const asientoCuadra = (asiento: Pick<Asiento, "lineas">): boolean => {
  const { debe, haber } = totalesAsiento(asiento);
  return debe === haber;
};

export interface AsientoDescuadrado {
  asientoId: string;
  fecha: string;
  origen: OrigenAsiento;
  debe: number;
  haber: number;
  /** debe - haber. */
  diferencia: number;
}

interface AsientosSeleccionados {
  asientos: Asiento[];
  duplicados: string[];
}

/** Asientos unicos con fecha <= corte y dentro del rango, ordenados por fecha e id. */
function seleccionarAsientos(asientos: readonly Asiento[], corte: Corte, desde?: Date, hasta?: Date): AsientosSeleccionados {
  const { unicos, duplicados } = unicosPorId(asientos);
  return {
    asientos: unicos
      .filter((a) => hastaElCorte(a.fecha, corte) && dentroDeRango(a.fecha, desde, hasta))
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.id.localeCompare(b.id)),
    duplicados,
  };
}

function descuadrados(asientos: readonly Asiento[]): AsientoDescuadrado[] {
  return asientos.flatMap((a) => {
    const { debe, haber } = totalesAsiento(a);
    return debe === haber
      ? []
      : [{ asientoId: a.id, fecha: fechaISO(a.fecha), origen: a.origen, debe: aDolares(debe), haber: aDolares(haber), diferencia: aDolares(debe - haber) }];
  });
}

// ---------------------------------------------------------------------------------------------
// balance_comprobacion
// ---------------------------------------------------------------------------------------------

export const EntradaBalanceComprobacion = z.object({
  corte: Corte,
  cuentas: z.array(CuentaContable),
  asientos: z.array(Asiento),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  origenes: z.array(OrigenAsiento).optional(),
});
export type EntradaBalanceComprobacion = z.infer<typeof EntradaBalanceComprobacion>;

export interface FilaBalance {
  cuentaId: string;
  codigo: string;
  nombre: string;
  /** null si la cuenta no esta en el catalogo recibido. */
  naturaleza: NaturalezaCuenta | null;
  debe: number;
  haber: number;
  /** Deudora: debe - haber; acreedora: haber - debe; sin catalogo: debe - haber. */
  saldo: number;
  saldoContrarioANaturaleza: boolean;
}

export interface BalanceComprobacion {
  cuentas: FilaBalance[];
  totalDebe: number;
  totalHaber: number;
  /** totalDebe - totalHaber. */
  diferencia: number;
  cuadra: boolean;
  cantidadAsientos: number;
  asientosDescuadrados: AsientoDescuadrado[];
  lineasCuentaNoCatalogada: { asientoId: string; cuentaId: string; debe: number; haber: number }[];
  /** Lineas con debe y haber a la vez, o ambos en cero. Se suman igual: no se ocultan. */
  lineasInvalidas: { asientoId: string; indice: number; motivo: "debe_y_haber" | "sin_valor" }[];
  asientosDuplicados: string[];
}

export function balanceComprobacion(entrada: EntradaBalanceComprobacion): ResultadoCalculo<BalanceComprobacion> {
  const { corte, desde, hasta, origenes } = entrada;
  const catalogo = new Map(unicosPorId(entrada.cuentas).unicos.map((c) => [c.id, c]));
  const seleccion = seleccionarAsientos(entrada.asientos, corte, desde, hasta);
  const asientos = seleccion.asientos.filter((a) => !origenes || origenes.includes(a.origen));

  const porCuenta = new Map<string, { debe: number; haber: number }>();
  const noCatalogadas: BalanceComprobacion["lineasCuentaNoCatalogada"] = [];
  const lineasInvalidas: BalanceComprobacion["lineasInvalidas"] = [];
  let totalDebe = 0;
  let totalHaber = 0;
  for (const a of asientos) {
    a.lineas.forEach((l, indice) => {
      const debe = aCentavos(l.debe);
      const haber = aCentavos(l.haber);
      totalDebe += debe;
      totalHaber += haber;
      const acumulado = porCuenta.get(l.cuentaId) ?? { debe: 0, haber: 0 };
      acumulado.debe += debe;
      acumulado.haber += haber;
      porCuenta.set(l.cuentaId, acumulado);
      if (!catalogo.has(l.cuentaId)) noCatalogadas.push({ asientoId: a.id, cuentaId: l.cuentaId, debe: aDolares(debe), haber: aDolares(haber) });
      if (debe > 0 && haber > 0) lineasInvalidas.push({ asientoId: a.id, indice, motivo: "debe_y_haber" });
      else if (debe === 0 && haber === 0) lineasInvalidas.push({ asientoId: a.id, indice, motivo: "sin_valor" });
    });
  }

  const cuentas: FilaBalance[] = [...porCuenta.entries()]
    .map(([cuentaId, m]) => {
      const cuenta = catalogo.get(cuentaId);
      const naturaleza = cuenta?.naturaleza ?? null;
      const saldo = naturaleza === "acreedora" ? m.haber - m.debe : m.debe - m.haber;
      return {
        cuentaId,
        codigo: cuenta?.codigo ?? cuentaId,
        nombre: cuenta?.nombre ?? "Cuenta no catalogada",
        naturaleza,
        debe: aDolares(m.debe),
        haber: aDolares(m.haber),
        saldo: aDolares(saldo),
        saldoContrarioANaturaleza: naturaleza !== null && saldo < 0,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.cuentaId.localeCompare(b.cuentaId));

  const filtros = [...filtrosDeCorte(corte, desde, hasta), "asiento.id unico (duplicados informados aparte)"];
  if (origenes) filtros.push(`asiento.origen en [${origenes.join(", ")}]`);
  return {
    valor: {
      cuentas,
      totalDebe: aDolares(totalDebe),
      totalHaber: aDolares(totalHaber),
      diferencia: aDolares(totalDebe - totalHaber),
      cuadra: totalDebe === totalHaber,
      cantidadAsientos: asientos.length,
      asientosDescuadrados: descuadrados(asientos),
      lineasCuentaNoCatalogada: noCatalogadas,
      lineasInvalidas,
      asientosDuplicados: seleccion.duplicados,
    },
    fuente: corte.fuente,
    formula:
      "por cuenta: suma de debe y de haber de las lineas; saldo segun naturaleza (deudora: debe - haber; acreedora: haber - debe); " +
      "cuadra si total debe = total haber; asiento descuadrado si su debe != su haber",
    filtros,
    corte,
  };
}

// ---------------------------------------------------------------------------------------------
// conciliacion_contable
// ---------------------------------------------------------------------------------------------

export const EntradaConciliacionContable = z.object({
  /** Corte de la contabilidad; los subsistemas deben tener el mismo corte. */
  corte: Corte,
  asientos: z.array(Asiento),
  subsistemas: z.array(TotalSubsistema),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  toleranciaMinutos: z.number().int().nonnegative().optional(),
});
export type EntradaConciliacionContable = z.infer<typeof EntradaConciliacionContable>;

export interface FilaConciliacionContable {
  origen: OrigenAsiento;
  cantidadAsientos: number;
  /** Suma del debe de los asientos del origen. */
  contabilizado: number;
  fuentes: string[];
  /** Suma de los totales informados por los subsistemas; null si ninguno lo informa. */
  subsistema: number | null;
  /** contabilizado - subsistema. */
  diferencia: number | null;
  estado: "cuadra" | "diferencia" | "sin_subsistema";
  asientosDescuadrados: number;
}

export interface ConciliacionContable {
  filas: FilaConciliacionContable[];
  totalContabilizado: number;
  /** Solo de los origenes con dato del subsistema. */
  totalSubsistemas: number;
  diferenciaTotal: number;
  /** Todos los origenes informados cuadran y no hay asientos descuadrados. */
  cuadra: boolean;
  origenesSinSubsistema: OrigenAsiento[];
  asientosDescuadrados: AsientoDescuadrado[];
  asientosDuplicados: string[];
}

export function conciliacionContable(entrada: EntradaConciliacionContable): ResultadoCalculo<ConciliacionContable> {
  const { corte, desde, hasta } = entrada;
  exigirCortesSimultaneos([corte, ...entrada.subsistemas.map((s) => s.corte)], entrada.toleranciaMinutos ?? 0);
  const seleccion = seleccionarAsientos(entrada.asientos, corte, desde, hasta);
  const asientosDescuadrados = descuadrados(seleccion.asientos);

  let totalContabilizado = 0;
  let totalSubsistemas = 0;
  let totalContabilizadoComparado = 0;
  const filas = ORIGENES_ASIENTO.map((origen): FilaConciliacionContable => {
    const delOrigen = seleccion.asientos.filter((a) => a.origen === origen);
    const contabilizado = delOrigen.reduce((acc, a) => acc + totalesAsiento(a).debe, 0);
    const informes = entrada.subsistemas.filter((s) => s.origen === origen);
    const subsistema = informes.length === 0 ? null : informes.reduce((acc, s) => acc + aCentavos(s.total), 0);
    totalContabilizado += contabilizado;
    if (subsistema !== null) {
      totalSubsistemas += subsistema;
      totalContabilizadoComparado += contabilizado;
    }
    return {
      origen,
      cantidadAsientos: delOrigen.length,
      contabilizado: aDolares(contabilizado),
      fuentes: [...new Set(informes.map((s) => s.fuente))].sort(),
      subsistema: subsistema === null ? null : aDolares(subsistema),
      diferencia: subsistema === null ? null : aDolares(contabilizado - subsistema),
      estado: subsistema === null ? "sin_subsistema" : contabilizado === subsistema ? "cuadra" : "diferencia",
      asientosDescuadrados: asientosDescuadrados.filter((d) => d.origen === origen).length,
    };
  });

  return {
    valor: {
      filas,
      totalContabilizado: aDolares(totalContabilizado),
      totalSubsistemas: aDolares(totalSubsistemas),
      diferenciaTotal: aDolares(totalContabilizadoComparado - totalSubsistemas),
      cuadra: filas.every((f) => f.estado !== "diferencia") && asientosDescuadrados.length === 0,
      origenesSinSubsistema: filas.filter((f) => f.estado === "sin_subsistema").map((f) => f.origen),
      asientosDescuadrados,
      asientosDuplicados: seleccion.duplicados,
    },
    fuente: [corte.fuente, ...new Set(entrada.subsistemas.map((s) => s.fuente))].join(" vs "),
    formula:
      "contabilizado(origen) = suma del debe de los asientos del origen; subsistema(origen) = suma de los totales informados; " +
      "diferencia = contabilizado - subsistema; diferenciaTotal solo sobre los origenes con dato del subsistema",
    filtros: [...filtrosDeCorte(corte, desde, hasta), "asiento.id unico (duplicados informados aparte)", "cortes simultaneos exigidos"],
    corte: [corte, ...entrada.subsistemas.map((s) => s.corte)],
  };
}
