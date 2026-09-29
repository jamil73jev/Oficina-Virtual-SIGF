import { describe, expect, it } from "vitest";
import { CortesDistintosError, FinanzasError, type Corte } from "@/modules/finanzas";
import {
  asientoCuadra,
  balanceComprobacion,
  conciliacionContable,
  cuadreFinContPres,
  disponibilidadPartida,
  ejecucionPresupuestaria,
  reformasCertificaciones,
  type Asiento,
  type Certificacion,
  type CuentaContable,
  type FilaCuadre,
  type JustificacionCuadre,
  type PartidaPresupuestaria,
  type Reforma,
} from "@/modules/finanzas-contable";

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const corte = (fuente: string, fechaCorte = "2026-08-31", horaExtraccion = "23:59"): Corte => ({
  fechaCorte: fecha(fechaCorte),
  horaExtraccion,
  periodo: fechaCorte.slice(0, 7),
  fuente,
});
const CORTE_PRES = corte("presupuesto");
const CORTE_CONT = corte("contabilidad");

const reforma = (id: string, partidaId: string, tipo: Reforma["tipo"], valor: number, dia: string, referencia?: string): Reforma => ({
  id,
  partidaId,
  tipo,
  valor,
  fecha: fecha(dia),
  referencia,
});

function partida(
  id: string,
  tipo: PartidaPresupuestaria["tipo"],
  asignadoInicial: number,
  reformas: Reforma[],
  ejecucion: Partial<Pick<PartidaPresupuestaria, "certificado" | "comprometido" | "devengado" | "recaudadoOPagado" | "ejercicio">> = {},
): PartidaPresupuestaria {
  return {
    id,
    codigo: `${tipo === "gasto" ? "5" : "1"}-${id}`,
    nombre: `Partida ${id}`,
    tipo,
    asignadoInicial,
    reformas,
    certificado: 0,
    comprometido: 0,
    devengado: 0,
    recaudadoOPagado: 0,
    ejercicio: 2026,
    ...ejecucion,
  };
}

/**
 * G1: 1000 + 200 - 50 - 100 (traspaso cedido) = 1050; una reforma posterior al corte no cuenta.
 * G2: 300 + 100 (traspaso recibido) - 500 = -100 (reforma que deja codificado negativo).
 * G3: 100 sin reformas, sobreejecutada. I1: 1400 + 200 - 550 = 1050.
 */
function partidasBase(): PartidaPresupuestaria[] {
  return [
    partida(
      "G1",
      "gasto",
      1000,
      [
        reforma("R1", "G1", "aumento", 200, "2026-03-01", "RES-1"),
        reforma("R2", "G1", "disminucion", 50, "2026-04-01", "RES-2"),
        reforma("R3", "G1", "traspaso", -100, "2026-05-01", "RES-3"),
        reforma("R4", "G1", "aumento", 999, "2026-09-10", "RES-9"),
      ],
      { certificado: 800, comprometido: 600, devengado: 525, recaudadoOPagado: 400 },
    ),
    partida("G2", "gasto", 300, [
      reforma("R5", "G2", "traspaso", 100, "2026-05-01", "RES-3"),
      reforma("R6", "G2", "disminucion", 500, "2026-06-01", "RES-2"),
    ]),
    partida("G3", "gasto", 100, [], { certificado: 150, comprometido: 150, devengado: 120, recaudadoOPagado: 120 }),
    partida(
      "I1",
      "ingreso",
      1400,
      [reforma("R7", "I1", "aumento", 200, "2026-03-01", "RES-1"), reforma("R8", "I1", "disminucion", 550, "2026-04-01", "RES-2")],
      { devengado: 800, recaudadoOPagado: 700 },
    ),
  ];
}

