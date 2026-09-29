import { Aleatorio, type Corte } from "@/modules/finanzas";
import type {
  Asiento,
  Certificacion,
  CuentaContable,
  DatosContables,
  FilaCuadre,
  JustificacionCuadre,
  PartidaPresupuestaria,
  Reforma,
  TotalSubsistema,
} from "./domain";
import { aDolares } from "./comun";

/**
 * Datos SINTETICOS y deterministas del presupuesto y la contabilidad. Codigos, nombres y montos son
 * inventados. Incluye a proposito casos borde: una reforma que deja codificado negativo, una partida
 * sobreejecutada, certificaciones sin comprometer, un asiento descuadrado, un asiento posterior al
 * corte y diferencias entre lo conciliado y lo contabilizado (una justificada y otra pendiente).
 */

export interface OpcionesDatosContables {
  partidasIngreso?: number;
  partidasGasto?: number;
  /** Fecha de corte (por defecto 2026-08-31); el ejercicio es su anio. */
  fechaCorte?: Date | string;
}

export const FUENTES_CONTABLES = {
  presupuesto: "presupuesto",
  contabilidad: "contabilidad",
  tesoreria: "tesoreria",
  conciliacion: "conciliacion_bancaria",
} as const;

export const CUENTAS_SINTETICAS: readonly CuentaContable[] = [
  { id: "CT01", codigo: "111.03", nombre: "Bancos (sintetica)", naturaleza: "deudora" },
  { id: "CT02", codigo: "113.01", nombre: "Cuentas por cobrar (sintetica)", naturaleza: "deudora" },
  { id: "CT03", codigo: "213.01", nombre: "Cuentas por pagar (sintetica)", naturaleza: "acreedora" },
  { id: "CT04", codigo: "611.01", nombre: "Patrimonio (sintetica)", naturaleza: "acreedora" },
  { id: "CT05", codigo: "621.01", nombre: "Ingresos tributarios (sintetica)", naturaleza: "acreedora" },
  { id: "CT06", codigo: "624.01", nombre: "Ingresos no tributarios (sintetica)", naturaleza: "acreedora" },
  { id: "CT07", codigo: "631.01", nombre: "Gastos en personal (sintetica)", naturaleza: "deudora" },
  { id: "CT08", codigo: "634.01", nombre: "Bienes y servicios de consumo (sintetica)", naturaleza: "deudora" },
];

const GRUPOS_INGRESO = ["11", "13", "14", "17", "18"];
const GRUPOS_GASTO = ["51", "53", "57", "73", "75", "84"];

const MS_DIA = 86_400_000;
const pad = (n: number, largo: number) => String(n).padStart(largo, "0");
const sumarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * MS_DIA);

