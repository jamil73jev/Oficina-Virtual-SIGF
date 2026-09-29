import { describe, expect, it } from "vitest";
import type { Corte, Juicio, Pago, Reverso, Rubro, Titulo } from "@/modules/finanzas";
import {
  efectoResoluciones,
  emisionPorRubro,
  estadoVigenteAlCorte,
  recuperacionCoactiva,
  resumenCoactiva,
  type HistorialTitulo,
  type MovimientoJuicio,
  type Resolucion,
} from "@/modules/finanzas-rentas";

const corte: Corte = { fechaCorte: new Date("2026-08-31"), horaExtraccion: "23:59", periodo: "2026-08", fuente: "rentas" };
const d = (s: string) => new Date(s);

const rubros: Rubro[] = [
  { id: "RB01", nombre: "Predial", tipo: "tributario", origen: "propio" },
  { id: "RB04", nombre: "Tasa administrativa", tipo: "no_tributario", origen: "propio" },
];
const titulo = (id: string, rubroId: string, valorEmitido: number, emision: string, estado: Titulo["estado"] = "emitido"): Titulo => ({
  id,
  contribuyenteId: "C1",
  rubroId,
  valorEmitido,
  fechaEmision: d(emision),
  fechaVencimiento: d(emision),
  estado,
});
const T1 = titulo("T1", "RB01", 1000, "2026-01-10", "pagado");
const T2 = titulo("T2", "RB04", 500, "2026-01-20");
const T3 = titulo("T3", "RB01", 300, "2026-02-05", "en_coactiva");
const T4 = titulo("T4", "RB01", 999, "2026-09-15");

const hist = (
  id: string,
  tituloId: string,
  fecha: string,
  ant: HistorialTitulo["estadoAnterior"],
  nuevo: HistorialTitulo["estadoNuevo"],
): HistorialTitulo => ({ id, tituloId, fecha: d(fecha), estadoAnterior: ant, estadoNuevo: nuevo, motivo: "prueba" });

describe("emision_por_rubro", () => {
  it("agrupa por periodo, rubro y tipo sin duplicar el valor de un titulo", () => {
    const r = emisionPorRubro({ corte, titulos: [T1, T2, T3, T4, T1], rubros });
    expect(r.valor.totalTitulos).toBe(3);
    expect(r.valor.totalValorEmitido).toBe(1800);
    expect(r.valor.filasRepetidasDescartadas).toBe(1);
    expect(r.valor.titulosPosterioresAlCorte).toBe(1);
    expect(r.valor.totalPorTipo).toEqual([
      { tipo: "no_tributario", titulos: 1, valorEmitido: 500 },
      { tipo: "tributario", titulos: 2, valorEmitido: 1300 },
    ]);
    expect(r.valor.totalPorPeriodo.map((p) => [p.periodo, p.valorEmitido])).toEqual([
      ["2026-01", 1500],
      ["2026-02", 300],
    ]);
    expect(r.valor.filas).toHaveLength(3);
    expect(r.fuente).toBe("rentas");
    expect(r.formula).toContain("titulo.id");
  });

  it("respeta el rango, agrupa por anio y reporta rubros desconocidos", () => {
    const huerfano = titulo("T9", "RB99", 10, "2026-02-01");
    const r = emisionPorRubro({ corte, titulos: [T1, T2, T3, huerfano], rubros, desde: d("2026-02-01"), periodicidad: "anio" });
    expect(r.valor.titulosFueraDeRango).toBe(2);
    expect(r.valor.filas.map((f) => [f.periodo, f.rubroId, f.tipo])).toEqual([
      ["2026", "RB01", "tributario"],
      ["2026", "RB99", "sin_clasificar"],
    ]);
    expect(r.valor.titulosSinRubro).toEqual(["T9"]);
    expect(r.filtros.join(" ")).toContain("fecha >= 2026-02-01");
  });

  it("rechaza un rango invertido", () => {
    expect(() => emisionPorRubro({ corte, titulos: [T1], rubros, desde: d("2026-05-01"), hasta: d("2026-04-01") })).toThrow(
      /entrada_invalida/,
    );
  });
});