describe("ejecucion_presupuestaria", () => {
  it("calcula el codificado con reformas al corte y los porcentajes sobre el codificado", () => {
    const r = ejecucionPresupuestaria({ corte: CORTE_PRES, ejercicio: 2026, partidas: partidasBase() });
    const g1 = r.valor.filas.find((f) => f.partidaId === "G1");
    expect(g1).toMatchObject({ asignadoInicial: 1000, reformas: 50, codificado: 1050, saldoPorDevengar: 525 });
    expect(g1?.porcentajes).toEqual({ certificado: 0.7619, comprometido: 0.5714, devengado: 0.5, recaudadoOPagado: 0.381 });
    expect(r.valor.filas.find((f) => f.partidaId === "G2")?.codificado).toBe(-100);
    expect(r.valor.filas.find((f) => f.partidaId === "G2")?.porcentajes.devengado).toBeNull();
    expect(r.valor.reformasPosterioresAlCorte).toEqual(["R4"]);
    expect(r.valor.totales.gasto).toMatchObject({ asignadoInicial: 1400, codificado: 1050, devengado: 645 });
    expect(r.valor.totales.ingreso).toMatchObject({ codificado: 1050, devengado: 800, recaudadoOPagado: 700 });
    expect(r.fuente).toBe("presupuesto");
    expect(r.formula).toContain("codificado = asignado inicial");
    expect(r.filtros).toContain("ejercicio = 2026");
    expect(r.corte).toEqual(CORTE_PRES);
  });

  it("suma en centavos: 0.10 + 0.20 da 0.30 exacto", () => {
    const r = ejecucionPresupuestaria({
      corte: CORTE_PRES,
      ejercicio: 2026,
      partidas: [partida("X", "gasto", 0.1, [reforma("RX", "X", "aumento", 0.2, "2026-01-02")])],
    });
    expect(r.valor.filas[0]?.codificado).toBe(0.3);
  });

  it("lista las desviaciones: codificado negativo, sobreejecucion y avance fuera de tolerancia", () => {
    const r = ejecucionPresupuestaria({
      corte: CORTE_PRES,
      ejercicio: 2026,
      partidas: partidasBase(),
      avanceEsperado: 0.67,
      tolerancia: 0.1,
    });
    const de = (id: string) => r.valor.desviaciones.filter((d) => d.partidaId === id).map((d) => d.tipo);
    expect(de("G2")).toEqual(["codificado_negativo"]);
    expect(de("G3")).toEqual(["sobreejecucion", "certificado_excede_codificado", "sobre_avance"]);
    expect(de("G1")).toEqual(["bajo_avance"]);
    expect(de("I1")).toEqual([]);
    expect(r.valor.desviaciones.find((d) => d.partidaId === "G3" && d.tipo === "sobreejecucion")?.valor).toBe(20);
  });

  it("informa partidas de otro ejercicio y duplicadas sin sumarlas", () => {
    const partidas = [...partidasBase(), partida("V", "gasto", 5000, [], { ejercicio: 2025 }), partida("G3", "gasto", 7777, [])];
    const r = ejecucionPresupuestaria({ corte: CORTE_PRES, ejercicio: 2026, partidas, tipo: "gasto" });
    expect(r.valor.partidasOtroEjercicio).toEqual(["V"]);
    expect(r.valor.partidasDuplicadas).toEqual(["G3"]);
    expect(r.valor.totales.ingreso).toBeNull();
    expect(r.valor.totales.gasto?.asignadoInicial).toBe(1400);
  });
});