function aFechaUTC(valor: Date | string): Date {
  const d = new Date(valor);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Partida en construccion: montos en centavos hasta el final. */
interface Borrador {
  id: string;
  codigo: string;
  nombre: string;
  tipo: "ingreso" | "gasto";
  asignado: number;
  codificado: number;
  reformas: Reforma[];
  certificado: number;
  comprometido: number;
  devengado: number;
  recaudadoOPagado: number;
}

export function generarDatosContables(
  semilla: number | string = 20260831,
  opciones: OpcionesDatosContables = {},
): DatosContables {
  const rnd = new Aleatorio(`contable:${semilla}`);
  const fechaCorte = aFechaUTC(opciones.fechaCorte ?? "2026-08-31");
  const ejercicio = fechaCorte.getUTCFullYear();
  const inicio = new Date(Date.UTC(ejercicio, 0, 1));
  const diasTranscurridos = Math.round((fechaCorte.getTime() - inicio.getTime()) / MS_DIA);
  const fechaEnEjercicio = () => sumarDias(inicio, rnd.entero(0, diasTranscurridos));
  const periodo = fechaCorte.toISOString().slice(0, 7);
  const nGasto = Math.max(4, Math.floor(opciones.partidasGasto ?? 24));
  const nIngreso = Math.max(2, Math.floor(opciones.partidasIngreso ?? 12));
  const porcion = (centavos: number, min: number, max: number) => Math.floor(centavos * (min + rnd.siguiente() * (max - min)));

  // 1) Partidas con presupuesto inicial equilibrado: total ingresos = total gastos.
  const gastos: Borrador[] = Array.from({ length: nGasto }, (_, i) => ({
    id: `PG${pad(i + 1, 3)}`,
    codigo: `${rnd.elegir(GRUPOS_GASTO)}.${pad(i + 1, 2)}.${pad(rnd.entero(1, 20), 2)}`,
    nombre: `Partida sintetica de gasto ${pad(i + 1, 3)}`,
    tipo: "gasto",
    asignado: 5_000_000 + Math.floor(rnd.siguiente() ** 2 * 200_000_000),
    codificado: 0,
    reformas: [],
    certificado: 0,
    comprometido: 0,
    devengado: 0,
    recaudadoOPagado: 0,
  }));
  const totalGastos = gastos.reduce((a, p) => a + p.asignado, 0);
  const pesos = Array.from({ length: nIngreso }, () => 1 + rnd.siguiente() * 4);
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  let restante = totalGastos;
  const ingresos: Borrador[] = pesos.map((peso, i) => {
    const asignado = i === nIngreso - 1 ? restante : Math.floor((totalGastos * peso) / sumaPesos);
    restante -= asignado;
    return {
      id: `PI${pad(i + 1, 3)}`,
      codigo: `${rnd.elegir(GRUPOS_INGRESO)}.${pad(i + 1, 2)}.${pad(rnd.entero(1, 20), 2)}`,
      nombre: `Partida sintetica de ingreso ${pad(i + 1, 3)}`,
      tipo: "ingreso",
      asignado,
      codificado: 0,
      reformas: [],
      certificado: 0,
      comprometido: 0,
      devengado: 0,
      recaudadoOPagado: 0,
    };
  });
  for (const p of [...gastos, ...ingresos]) p.codificado = p.asignado;

  // 2) Reformas: aumentos y disminuciones en pares ingreso/gasto; traspasos entre gastos que suman 0.
  let nReformas = 0;
  let nResoluciones = 0;
  const reformar = (p: Borrador, tipo: Reforma["tipo"], centavos: number, fecha: Date, referencia: string) => {
    p.reformas.push({ id: `RF${pad(++nReformas, 4)}`, partidaId: p.id, tipo, valor: aDolares(centavos), fecha, referencia });
    p.codificado += tipo === "disminucion" ? -centavos : centavos;
  };
  const resolucion = () => `RES-${ejercicio}-${pad(++nResoluciones, 3)}`;
  for (let k = 0; k < Math.ceil(nGasto / 4); k++) {
    const ingreso = rnd.elegir(ingresos);
    const gasto = rnd.elegir(gastos);
    const tipo = rnd.probabilidad(0.7) ? "aumento" : "disminucion";
    const valor = tipo === "aumento" ? porcion(gasto.codificado, 0.05, 0.3) : porcion(Math.min(gasto.codificado, ingreso.codificado), 0.02, 0.2);
    if (valor <= 0) continue;
    const fecha = fechaEnEjercicio();
    const ref = resolucion();
    reformar(ingreso, tipo, valor, fecha, ref);
    reformar(gasto, tipo, valor, fecha, ref);
  }
  for (let k = 0; k < Math.ceil(nGasto / 3); k++) {
    const origen = rnd.elegir(gastos.slice(3));
    const destino = rnd.elegir(gastos.slice(1));
    const valor = porcion(origen.codificado, 0.02, 0.2);
    if (origen === destino || valor <= 0) continue;
    const fecha = fechaEnEjercicio();
    const ref = resolucion();
    reformar(origen, "traspaso", -valor, fecha, ref);
    reformar(destino, "traspaso", valor, fecha, ref);
  }
  // Caso borde: un traspaso que deja a PG001 con codificado negativo (-1.000,00).
  const [g0, g1, g2, g3] = gastos as [Borrador, Borrador, Borrador, Borrador];
  {
    const valor = g0.codificado + 100_000;
    const fecha = fechaEnEjercicio();
    const ref = resolucion();
    reformar(g0, "traspaso", -valor, fecha, ref);
    reformar(g1, "traspaso", valor, fecha, ref);
  }
  // Reforma posterior al corte: las calculadoras no deben aplicarla.
  {
    const fecha = sumarDias(fechaCorte, 5);
    const ref = resolucion();
    const valor = 250_000;
    const ingreso = ingresos[0] as Borrador;
    ingreso.reformas.push({ id: `RF${pad(++nReformas, 4)}`, partidaId: ingreso.id, tipo: "aumento", valor: aDolares(valor), fecha, referencia: ref });
    g3.reformas.push({ id: `RF${pad(++nReformas, 4)}`, partidaId: g3.id, tipo: "aumento", valor: aDolares(valor), fecha, referencia: ref });
  }

  // 3) Ejecucion al corte. Gasto: certificado >= comprometido >= devengado >= pagado.
  for (const p of gastos) {
    if (p.codificado <= 0) continue; // PG001 queda sin ejecucion y con disponibilidad negativa
    p.certificado = porcion(p.codificado, 0.5, 0.95);
    p.comprometido = porcion(p.certificado, 0.6, 1);
    p.devengado = porcion(p.comprometido, 0.6, 1);
    p.recaudadoOPagado = porcion(p.devengado, 0.7, 1);
  }
  // Caso borde: PG003 sobreejecutada (devengado supera el codificado en 2.500,00).
  g2.devengado = g2.codificado + 250_000;
  g2.comprometido = g2.devengado;
  g2.certificado = g2.devengado;
  g2.recaudadoOPagado = g2.codificado;
  // Caso borde: PG004 con la mitad de lo certificado sin comprometer.
  g3.comprometido = Math.floor(g3.certificado / 2);
  g3.devengado = Math.min(g3.devengado, g3.comprometido);
  g3.recaudadoOPagado = Math.min(g3.recaudadoOPagado, g3.devengado);
  for (const p of ingresos) {
    p.devengado = porcion(Math.max(0, p.codificado), 0.4, 0.8);
    p.recaudadoOPagado = porcion(p.devengado, 0.8, 1);
  }

  // 4) Certificaciones: la comprometida por el comprometido, el resto emitido; algunas anuladas.
  const certificaciones: Certificacion[] = [];
  const certificar = (partidaId: string, centavos: number, estado: Certificacion["estado"]) =>
    certificaciones.push({ id: `CP${pad(certificaciones.length + 1, 4)}`, partidaId, valor: aDolares(centavos), estado, fecha: fechaEnEjercicio() });
  for (const p of gastos) {
    if (p.certificado <= 0) continue;
    if (p.comprometido > 0) certificar(p.id, p.comprometido, "comprometida");
    const sinComprometer = p.certificado - p.comprometido;
    if (sinComprometer > 0) {
      const primera = rnd.probabilidad(0.5) ? Math.floor(sinComprometer / 2) : sinComprometer;
      certificar(p.id, primera, "emitida");
      if (sinComprometer - primera > 0) certificar(p.id, sinComprometer - primera, "emitida");
    }
    if (rnd.probabilidad(0.15)) certificar(p.id, porcion(p.certificado, 0.05, 0.2) + 1, "anulada");
  }

  // 5) Asientos: recaudacion por partida de ingreso y pago por partida de gasto.
  const asientos: Asiento[] = [];
  const asentar = (fecha: Date, glosa: string, origen: Asiento["origen"], lineas: [string, number, number][], referencia: string | null) =>
    asientos.push({
      id: `AS${pad(asientos.length + 1, 6)}`,
      fecha,
      glosa,
      origen,
      referencia,
      lineas: lineas.map(([cuentaId, debe, haber]) => ({ cuentaId, debe: aDolares(debe), haber: aDolares(haber) })),
    });

  const totalRecaudado = ingresos.reduce((a, p) => a + p.recaudadoOPagado, 0);
  const totalPagado = gastos.reduce((a, p) => a + p.recaudadoOPagado, 0);
  const primerIngreso = ingresos[0] as Borrador;
  // Diferencias al corte: depositos en transito (conciliado < fuente) y recaudacion no contabilizada.
  const enTransito = Math.max(1, Math.floor(primerIngreso.recaudadoOPagado * 0.1));
  const noContabilizado = Math.max(1, Math.floor(primerIngreso.recaudadoOPagado * 0.05));

  for (const p of ingresos) {
    const valor = p === primerIngreso ? p.recaudadoOPagado - enTransito - noContabilizado : p.recaudadoOPagado;
    if (valor <= 0) continue;
    const cuentaIngreso = p.codigo.startsWith("1") && rnd.probabilidad(0.6) ? "CT05" : "CT06";
    asentar(fechaEnEjercicio(), `Recaudacion acumulada ${p.codigo}`, "recaudacion", [["CT01", valor, 0], [cuentaIngreso, 0, valor]], p.id);
  }
  for (const p of gastos) {
    if (p.recaudadoOPagado <= 0) continue;
    const cuentaGasto = p.codigo.startsWith("51") ? "CT07" : "CT08";
    const valor = p.recaudadoOPagado;
    asentar(fechaEnEjercicio(), `Pago acumulado ${p.codigo}`, "pago", [[cuentaGasto, valor, 0], ["CT01", 0, valor]], p.id);
  }
  for (let k = 0; k < 3; k++) {
    const valor = rnd.entero(10_000, 500_000);
    asentar(fechaEnEjercicio(), "Ajuste de cuentas por cobrar", "ajuste", [["CT02", valor, 0], ["CT06", 0, valor]], null);
  }
  // Caso borde: asiento descuadrado (debe 100,00 frente a haber 99,50).
  asentar(sumarDias(fechaCorte, -10), "Ajuste con error de digitacion", "ajuste", [["CT08", 10_000, 0], ["CT03", 0, 9_950]], "AJ-DESCUADRE");
  // Caso borde: asiento registrado despues del corte (queda fuera de todo calculo al corte).
  asentar(sumarDias(fechaCorte, 2), "Recaudacion registrada despues del corte", "recaudacion", [["CT01", 50_000, 0], ["CT05", 0, 50_000]], null);

  const corte = (fuente: string): Corte => ({ fechaCorte, horaExtraccion: "23:59", periodo, fuente });
  const cortes = Object.values(FUENTES_CONTABLES).map(corte);
  const subsistemas: TotalSubsistema[] = [
    { origen: "recaudacion", fuente: FUENTES_CONTABLES.tesoreria, total: aDolares(totalRecaudado), corte: corte(FUENTES_CONTABLES.tesoreria) },
    { origen: "pago", fuente: FUENTES_CONTABLES.tesoreria, total: aDolares(totalPagado), corte: corte(FUENTES_CONTABLES.tesoreria) },
  ];

  // 6) Matriz de cuadre: recaudacion con una diferencia justificada y otras pendientes; pagos cuadrados.
  const cuadre: FilaCuadre[] = [
    {
      concepto: "recaudacion",
      fuente: FUENTES_CONTABLES.tesoreria,
      valorFuente: aDolares(totalRecaudado),
      valorConciliado: aDolares(totalRecaudado - enTransito),
      valorContabilizado: aDolares(totalRecaudado - enTransito - noContabilizado),
      valorPresupuestario: aDolares(totalRecaudado),
    },
    {
      concepto: "pagos",
      fuente: FUENTES_CONTABLES.tesoreria,
      valorFuente: aDolares(totalPagado),
      valorConciliado: aDolares(totalPagado),
      valorContabilizado: aDolares(totalPagado),
      valorPresupuestario: aDolares(totalPagado),
    },
  ];
  const justificaciones: JustificacionCuadre[] = [
    {
      id: "JU001",
      concepto: "recaudacion",
      tramo: "fuente_conciliado",
      valor: aDolares(enTransito),
      motivo: "Depositos en transito al corte (sintetico)",
      documento: `EXTRACTO-${periodo}`,
    },
    {
      id: "JU002",
      concepto: "recaudacion",
      tramo: "contabilizado_presupuestario",
      valor: aDolares(-enTransito),
      motivo: "Depositos en transito aun no contabilizados (sintetico)",
      documento: `EXTRACTO-${periodo}`,
    },
  ];

  const aPartida = (p: Borrador): PartidaPresupuestaria => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    tipo: p.tipo,
    asignadoInicial: aDolares(p.asignado),
    reformas: p.reformas,
    certificado: aDolares(p.certificado),
    comprometido: aDolares(p.comprometido),
    devengado: aDolares(p.devengado),
    recaudadoOPagado: aDolares(p.recaudadoOPagado),
    ejercicio,
  });

  return {
    ejercicio,
    partidas: [...ingresos, ...gastos].map(aPartida),
    certificaciones,
    cuentas: CUENTAS_SINTETICAS.map((c) => ({ ...c })),
    asientos,
    subsistemas,
    cuadre,
    justificaciones,
    cortes,
  };
}
