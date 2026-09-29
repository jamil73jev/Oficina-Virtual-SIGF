import { Aleatorio } from "@/modules/finanzas";
import type { Compromiso, DatosDireccion, EntidadVinculada, IndicadorTablero, Meta, Observado, ReporteEntidad } from "./domain";

const corte = (fecha: string, fuente: string) => ({
  fechaCorte: new Date(`${fecha}T00:00:00.000Z`),
  horaExtraccion: "23:59",
  periodo: fecha.slice(0, 7),
  fuente,
});

/** Datos ficticios deterministas con faltantes, desvios y cortes incompatibles deliberados. */
export function generarDatosDireccion(semilla: number | string = 20260902): DatosDireccion {
  const rnd = new Aleatorio(semilla);
  const corteGeneral = corte("2026-08-31", "direccion_sintetica");
  const metas: Meta[] = [
    { id: "M1", indicador: "ingresos", periodo: "2026-08", tipo: "mensual", valor: 100_000 },
    { id: "M2", indicador: "ingresos", periodo: "2026-08", tipo: "acumulada", valor: 800_000 },
    { id: "M3", indicador: "liquidez", periodo: "2026", tipo: "anual", valor: 250_000 },
    { id: "M4", indicador: "sin_observado", periodo: "2026-08", tipo: "mensual", valor: 10_000 },
  ];
  const observados: Observado[] = [
    { indicador: "ingresos", periodo: "2026-08", valor: 60_000 + rnd.entero(0, 999), fuente: "rentas_sintetica", corte: corteGeneral },
    { indicador: "ingresos", periodo: "2025-08", valor: 52_000, fuente: "rentas_sintetica", corte: corte("2025-08-31", "rentas_sintetica") },
    { indicador: "liquidez", periodo: "2026", valor: 240_000, fuente: "tesoreria_sintetica", corte: corteGeneral },
    { indicador: "sin_meta", periodo: "2026-08", valor: 50, fuente: "otra_sintetica", corte: corteGeneral },
  ];
  const entidades: EntidadVinculada[] = [
    { id: "E1", nombre: "Empresa Sintética Uno", tipo: "empresa" },
    { id: "E2", nombre: "Entidad Sintética Dos", tipo: "adscrita" },
    { id: "E3", nombre: "Entidad Sintética Sin Reporte", tipo: "otra" },
  ];
  const reportes: ReporteEntidad[] = [
    { id: "R1", entidadId: "E1", corte: corteGeneral, ingresos: 120_000, gastos: 80_000, transferenciasRecibidas: 10_000, transferenciasEntregadas: 0, liquidez: 30_000 },
    { id: "R2", entidadId: "E2", corte: corteGeneral, ingresos: 90_000, gastos: 70_000, transferenciasRecibidas: 0, transferenciasEntregadas: 10_000, liquidez: 20_000 },
    { id: "R3-CORTE-DISTINTO", entidadId: "E2", corte: corte("2026-08-30", "entidad_demorada"), ingresos: 1, gastos: 1, transferenciasRecibidas: 0, transferenciasEntregadas: 0, liquidez: 1 },
  ];
  const compromisos: Compromiso[] = [
    { id: "C1", responsable: "Dirección", decision: "Revisar desviación", fechaLimite: new Date("2026-08-15"), estado: "abierto" },
    { id: "C2", responsable: "Planificación", decision: "Consolidar reportes", fechaLimite: new Date("2026-09-15"), estado: "abierto" },
    { id: "C3", responsable: "Tesorería", decision: "Confirmar liquidez", fechaLimite: new Date("2026-08-01"), estado: "vencido" },
  ];
  const indicadores: IndicadorTablero[] = observados.slice(0, 1).map((o) => ({
    nombre: o.indicador,
    valor: o.valor,
    unidad: "USD",
    fuente: o.fuente,
    formula: "valor observado de fuente",
    filtros: [`periodo = ${o.periodo}`],
    corte: o.corte,
  }));
  return { metas, observados, entidades, reportes, compromisos, indicadores, corte: corteGeneral };
}