describe("estado_vigente_al_corte", () => {
  const historial = [
    hist("H1", "T1", "2026-01-10", null, "emitido"),
    hist("H2", "T1", "2026-04-15", "emitido", "en_cobranza"),
    hist("H3", "T1", "2026-09-05", "en_cobranza", "pagado"),
    hist("H4", "T3", "2026-02-05", null, "emitido"),
    hist("H5", "T3", "2026-06-01", "emitido", "en_coactiva"),
  ];

  it("reconstruye desde el historial, distinto del estado actual", () => {
    const r = estadoVigenteAlCorte({ corte, titulos: [T1, T3], historial });
    const t1 = r.valor.titulos.find((x) => x.tituloId === "T1");
    expect(T1.estado).toBe("pagado");
    expect(t1?.estadoAlCorte).toBe("en_cobranza");
    expect(t1?.cambioDesdeElCorte).toBe(true);
    expect(t1?.transicionesPosteriores).toBe(1);
    expect(r.valor.cambiaronDespuesDelCorte).toBe(1);
    expect(r.valor.conteoPorEstado).toEqual({ en_cobranza: 1, en_coactiva: 1 });
  });

  it("a una fecha pasada devuelve el estado de esa fecha", () => {
    const pasado: Corte = { ...corte, fechaCorte: d("2026-03-01") };
    const r = estadoVigenteAlCorte({ corte: pasado, titulos: [T1, T3], historial });
    expect(r.valor.titulos.map((x) => x.estadoAlCorte)).toEqual(["emitido", "emitido"]);
    const antesDeEmitir = estadoVigenteAlCorte({ corte: { ...corte, fechaCorte: d("2026-01-01") }, titulos: [T1], historial });
    expect(antesDeEmitir.valor.titulos[0]?.estadoAlCorte).toBeNull();
    expect(antesDeEmitir.valor.titulos[0]?.origen).toBe("no_emitido");
  });

  it("marca titulos sin historial y detecta saltos inconsistentes", () => {
    const r = estadoVigenteAlCorte({
      corte,
      titulos: [T2, T3],
      historial: [
        hist("H4", "T3", "2026-02-05", null, "emitido"),
        hist("H5", "T3", "2026-06-01", "en_cobranza", "en_coactiva"),
        hist("HX", "TX", "2026-01-01", null, "emitido"),
      ],
    });
    expect(r.valor.sinHistorial).toBe(1);
    expect(r.valor.historialSinTitulo).toBe(1);
    expect(r.valor.titulos.find((x) => x.tituloId === "T2")?.origen).toBe("sin_historial");
    expect(r.valor.titulos.find((x) => x.tituloId === "T3")?.inconsistencias[0]).toContain("H5");
  });
});