describe("disponibilidad_partida", () => {
  it("disponible = codificado - certificado y alerta si es negativo", () => {
    const r = disponibilidadPartida({ corte: CORTE_PRES, ejercicio: 2026, partidas: partidasBase() });
    const disp = Object.fromEntries(r.valor.filas.map((f) => [f.partidaId, f.disponible]));
    expect(disp).toEqual({ G1: 250, G2: -100, G3: -50 });
    expect(r.valor.alertas.map((a) => a.partidaId)).toEqual(["G2", "G3"]);
  });

  it("rechaza una certificacion sin disponibilidad y descuenta las aprobables en orden", () => {
    const r = disponibilidadPartida({
      corte: CORTE_PRES,
      ejercicio: 2026,
      partidas: partidasBase(),
      solicitudes: [
        { id: "S1", partidaId: "G1", valor: 200 },
        { id: "S2", partidaId: "G1", valor: 100 },
        { id: "S3", partidaId: "G2", valor: 10 },
        { id: "S4", partidaId: "I1", valor: 10 },
        { id: "S5", partidaId: "NO", valor: 10 },
      ],
    });
    expect(r.valor.solicitudes.map((s) => [s.solicitudId, s.resultado, s.motivo])).toEqual([
      ["S1", "aprobable", null],
      ["S2", "rechazada", "sin_disponibilidad"],
      ["S3", "rechazada", "sin_disponibilidad"],
      ["S4", "rechazada", "partida_de_ingreso"],
      ["S5", "rechazada", "partida_inexistente"],
    ]);
    expect(r.valor.solicitudes[0]).toMatchObject({ disponibleAntes: 250, disponibleDespues: 50 });
    expect(r.valor.solicitudes[1]).toMatchObject({ disponibleAntes: 50, disponibleDespues: 50 });
    // Simulacion: el reporte por partida no cambia.
    expect(r.valor.filas.find((f) => f.partidaId === "G1")?.disponible).toBe(250);
  });

  it("filtra por partida e informa las que no aplican o no existen", () => {
    const r = disponibilidadPartida({ corte: CORTE_PRES, ejercicio: 2026, partidas: partidasBase(), partidaIds: ["G1", "I1", "ZZ"] });
    expect(r.valor.filas.map((f) => f.partidaId)).toEqual(["G1"]);
    expect(r.valor.noAplica).toEqual(["I1"]);
    expect(r.valor.noEncontradas).toEqual(["ZZ"]);
  });
});

describe("reformas_certificaciones", () => {
  const certificaciones: Certificacion[] = [
    { id: "C1", partidaId: "G1", valor: 600, estado: "comprometida" },
    { id: "C2", partidaId: "G1", valor: 200, estado: "emitida" },
    { id: "C3", partidaId: "G1", valor: 50, estado: "anulada" },
    { id: "C4", partidaId: "G3", valor: 150, estado: "comprometida" },
    { id: "C5", partidaId: "GX", valor: 10, estado: "emitida" },
    { id: "C6", partidaId: "G1", valor: 30, estado: "emitida", fecha: fecha("2026-09-15") },
  ];

  it("resume reformas, verifica equilibrio y traspasos, e informa el codificado negativo", () => {
    const r = reformasCertificaciones({ corte: CORTE_PRES, ejercicio: 2026, partidas: partidasBase(), certificaciones });
    const ref = r.valor.reformas;
    expect(ref.porTipo).toEqual({
      aumento: { cantidad: 2, valor: 400 },
      disminucion: { cantidad: 3, valor: 1100 },
      traspaso: { cantidad: 2, valor: 200 },
    });
    expect(ref.traspasosNeto).toBe(0);
    expect(ref.traspasosDescuadrados).toEqual([]);
    expect(ref.equilibrioInicial).toEqual({ ingresos: 1400, gastos: 1400, diferencia: 0 });
    expect(ref.equilibrioReformas).toEqual({ ingresos: -350, gastos: -350, diferencia: 0 });
    expect(ref.equilibrioCodificado).toEqual({ ingresos: 1050, gastos: 1050, diferencia: 0 });
    expect(ref.partidasCodificadoNegativo).toEqual([{ partidaId: "G2", codigo: "5-G2", codificado: -100 }]);
    expect(ref.posterioresAlCorte).toEqual(["R4"]);
    expect(ref.cuadran).toBe(false);
  });

  it("detecta traspasos que no suman cero y desequilibrio entre ingresos y gastos", () => {
    const partidas = partidasBase().filter((p) => p.id !== "G2");
    const g3 = partidas.find((p) => p.id === "G3");
    g3?.reformas.push(reforma("R9", "G3", "traspaso", -30, "2026-07-01", "RES-7"));
    const r = reformasCertificaciones({ corte: CORTE_PRES, ejercicio: 2026, partidas, certificaciones: [] });
    expect(r.valor.reformas.traspasosNeto).toBe(-130);
    expect(r.valor.reformas.traspasosDescuadrados).toEqual([
      { referencia: "RES-3", neto: -100, reformaIds: ["R3"] },
      { referencia: "RES-7", neto: -30, reformaIds: ["R9"] },
    ]);
    expect(r.valor.reformas.equilibrioReformas).toEqual({ ingresos: -350, gastos: 20, diferencia: -370 });
    expect(r.valor.reformas.cuadran).toBe(false);
  });

  it("reformas cuadradas y sin partidas de ingreso: equilibrio no verificable (null)", () => {
    const partidas = [
      partida("A", "gasto", 100, [reforma("T1", "A", "traspaso", -40, "2026-02-01", "RES-T")]),
      partida("B", "gasto", 100, [reforma("T2", "B", "traspaso", 40, "2026-02-01", "RES-T")]),
    ];
    const r = reformasCertificaciones({ corte: CORTE_PRES, ejercicio: 2026, partidas, certificaciones: [] });
    expect(r.valor.reformas.cuadran).toBeNull();
    expect(r.valor.observaciones[0]).toContain("no se puede verificar el equilibrio");
  });

  it("lista certificaciones sin comprometer y diferencias con el certificado de la partida", () => {
    const partidas = partidasBase();
    const g1 = partidas.find((p) => p.id === "G1");
    if (g1) g1.certificado = 850;
    const r = reformasCertificaciones({ corte: CORTE_PRES, ejercicio: 2026, partidas, certificaciones });
    const c = r.valor.certificaciones;
    expect(c.porEstado).toEqual({
      emitida: { cantidad: 2, valor: 210 },
      comprometida: { cantidad: 2, valor: 750 },
      anulada: { cantidad: 1, valor: 50 },
    });
    expect(c.vigentes).toEqual({ cantidad: 4, valor: 960 });
    expect(c.sinComprometer.map((s) => s.certificacionId)).toEqual(["C2", "C5"]);
    expect(c.diferenciasConPartida).toEqual([
      { partidaId: "G1", codigo: "5-G1", certificadoPartida: 850, sumaCertificaciones: 800, diferencia: -50 },
    ]);
    expect(c.sinPartida).toEqual(["C5"]);
    expect(c.posterioresAlCorte).toEqual(["C6"]);
  });
});

