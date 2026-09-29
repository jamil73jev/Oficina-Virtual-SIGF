import type {
  AntiguedadCartera,
  CalidadDatos,
  ConciliacionBancaria,
  CruceIdentificaciones,
  DatosFinanzas,
  RecaudacionNeta,
  ResultadoCalculo,
  SaldoCartera,
  SegmentacionPareto,
} from "@/modules/finanzas";

/**
 * Puerto inyectable para la fuente de datos financieros.
 * Por defecto entrega datos sintéticos deterministas.
 */
export interface FuenteDatos {
  obtenerDatos(): Promise<DatosFinanzas> | DatosFinanzas;
}

export interface OpcionesPanelFinanciero {
  transaccionesConciliacion?: DatosFinanzas["pagos"];
  umbralesPareto?: [number, number];
}

/**
 * Panel financiero completo calculado exclusivamente mediante las calculadoras
 * oficiales de `src/modules/finanzas`.
 */
export interface PanelFinanciero {
  recaudacion: ResultadoCalculo<RecaudacionNeta>;
  saldoCartera: ResultadoCalculo<SaldoCartera>;
  antiguedadCartera: ResultadoCalculo<AntiguedadCartera>;
  pareto: ResultadoCalculo<SegmentacionPareto>;
  conciliacion: ResultadoCalculo<ConciliacionBancaria>;
  calidadDatos: ResultadoCalculo<CalidadDatos>;
  cruceIdentificaciones: ResultadoCalculo<CruceIdentificaciones>;
  esSintetico: true;
  calculadoEn: string;
}
