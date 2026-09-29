import { z } from "zod";
import {
  Corte,
  CortesDistintosError,
  exigirCortesSimultaneos,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import { aCentavos, aDolares } from "@/modules/finanzas/comun";
import { Compromiso, EntidadVinculada, IndicadorTablero, Meta, Observado, ReporteEntidad } from "./domain";

const redondearPct = (valor: number) => Math.round(valor * 100) / 100;

export const EntradaAvanceVsMeta = z.strictObject({ corte: Corte, metas: z.array(Meta), observados: z.array(Observado) });

export function avanceVsMeta(entrada: z.output<typeof EntradaAvanceVsMeta>): ResultadoCalculo<{
  filas: { metaId: string; indicador: string; periodo: string; tipo: string; meta: number; observado: number | null; avancePct: number | null; brecha: number | null }[];
  metasSinObservado: string[];
  observadosSinMeta: { indicador: string; periodo: string }[];
}> {
  const filas = entrada.metas.map((meta) => {
    const observado = entrada.observados.find((o) => o.indicador === meta.indicador && o.periodo === meta.periodo);
    const metaCentavos = aCentavos(meta.valor);
    const observadoCentavos = observado ? aCentavos(observado.valor) : null;
    return {
      metaId: meta.id,
      indicador: meta.indicador,
      periodo: meta.periodo,
      tipo: meta.tipo,
      meta: aDolares(metaCentavos),
      observado: observadoCentavos === null ? null : aDolares(observadoCentavos),
      avancePct: observadoCentavos === null || metaCentavos === 0 ? null : redondearPct((observadoCentavos / metaCentavos) * 100),
      brecha: observadoCentavos === null ? null : aDolares(metaCentavos - observadoCentavos),
    };
  });
  const clavesMeta = new Set(entrada.metas.map((m) => `${m.indicador}\u0000${m.periodo}`));
  return {
    valor: {
      filas,
      metasSinObservado: filas.filter((f) => f.observado === null).map((f) => f.metaId),
      observadosSinMeta: entrada.observados
        .filter((o) => !clavesMeta.has(`${o.indicador}\u0000${o.periodo}`))
        .map((o) => ({ indicador: o.indicador, periodo: o.periodo })),
    },
    fuente: [...new Set(entrada.observados.map((o) => o.fuente))].join(" + ") || "sin_observados",
    formula: "brecha = meta - observado; avance % = observado / meta * 100; importes calculados en centavos",
    filtros: ["coincidencia exacta por indicador y periodo", "metas mensual, acumulada y anual se conservan separadas", "faltantes no se imputan"],
    corte: entrada.corte,
  };
}

export const EntradaComparativoInteranual = z.strictObject({ corte: Corte, observados: z.array(Observado) });

const periodoAnterior = (periodo: string) => {
  const m = /^(\d{4})(-.+)?$/.exec(periodo);
  return m?.[1] ? `${Number(m[1]) - 1}${m[2] ?? ""}` : null;
};

export function comparativoInteranual(entrada: z.output<typeof EntradaComparativoInteranual>): ResultadoCalculo<{
  filas: { indicador: string; periodo: string; periodoAnterior: string | null; actual: number; anterior: number | null; variacionAbsoluta: number | null; variacionPct: number | null }[];
  periodosFaltantes: { indicador: string; periodo: string }[];
}> {
  const porClave = new Map(entrada.observados.map((o) => [`${o.indicador}\u0000${o.periodo}`, o]));
  const filas = entrada.observados.map((actual) => {
    const previoPeriodo = periodoAnterior(actual.periodo);
    const previo = previoPeriodo ? porClave.get(`${actual.indicador}\u0000${previoPeriodo}`) : undefined;
    const actualC = aCentavos(actual.valor);
    const previoC = previo ? aCentavos(previo.valor) : null;
    const variacion = previoC === null ? null : actualC - previoC;
    return {
      indicador: actual.indicador,
      periodo: actual.periodo,
      periodoAnterior: previoPeriodo,
      actual: aDolares(actualC),
      anterior: previoC === null ? null : aDolares(previoC),
      variacionAbsoluta: variacion === null ? null : aDolares(variacion),
      variacionPct: previoC === null || previoC === 0 ? null : redondearPct(((actualC - previoC) / previoC) * 100),
    };
  });
  return {
    valor: {
      filas,
      periodosFaltantes: filas.filter((f) => f.anterior === null).map((f) => ({ indicador: f.indicador, periodo: f.periodoAnterior ?? "periodo_invalido" })),
    },
    fuente: [...new Set(entrada.observados.map((o) => o.fuente))].join(" + ") || "sin_observados",
    formula: "variacion absoluta = actual - mismo periodo del año anterior; variacion % = diferencia / anterior * 100",
    filtros: ["comparacion por indicador y mismo sufijo de periodo", "periodos faltantes se declaran y no se imputan"],
    corte: entrada.corte,
  };
}

export const EntradaConsolidarEntidades = z.strictObject({
  corte: Corte,
  entidades: z.array(EntidadVinculada),
  reportes: z.array(ReporteEntidad),
});

export function consolidarEntidades(entrada: z.output<typeof EntradaConsolidarEntidades>): ResultadoCalculo<{
  porEntidad: { entidadId: string; nombre: string; ingresos: number; gastos: number; liquidez: number; transferenciasRecibidas: number; transferenciasEntregadas: number }[];
  entidadesSinReporte: string[];
  total: { ingresosBrutos: number; gastosBrutos: number; transferenciasRecibidas: number; transferenciasEntregadas: number; ingresosConsolidados: number; gastosConsolidados: number; liquidez: number };
}> {
  if (entrada.reportes.length > 1) exigirCortesSimultaneos(entrada.reportes.map((r) => r.corte));
  const reportePorEntidad = new Map(entrada.reportes.map((r) => [r.entidadId, r]));
  const sinReporte = entrada.entidades.filter((e) => !reportePorEntidad.has(e.id)).map((e) => e.id);
  const porEntidad = entrada.entidades.flatMap((entidad) => {
    const r = reportePorEntidad.get(entidad.id);
    return r ? [{
      entidadId: entidad.id,
      nombre: entidad.nombre,
      ingresos: aDolares(aCentavos(r.ingresos)),
      gastos: aDolares(aCentavos(r.gastos)),
      liquidez: aDolares(aCentavos(r.liquidez)),
      transferenciasRecibidas: aDolares(aCentavos(r.transferenciasRecibidas)),
      transferenciasEntregadas: aDolares(aCentavos(r.transferenciasEntregadas)),
    }] : [];
  });
  const suma = (campo: keyof Pick<ReporteEntidad, "ingresos" | "gastos" | "liquidez" | "transferenciasRecibidas" | "transferenciasEntregadas">) =>
    entrada.reportes.reduce((total, r) => total + aCentavos(r[campo]), 0);
  const ingresos = suma("ingresos");
  const gastos = suma("gastos");
  const recibidas = suma("transferenciasRecibidas");
  const entregadas = suma("transferenciasEntregadas");
  return {
    valor: {
      porEntidad,
      entidadesSinReporte: sinReporte,
      total: {
        ingresosBrutos: aDolares(ingresos),
        gastosBrutos: aDolares(gastos),
        transferenciasRecibidas: aDolares(recibidas),
        transferenciasEntregadas: aDolares(entregadas),
        ingresosConsolidados: aDolares(ingresos - recibidas),
        gastosConsolidados: aDolares(gastos - entregadas),
        liquidez: aDolares(suma("liquidez")),
      },
    },
    fuente: [...new Set(entrada.reportes.map((r) => r.corte.fuente))].join(" + ") || entrada.corte.fuente,
    formula: "consolidado = sumas en centavos; ingresos eliminan transferencias recibidas y gastos eliminan transferencias entregadas",
    filtros: ["cortes homogeneos obligatorios", "entidades sin reporte listadas sin imputacion", "transferencias mostradas aparte"],
    corte: entrada.reportes.map((r) => r.corte).length ? entrada.reportes.map((r) => r.corte) : entrada.corte,
  };
}

const TasasEscenario = z.strictObject({ crecimientoIngresos: z.number().finite(), crecimientoGastos: z.number().finite() });
export const EntradaProyeccionEscenarios = z.strictObject({
  corte: Corte,
  ingresosBase: z.number().finite(),
  gastosBase: z.number().finite(),
  liquidezBase: z.number().finite(),
  periodos: z.number().int().positive().max(120),
  escenarios: z.strictObject({ base: TasasEscenario, optimista: TasasEscenario, pesimista: TasasEscenario }),
});

export function proyeccionEscenarios(entrada: z.output<typeof EntradaProyeccionEscenarios>): ResultadoCalculo<{
  escenarios: { nombre: "base" | "optimista" | "pesimista"; supuestos: { crecimientoIngresos: number; crecimientoGastos: number }; periodos: { periodo: number; ingresos: number; gastos: number; liquidez: number }[] }[];
}> {
  const nombres = ["base", "optimista", "pesimista"] as const;
  const escenarios = nombres.map((nombre) => {
    const tasas = entrada.escenarios[nombre];
    let ingresos = aCentavos(entrada.ingresosBase);
    let gastos = aCentavos(entrada.gastosBase);
    let liquidez = aCentavos(entrada.liquidezBase);
    const periodos = Array.from({ length: entrada.periodos }, (_, i) => {
      ingresos = Math.round(ingresos * (1 + tasas.crecimientoIngresos));
      gastos = Math.round(gastos * (1 + tasas.crecimientoGastos));
      liquidez += ingresos - gastos;
      return { periodo: i + 1, ingresos: aDolares(ingresos), gastos: aDolares(gastos), liquidez: aDolares(liquidez) };
    });
    return { nombre, supuestos: tasas, periodos };
  });
  return {
    valor: { escenarios },
    fuente: entrada.corte.fuente,
    formula: "cada periodo aplica tasas explicitas a ingresos y gastos; liquidez = liquidez anterior + ingresos - gastos; redondeo en centavos",
    filtros: [`periodos = ${entrada.periodos}`, "sin aleatoriedad", "escenarios son proyecciones, no decisiones"],
    corte: entrada.corte,
  };
}

export const EntradaAlertasDesviacion = z.strictObject({
  corte: Corte,
  metas: z.array(Meta),
  observados: z.array(Observado),
  compromisos: z.array(Compromiso),
  umbralPct: z.number().finite().nonnegative(),
});

export function alertasDesviacion(entrada: z.output<typeof EntradaAlertasDesviacion>): ResultadoCalculo<{
  alertas: ({ tipo: "desviacion"; metaId: string; desviacionPct: number } | { tipo: "compromiso_vencido"; compromisoId: string })[];
  total: number;
}> {
  const alertas: ({ tipo: "desviacion"; metaId: string; desviacionPct: number } | { tipo: "compromiso_vencido"; compromisoId: string })[] = [];
  for (const meta of entrada.metas) {
    const observado = entrada.observados.find((o) => o.indicador === meta.indicador && o.periodo === meta.periodo);
    if (!observado || meta.valor === 0) continue;
    const desviacionPct = redondearPct(((aCentavos(observado.valor) - aCentavos(meta.valor)) / Math.abs(aCentavos(meta.valor))) * 100);
    if (Math.abs(desviacionPct) > entrada.umbralPct) alertas.push({ tipo: "desviacion", metaId: meta.id, desviacionPct });
  }
  for (const compromiso of entrada.compromisos) {
    if (compromiso.estado !== "cumplido" && compromiso.fechaLimite.getTime() < entrada.corte.fechaCorte.getTime()) {
      alertas.push({ tipo: "compromiso_vencido", compromisoId: compromiso.id });
    }
  }
  return {
    valor: { alertas, total: alertas.length },
    fuente: [...new Set(entrada.observados.map((o) => o.fuente))].join(" + ") || entrada.corte.fuente,
    formula: "desviacion % = (observado - meta) / abs(meta) * 100; alerta si abs(desviacion) > umbral; vencido si fecha limite < corte",
    filtros: [`umbral = ${entrada.umbralPct}%`, "faltantes se omiten del calculo y no se inventan", "alertas son propuestas"],
    corte: entrada.corte,
  };
}

const AlertaTablero = z.object({ tipo: z.string().min(1) });
export const EntradaTableroEjecutivo = z.strictObject({
  indicadores: z.array(IndicadorTablero),
  alertas: z.array(AlertaTablero),
  compromisos: z.array(Compromiso),
});

export function tableroEjecutivo(entrada: z.output<typeof EntradaTableroEjecutivo>): ResultadoCalculo<{
  indicadores: z.infer<typeof IndicadorTablero>[];
  totalIndicadores: number;
  totalAlertas: number;
  compromisosAbiertos: number;
}> {
  const cortes = entrada.indicadores.map((i) => i.corte);
  if (cortes.length > 1) exigirCortesSimultaneos(cortes);
  const primero = cortes[0];
  if (!primero) throw new CortesDistintosError([{ campo: "fechaCorte", fuentes: [] }]);
  return {
    valor: {
      indicadores: entrada.indicadores,
      totalIndicadores: entrada.indicadores.length,
      totalAlertas: entrada.alertas.length,
      compromisosAbiertos: entrada.compromisos.filter((c) => c.estado === "abierto").length,
    },
    fuente: [...new Set(entrada.indicadores.map((i) => i.fuente))].join(" + "),
    formula: "resume indicadores ya calculados; cuenta alertas y compromisos abiertos sin recalcular cifras",
    filtros: ["todos los indicadores deben compartir corte", "decisiones y compromisos son propuestas"],
    corte: cortes,
  };
}