const CUENTAS: CuentaContable[] = [
  { id: "B", codigo: "1.1", nombre: "Bancos", naturaleza: "deudora" },
  { id: "P", codigo: "2.1", nombre: "Cuentas por pagar", naturaleza: "acreedora" },
  { id: "I", codigo: "6.2", nombre: "Ingresos", naturaleza: "acreedora" },
  { id: "G", codigo: "6.3", nombre: "Gastos", naturaleza: "deudora" },
];

const asiento = (id: string, dia: string, origen: Asiento["origen"], lineas: [string, number, number][]): Asiento => ({
  id,
  fecha: fecha(dia),
  glosa: `Asiento ${id}`,
  origen,
  referencia: null,
  lineas: lineas.map(([cuentaId, debe, haber]) => ({ cuentaId, debe, haber })),
});

const ASIENTOS: Asiento[] = [
  asiento("A1", "2026-08-01", "recaudacion", [["B", 100.1, 0], ["I", 0, 100.1]]),
  asiento("A2", "2026-08-02", "recaudacion", [["B", 0.2, 0], ["I", 0, 0.2]]),
  asiento("A3", "2026-08-05", "pago", [["G", 50, 0], ["B", 0, 50]]),
  asiento("A4", "2026-08-10", "ajuste", [["G", 10, 0], ["P", 0, 9.5]]),
  asiento("A5", "2026-09-02", "recaudacion", [["B", 999, 0], ["I", 0, 999]]),
  asiento("A1", "2026-08-01", "recaudacion", [["B", 7, 0], ["I", 0, 7]]),
  asiento("A6", "2026-08-11", "ajuste", [["ZZ", 5, 0], ["P", 0, 5]]),
];