describe("efecto_resoluciones", () => {
  const res = (
    id: string,
    tituloId: string,
    tipo: Resolucion["tipo"],
    valorEfecto: number,
    fecha: string,
    estado: Resolucion["estado"] = "vigente",
  ): Resolucion => ({ id, tituloId, tipo, valorEfecto, fecha: d(fecha), estado });
  const pago: Pago = { id: "P1", tituloId: "T1", canal: "caja", fechaPago: d("2026-02-01"), valorBruto: 200, cajaId: "C", bancoId: null };
  const resoluciones = [
    res("R1", "T1", "rebaja", 100, "2026-03-01"),
    res("R2", "T1", "rebaja", 50, "2026-04-01"),
    res("R3", "T1", "exoneracion", 400, "2026-09-10"),
    res("R4", "T1", "anulacion", 900, "2026-05-01", "revocada"),
    res("R5", "T1", "otro", 300, "2026-05-01"),
    res("R6", "T2", "anulacion", 500, "2026-03-01"),
    res("R7", "T3", "rebaja", 200, "2026-03-01"),
    res("R8", "T3", "prescripcion", 200, "2026-03-02"),
    res("R9", "TX", "rebaja", 1, "2026-03-01"),
  ];
  const r = efectoResoluciones({
    corte,
    titulos: [T1, T2, T3],
    resoluciones: [...resoluciones, resoluciones[0] as Resolucion],
    pagos: [pago],
  });
  const fila = (id: string) => r.valor.titulos.find((t) => t.tituloId === id);

  it("varias resoluciones cambian el saldo e ignoran las posteriores, revocadas y de tipo otro", () => {
    expect(fila("T1")).toMatchObject({
      valorEmitido: 1000,
      pagadoNeto: 200,
      saldoAntes: 800,
      efectoAplicado: 150,
      saldoDespues: 650,
      resolucionesAplicadas: ["R1", "R2", "R5"],
      resolucionesPosterioresAlCorte: ["R3"],
      resolucionesNoVigentes: ["R4"],
      estadoPropuesto: null,
    });
    expect(r.valor.resolucionesRepetidasDescartadas).toBe(1);
    expect(r.valor.resolucionesSinTitulo).toEqual(["R9"]);
  });

  it("propone baja cuando el efecto cubre todo y limita el efecto al valor emitido", () => {
    expect(fila("T2")).toMatchObject({ saldoDespues: 0, estadoPropuesto: "baja" });
    expect(fila("T3")).toMatchObject({ efectoAplicado: 300, efectoExcedente: 100, saldoDespues: 0, estadoPropuesto: "baja" });
    expect(r.valor.totalSaldoAntes).toBe(800 + 500 + 300);
    expect(r.valor.totalSaldoDespues).toBe(650);
  });

  it("el mismo calculo con un corte anterior no ve las resoluciones posteriores a ese corte", () => {
    const previo = efectoResoluciones({ corte: { ...corte, fechaCorte: d("2026-02-15") }, titulos: [T1], resoluciones, pagos: [pago] });
    expect(previo.valor.titulos[0]).toMatchObject({ efectoAplicado: 0, saldoDespues: 800, resolucionesAplicadas: [] });
  });

  it("con historial usa el estado reconstruido y no el actual", () => {
    const h = [hist("H1", "T1", "2026-01-10", null, "emitido"), hist("H2", "T1", "2026-08-15", "emitido", "pagado")];
    const conHist = efectoResoluciones({
      corte,
      titulos: [T1],
      resoluciones: [res("R", "T1", "anulacion", 800, "2026-03-01")],
      pagos: [pago],
      historial: h,
    });
    expect(conHist.valor.titulos[0]?.estadoAlCorte).toBe("pagado");
    expect(conHist.valor.titulos[0]?.estadoPropuesto).toBeNull();
  });

  it("los reversos reponen la deuda antes de aplicar resoluciones", () => {
    const reverso: Reverso = { id: "RV", pagoId: "P1", valor: 50, fecha: d("2026-03-01"), extemporaneo: true };
    const conRev = efectoResoluciones({
      corte,
      titulos: [T1],
      resoluciones: [res("R", "T1", "rebaja", 100, "2026-03-01")],
      pagos: [pago],
      reversos: [reverso],
    });
    expect(conRev.valor.titulos[0]).toMatchObject({ pagadoNeto: 150, saldoAntes: 850, saldoDespues: 750 });
  });
});

describe("resumen_coactiva", () => {
  const juicio = (id: string, tituloId: string, fecha: string): Juicio => ({
    id,
    codigo: `JC-${id}`,
    tituloId,
    juzgado: "Juzgado 1",
    estado: "en_tramite",
    fecha: d(fecha),
  });
  const juicios = [
    juicio("J1", "T3", "2026-03-01"),
    juicio("J3", "T3", "2026-07-01"),
    juicio("J2", "T3", "2026-05-01"),
    juicio("J4", "T1", "2026-04-01"),
    juicio("J5", "T3", "2026-10-01"),
    juicio("J6", "TX", "2026-04-01"),
  ];
  const mov = (id: string, juicioId: string, fecha: string, tipo: MovimientoJuicio["tipo"]): MovimientoJuicio => ({
    id,
    juicioId,
    fecha: d(fecha),
    tipo,
    observacion: "x",
  });
  const movimientos = [
    mov("M1", "J1", "2026-03-01", "auto"),
    mov("M2", "J2", "2026-05-02", "auto"),
    mov("M3", "J3", "2026-07-02", "citacion"),
    mov("M4", "J3", "2026-07-03", "embargo"),
    mov("M5", "J3", "2026-09-30", "archivo"),
    mov("M6", "JZ", "2026-05-01", "auto"),
  ];
  const r = resumenCoactiva({ corte, titulos: [T1, T3, T3], juicios, movimientos });
  const t3 = r.valor.titulos.find((t) => t.tituloId === "T3");

  it("un titulo con 3 juicios no triplica el valor y conserva todo el historial", () => {
    expect(t3?.valorEmitido).toBe(300);
    expect(t3?.cantidadJuicios).toBe(3);
    expect(t3?.historialJuicios.map((j) => j.juicioId)).toEqual(["J1", "J2", "J3"]);
    expect(t3?.historialJuicios.map((j) => j.movimientos.length)).toEqual([1, 1, 2]);
    expect(r.valor.totalValorTitulos).toBe(1300);
    expect(r.valor.cantidadTitulos).toBe(2);
    expect(r.valor.cantidadJuicios).toBe(4);
    expect(r.valor.titulosConVariosJuicios).toBe(1);
  });

  it("la vista analitica usa el ultimo juicio", () => {
    expect(t3?.ultimoJuicio.juicioId).toBe("J3");
    expect(t3?.ultimoJuicio.movimientos.map((m) => m.tipo)).toEqual(["citacion", "embargo"]);
  });

  it("ignora lo posterior al corte y reporta huerfanos", () => {
    expect(r.valor.juiciosPosterioresAlCorte).toBe(1);
    expect(r.valor.movimientosPosterioresAlCorte).toBe(1);
    expect(r.valor.juiciosSinTitulo).toEqual(["J6"]);
    expect(r.valor.movimientosSinJuicio).toBe(1);
    expect(r.filtros.join(" ")).toContain("juicio.id unico");
  });
});

