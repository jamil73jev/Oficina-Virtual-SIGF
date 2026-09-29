import { describe, expect, it } from "vitest";
import { CortesDistintosError } from "@/modules/finanzas";
import {
  alertasDesviacion,
  avanceVsMeta,
  comparativoInteranual,
  consolidarEntidades,
  generarDatosDireccion,
  proyeccionEscenarios,
  tableroEjecutivo,
  type Compromiso,
  type IndicadorTablero,
  type Meta,
  type Observado,
} from "@/modules/finanzas-direccion";

const corte = (fecha = "2026-08-31", fuente = "prueba") => ({
  fechaCorte: new Date(fecha),
  horaExtraccion: "23:59",
  periodo: fecha.slice(0, 7),
  fuente,
});

describe("direccion y metas", () => {
  const metas: Meta[] = [
    { id: "M1", indicador: "ingresos", periodo: "2026-08", tipo: "mensual", valor: 100 },
    { id: "M2", indicador: "ingresos", periodo: "2026-08", tipo: "acumulada", valor: 200 },
    { id: "M3", indicador: "sin_dato", periodo: "2026-08", tipo: "mensual", valor: 50 },
  ];
  const observados: Observado[] = [
    { indicador: "ingresos", periodo: "2026-08", valor: 80, fuente: "rentas", corte: corte() },
    { indicador: "ingresos", periodo: "2025-08", valor: 50, fuente: "rentas", corte: corte("2025-08-31") },
  ];

  it("calcula brecha y avance mensual/acumulado y declara meta sin observado", () => {
    const resultado = avanceVsMeta({ corte: corte(), metas, observados });
    expect(resultado.valor.filas.find((f) => f.metaId === "M1")).toMatchObject({ observado: 80, brecha: 20, avancePct: 80, tipo: "mensual" });
    expect(resultado.valor.filas.find((f) => f.metaId === "M2")).toMatchObject({ observado: 80, brecha: 120, avancePct: 40, tipo: "acumulada" });
    expect(resultado.valor.metasSinObservado).toEqual(["M3"]);
  });

  it("calcula variacion interanual y declara el periodo anterior faltante", () => {
    const resultado = comparativoInteranual({
      corte: corte(),
      observados: [...observados, { indicador: "liquidez", periodo: "2026-08", valor: 10, fuente: "tesoreria", corte: corte() }],
    });
    expect(resultado.valor.filas.find((f) => f.indicador === "ingresos" && f.periodo === "2026-08"))
      .toMatchObject({ anterior: 50, variacionAbsoluta: 30, variacionPct: 60 });
    expect(resultado.valor.periodosFaltantes).toContainEqual({ indicador: "liquidez", periodo: "2025-08" });
  });

  it("genera alerta por umbral y compromiso vencido", () => {
    const compromisos: Compromiso[] = [
      { id: "C1", responsable: "R", decision: "D", fechaLimite: new Date("2026-08-01"), estado: "abierto" },
    ];
    const resultado = alertasDesviacion({ corte: corte(), metas: [metas[0] as Meta], observados, compromisos, umbralPct: 10 });
    expect(resultado.valor.alertas).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: "desviacion", metaId: "M1", desviacionPct: -20 }),
      expect.objectContaining({ tipo: "compromiso_vencido", compromisoId: "C1" }),
    ]));
  });
});