describe("balance_comprobacion", () => {
  it("detecta el asiento descuadrado y que el debe no iguala al haber", () => {
    const r = balanceComprobacion({ corte: CORTE_CONT, cuentas: CUENTAS, asientos: ASIENTOS });
    expect(r.valor.totalDebe).toBe(165.3);
    expect(r.valor.totalHaber).toBe(164.8);
    expect(r.valor.diferencia).toBe(0.5);
    expect(r.valor.cuadra).toBe(false);
    expect(r.valor.asientosDescuadrados).toEqual([
      { asientoId: "A4", fecha: "2026-08-10", origen: "ajuste", debe: 10, haber: 9.5, diferencia: 0.5 },
    ]);
    expect(r.valor.asientosDuplicados).toEqual(["A1"]);
    expect(r.valor.cantidadAsientos).toBe(5);
    expect(asientoCuadra(ASIENTOS[3] as Asiento)).toBe(false);
  });

  it("presenta saldos por cuenta segun su naturaleza e informa cuentas no catalogadas", () => {
    const r = balanceComprobacion({ corte: CORTE_CONT, cuentas: CUENTAS, asientos: ASIENTOS });
    const saldo = Object.fromEntries(r.valor.cuentas.map((c) => [c.cuentaId, c.saldo]));
    expect(saldo).toEqual({ B: 50.3, P: 14.5, I: 100.3, G: 60, ZZ: 5 });
    expect(r.valor.cuentas.find((c) => c.cuentaId === "ZZ")?.naturaleza).toBeNull();
    expect(r.valor.lineasCuentaNoCatalogada).toEqual([{ asientoId: "A6", cuentaId: "ZZ", debe: 5, haber: 0 }]);
  });

  it("cuadra con asientos balanceados y filtra por rango y origen", () => {
    const r = balanceComprobacion({
      corte: CORTE_CONT,
      cuentas: CUENTAS,
      asientos: ASIENTOS,
      desde: fecha("2026-08-02"),
      origenes: ["recaudacion", "pago"],
    });
    expect(r.valor.cantidadAsientos).toBe(2);
    expect(r.valor).toMatchObject({ totalDebe: 50.2, totalHaber: 50.2, cuadra: true, asientosDescuadrados: [] });
    expect(r.filtros).toContain("fecha >= 2026-08-02");
  });

  it("marca lineas con debe y haber a la vez sin excluirlas", () => {
    const r = balanceComprobacion({
      corte: CORTE_CONT,
      cuentas: CUENTAS,
      asientos: [asiento("L1", "2026-08-01", "ajuste", [["B", 1, 1]])],
    });
    expect(r.valor.lineasInvalidas).toEqual([{ asientoId: "L1", indice: 0, motivo: "debe_y_haber" }]);
    expect(r.valor.totalDebe).toBe(1);
  });
});

describe("conciliacion_contable", () => {
  const tesoreria = corte("tesoreria");

  it("compara asientos por origen con los totales de los subsistemas", () => {
    const r = conciliacionContable({
      corte: CORTE_CONT,
      asientos: ASIENTOS,
      subsistemas: [
        { origen: "recaudacion", fuente: "rentas", total: 60, corte: corte("rentas") },
        { origen: "recaudacion", fuente: "tesoreria", total: 40.3, corte: tesoreria },
        { origen: "pago", fuente: "tesoreria", total: 55, corte: tesoreria },
      ],
    });
    const fila = (o: string) => r.valor.filas.find((f) => f.origen === o);
    expect(fila("recaudacion")).toMatchObject({ contabilizado: 100.3, subsistema: 100.3, diferencia: 0, estado: "cuadra", cantidadAsientos: 2 });
    expect(fila("pago")).toMatchObject({ contabilizado: 50, subsistema: 55, diferencia: -5, estado: "diferencia" });
    expect(fila("ajuste")).toMatchObject({ contabilizado: 15, subsistema: null, estado: "sin_subsistema", asientosDescuadrados: 1 });
    expect(r.valor.origenesSinSubsistema).toEqual(["ajuste", "cierre"]);
    expect(r.valor.diferenciaTotal).toBe(-5);
    expect(r.valor.cuadra).toBe(false);
    expect(r.valor.asientosDescuadrados.map((a) => a.asientoId)).toEqual(["A4"]);
    expect(Array.isArray(r.corte) && r.corte.length).toBe(4);
  });

  it("no compara como simultaneos subsistemas con otro corte", () => {
    expect(() =>
      conciliacionContable({
        corte: CORTE_CONT,
        asientos: ASIENTOS,
        subsistemas: [{ origen: "pago", fuente: "tesoreria", total: 50, corte: corte("tesoreria", "2026-08-30") }],
      }),
    ).toThrow(CortesDistintosError);
  });
});