describe("recuperacion_coactiva", () => {
  const pago = (id: string, fecha: string, valorBruto: number, tituloId = "T3"): Pago => ({
    id,
    tituloId,
    canal: "caja",
    fechaPago: d(fecha),
    valorBruto,
    cajaId: "C",
    bancoId: null,
  });
  const pagos = [pago("P1", "2026-03-01", 100), pago("P2", "2026-07-01", 50), pago("P3", "2026-09-05", 20), pago("P4", "2026-02-01", 500, "T2")];
  const reversos: Reverso[] = [{ id: "RV1", pagoId: "P2", valor: 10, fecha: d("2026-08-01"), extemporaneo: true }];
  const historial = [hist("H1", "T3", "2026-02-05", null, "emitido"), hist("H2", "T3", "2026-06-01", "emitido", "en_coactiva")];
  const juicios: Juicio[] = [{ id: "J1", codigo: "JC-1", tituloId: "T3", juzgado: "J", estado: "en_tramite", fecha: d("2026-06-01") }];

  it("calcula pagos posteriores al ingreso, saldo y porcentaje recuperado", () => {
    const r = recuperacionCoactiva({ corte, titulos: [T2, T3], pagos, reversos, historial, juicios });
    expect(r.valor.cantidadTitulos).toBe(1);
    expect(r.valor.titulos[0]).toMatchObject({
      tituloId: "T3",
      origenFechaIngreso: "historial",
      baseCoactiva: 200,
      recuperado: 40,
      pagosPosteriores: 1,
      saldoAlCorte: 160,
    });
    expect(r.valor.totalBaseCoactiva).toBe(200);
    expect(r.valor.totalRecuperado).toBe(40);
    expect(r.valor.porcentajeRecuperado).toBe(0.2);
    expect(r.formula).toContain("no se suman");
  });

  it("sin historial usa el primer juicio como ingreso y las resoluciones reducen la base", () => {
    const resoluciones: Resolucion[] = [
      { id: "R", tituloId: "T3", tipo: "rebaja", valorEfecto: 20, fecha: d("2026-06-15"), estado: "vigente" },
    ];
    const r = recuperacionCoactiva({ corte, titulos: [T3], pagos, reversos, juicios, resoluciones });
    expect(r.valor.titulos[0]).toMatchObject({ origenFechaIngreso: "primer_juicio", baseCoactiva: 180, recuperado: 40, saldoAlCorte: 140 });
    expect(r.valor.porcentajeRecuperado).toBe(0.2222);
  });

  it("no incluye titulos que no estaban en coactiva al corte y reporta los sin fecha de ingreso", () => {
    const pasado: Corte = { ...corte, fechaCorte: d("2026-05-01") };
    const r1 = recuperacionCoactiva({ corte: pasado, titulos: [T3], pagos, historial });
    expect(r1.valor.cantidadTitulos).toBe(0);
    expect(r1.valor.porcentajeRecuperado).toBe(0);
    const r2 = recuperacionCoactiva({ corte, titulos: [T3], pagos });
    expect(r2.valor.titulosSinFechaDeIngreso).toEqual(["T3"]);
  });
});