describe("planificacion interinstitucional", () => {
  const entidades = [
    { id: "E1", nombre: "Uno", tipo: "empresa" as const },
    { id: "E2", nombre: "Dos", tipo: "adscrita" as const },
    { id: "E3", nombre: "Tres", tipo: "otra" as const },
  ];
  const reporte = (id: string, entidadId: string, fecha = "2026-08-31") => ({
    id,
    entidadId,
    corte: corte(fecha, entidadId),
    ingresos: entidadId === "E1" ? 100 : 80,
    gastos: entidadId === "E1" ? 70 : 60,
    transferenciasRecibidas: entidadId === "E1" ? 10 : 0,
    transferenciasEntregadas: entidadId === "E2" ? 10 : 0,
    liquidez: 20,
  });

  it("rechaza reportes con cortes distintos", () => {
    expect(() => consolidarEntidades({
      corte: corte(),
      entidades,
      reportes: [reporte("R1", "E1"), reporte("R2", "E2", "2026-08-30")],
    })).toThrow(CortesDistintosError);
  });

  it("elimina transferencias, las muestra aparte y lista entidad sin reporte", () => {
    const resultado = consolidarEntidades({
      corte: corte(),
      entidades,
      reportes: [reporte("R1", "E1"), reporte("R2", "E2")],
    });
    expect(resultado.valor.total).toMatchObject({
      ingresosBrutos: 180,
      gastosBrutos: 130,
      transferenciasRecibidas: 10,
      transferenciasEntregadas: 10,
      ingresosConsolidados: 170,
      gastosConsolidados: 120,
    });
    expect(resultado.valor.entidadesSinReporte).toEqual(["E3"]);
  });

  it("proyecta tres escenarios de forma determinista y reproducible", () => {
    const entrada = {
      corte: corte(), ingresosBase: 100, gastosBase: 80, liquidezBase: 20, periodos: 2,
      escenarios: {
        base: { crecimientoIngresos: 0, crecimientoGastos: 0 },
        optimista: { crecimientoIngresos: 0.1, crecimientoGastos: 0 },
        pesimista: { crecimientoIngresos: -0.1, crecimientoGastos: 0.1 },
      },
    };
    const a = proyeccionEscenarios(entrada);
    const b = proyeccionEscenarios(entrada);
    expect(a).toEqual(b);
    expect(a.valor.escenarios.find((e) => e.nombre === "base")?.periodos).toEqual([
      { periodo: 1, ingresos: 100, gastos: 80, liquidez: 40 },
      { periodo: 2, ingresos: 100, gastos: 80, liquidez: 60 },
    ]);
  });
});

describe("tablero y generador", () => {
  const indicador = (nombre: string, fecha = "2026-08-31"): IndicadorTablero => ({
    nombre,
    valor: 1,
    unidad: "USD",
    fuente: nombre,
    formula: "calculada",
    filtros: [],
    corte: corte(fecha, nombre),
  });

  it("rechaza un tablero con cortes heterogeneos", () => {
    expect(() => tableroEjecutivo({
      indicadores: [indicador("a"), indicador("b", "2026-08-30")],
      alertas: [],
      compromisos: [],
    })).toThrow(CortesDistintosError);
  });

  it("resume sin recalcular indicadores ya calculados", () => {
    const original = indicador("a");
    const resultado = tableroEjecutivo({
      indicadores: [original],
      alertas: [{ tipo: "desviacion" }],
      compromisos: [{ id: "C", responsable: "R", decision: "D", fechaLimite: new Date("2026-09-01"), estado: "abierto" }],
    });
    expect(resultado.valor).toMatchObject({ totalIndicadores: 1, totalAlertas: 1, compromisosAbiertos: 1 });
    expect(resultado.valor.indicadores[0]).toEqual(original);
  });

  it("genera datos deterministas e incluye todos los casos borde", () => {
    const a = generarDatosDireccion("igual");
    expect(a).toEqual(generarDatosDireccion("igual"));
    expect(a.metas.some((m) => !a.observados.some((o) => o.indicador === m.indicador && o.periodo === m.periodo))).toBe(true);
    expect(a.entidades.some((e) => !a.reportes.some((r) => r.entidadId === e.id))).toBe(true);
    expect(() => consolidarEntidades({ corte: a.corte, entidades: a.entidades, reportes: a.reportes })).toThrow(CortesDistintosError);
    expect(a.compromisos.some((c) => c.estado === "vencido")).toBe(true);
    expect(a.reportes.reduce((s, r) => s + r.transferenciasRecibidas, 0)).toBe(
      a.reportes.reduce((s, r) => s + r.transferenciasEntregadas, 0),
    );
  });
});