describe("cuadre_fin_cont_pres", () => {
  const filas: FilaCuadre[] = [
    { concepto: "recaudacion", fuente: "tesoreria", valorFuente: 1000, valorConciliado: 950, valorContabilizado: 930, valorPresupuestario: 1000 },
    { concepto: "pagos", fuente: "tesoreria", valorFuente: 500, valorConciliado: 500, valorContabilizado: 500 },
    { concepto: "transferencias", fuente: "tesoreria", valorFuente: 200, valorConciliado: null },
  ];
  const justificaciones: JustificacionCuadre[] = [
    { id: "J1", concepto: "recaudacion", tramo: "fuente_conciliado", valor: 50, motivo: "Depositos en transito", documento: "EXT-08" },
    { id: "J2", concepto: "recaudacion", tramo: "contabilizado_presupuestario", valor: -50, motivo: "Transito no contabilizado" },
    { id: "J3", concepto: "otro", tramo: "fuente_conciliado", valor: 1, motivo: "Sin concepto" },
  ];

  it("separa diferencias justificadas de pendientes y no oculta datos faltantes", () => {
    const r = cuadreFinContPres({ corte: CORTE_CONT, cortesFuentes: [corte("tesoreria"), corte("presupuesto")], filas, justificaciones });
    const tramos = (c: string) => r.valor.matriz.find((f) => f.concepto === c)?.tramos.map((t) => [t.tramo, t.diferencia, t.pendiente, t.estado]);
    expect(tramos("recaudacion")).toEqual([
      ["fuente_conciliado", 50, 0, "justificada"],
      ["conciliado_contabilizado", 20, 20, "pendiente"],
      ["contabilizado_presupuestario", -70, -20, "pendiente"],
    ]);
    expect(tramos("pagos")).toEqual([
      ["fuente_conciliado", 0, 0, "cuadra"],
      ["conciliado_contabilizado", 0, 0, "cuadra"],
      ["contabilizado_presupuestario", null, null, "no_aplica"],
    ]);
    expect(r.valor.diferenciasJustificadas.map((d) => [d.concepto, d.tramo, d.justificado])).toEqual([
      ["recaudacion", "fuente_conciliado", 50],
      ["recaudacion", "contabilizado_presupuestario", -50],
    ]);
    expect(r.valor.pendientesPorResolver.map((p) => [p.concepto, p.tramo, p.pendiente, p.motivo])).toEqual([
      ["recaudacion", "conciliado_contabilizado", 20, "diferencia_sin_justificar"],
      ["recaudacion", "contabilizado_presupuestario", -20, "justificacion_parcial"],
      ["transferencias", "fuente_conciliado", null, "dato_faltante"],
      ["transferencias", "conciliado_contabilizado", null, "dato_faltante"],
      ["transferencias", "contabilizado_presupuestario", null, "dato_faltante"],
    ]);
    expect(r.valor.justificacionesNoAplicadas).toEqual(["J3"]);
    expect(r.valor.totales).toEqual({ diferenciasAbsolutas: 140, justificadoAbsoluto: 100, pendienteAbsoluto: 40 });
    expect(r.valor.cuadra).toBe(false);
  });

  it("cuadra cuando no hay diferencias ni faltantes, y marca justificaciones que exceden la diferencia", () => {
    const pagos = filas.filter((f) => f.concepto === "pagos");
    expect(cuadreFinContPres({ corte: CORTE_CONT, filas: pagos }).valor.cuadra).toBe(true);

    const r = cuadreFinContPres({
      corte: CORTE_CONT,
      filas: filas.filter((f) => f.concepto === "recaudacion"),
      justificaciones: [{ id: "JX", concepto: "recaudacion", tramo: "fuente_conciliado", valor: 80, motivo: "Exceso" }],
    });
    expect(r.valor.pendientesPorResolver[0]).toMatchObject({ tramo: "fuente_conciliado", pendiente: -30, motivo: "justificacion_excede_diferencia" });
  });

  it("exige cortes simultaneos y conceptos unicos", () => {
    expect(() => cuadreFinContPres({ corte: CORTE_CONT, cortesFuentes: [corte("tesoreria", "2026-08-31", "18:00")], filas })).toThrow(
      CortesDistintosError,
    );
    expect(() => cuadreFinContPres({ corte: CORTE_CONT, filas: [...filas, filas[0] as FilaCuadre] })).toThrow(FinanzasError);
  });
});
