import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  antiguedadCartera,
  calidadDatos,
  cedulaValida,
  compararCortes,
  conciliarBanco,
  contarUnicos,
  CortesDistintosError,
  digitoVerificadorCedula,
  ejecutarHerramientaFinanzas,
  FinanzasError,
  HERRAMIENTAS_FINANZAS,
  recaudacionNeta,
  rucValido,
  saldoCarteraPorTitulo,
  segmentarPareto,
  separarIngresosPorOrigen,
  SIN_PARROQUIA,
  tramoDeDias,
  type Contribuyente,
  type Corte,
  type Deposito,
  type Juicio,
  type Pago,
  type Reverso,
  type Rubro,
  type Titulo,
} from "@/modules/finanzas";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const MS_DIA = 86_400_000;

const CORTE: Corte = { fechaCorte: d("2026-08-31"), horaExtraccion: "23:59", periodo: "2026-08", fuente: "tesoreria" };

const pago = (id: string, tituloId: string, valorBruto: number, fecha = "2026-08-10", extra: Partial<Pago> = {}): Pago => ({
  id,
  tituloId,
  canal: "banco",
  fechaPago: d(fecha),
  valorBruto,
  bancoId: "BCO-01",
  ...extra,
});

const reverso = (id: string, pagoId: string, valor: number, extemporaneo: boolean, fecha = "2026-08-20"): Reverso => ({
  id,
  pagoId,
  valor,
  fecha: d(fecha),
  extemporaneo,
});

const titulo = (id: string, valorEmitido: number, extra: Partial<Titulo> = {}): Titulo => ({
  id,
  contribuyenteId: "C1",
  rubroId: "RB01",
  valorEmitido,
  fechaEmision: d("2026-01-01"),
  fechaVencimiento: d("2026-01-31"),
  estado: "emitido",
  ...extra,
});

function expectMetadatos(r: { fuente: string; formula: string; filtros: string[]; corte: unknown }) {
  expect(r.fuente.length).toBeGreaterThan(0);
  expect(r.formula.length).toBeGreaterThan(0);
  expect(r.filtros.length).toBeGreaterThan(0);
  expect(r.corte).toBeDefined();
}

describe("recaudacionNeta", () => {
  it("resta el reverso normal y muestra el extemporaneo aparte sin restarlo otra vez", () => {
    const r = recaudacionNeta({
      corte: CORTE,
      pagos: [pago("P1", "T1", 100), pago("P2", "T2", 50), pago("P3", "T3", 999, "2026-09-05")],
      reversos: [reverso("R1", "P1", 20, false), reverso("R2", "P2", 30, true), reverso("R3", "P3", 999, false)],
    });
    expect(r.valor).toMatchObject({
      bruto: 150,
      reversosNormales: 20,
      reversosExtemporaneos: 30,
      neto: 130,
      cantidadPagos: 2,
      cantidadReversosNormales: 1,
      cantidadReversosExtemporaneos: 1,
      reversosSinPago: { cantidad: 1, valor: 999 },
    });
    expect(r.fuente).toBe("tesoreria");
    expect(r.corte).toBe(CORTE);
    expectMetadatos(r);
  });

  it("suma en centavos sin error de coma flotante y respeta el rango", () => {
    const pagos = [pago("P1", "T1", 0.1, "2026-08-01"), pago("P2", "T1", 0.2, "2026-08-02"), pago("P3", "T1", 5, "2026-07-01")];
    const r = recaudacionNeta({ corte: CORTE, pagos, desde: d("2026-08-01"), hasta: d("2026-08-31") });
    expect(r.valor.bruto).toBe(0.3);
    expect(r.valor.neto).toBe(0.3);
    expect(r.filtros.some((f) => f.includes("2026-08-01"))).toBe(true);
  });
});

describe("separarIngresosPorOrigen", () => {
  it("separa propios y terceros y cuadra con la recaudacion neta", () => {
    const rubros: Rubro[] = [
      { id: "RB01", nombre: "Predial", tipo: "tributario", origen: "propio" },
      { id: "RB06", nombre: "Tasa tercero", tipo: "tributario", origen: "tercero" },
    ];
    const titulos = [titulo("T1", 500), titulo("T2", 500, { rubroId: "RB06" })];
    const pagos = [pago("P1", "T1", 100), pago("P2", "T2", 40), pago("P3", "T-X", 10)];
    const reversos = [reverso("R1", "P1", 25, false), reverso("R2", "P2", 40, true)];
    const entrada = { corte: CORTE, pagos, reversos, titulos, rubros };
    const r = separarIngresosPorOrigen(entrada);
    expect(r.valor.propios).toBe(75);
    expect(r.valor.terceros).toBe(40);
    expect(r.valor.sinClasificar).toBe(10);
    expect(r.valor.total).toBe(recaudacionNeta(entrada).valor.neto);
    expect(r.valor.cuadra).toBe(true);
    expectMetadatos(r);
  });
});

describe("saldoCarteraPorTitulo", () => {
  const juicios: Juicio[] = [1, 2, 3].map((n) => ({
    id: `J${n}`,
    codigo: `JC-${n}`,
    tituloId: "T1",
    juzgado: "Juzgado 01",
    estado: "en_tramite",
    fecha: d("2026-03-01"),
  }));

  it("un titulo con 3 juicios no triplica el saldo, aunque venga repetido por el cruce", () => {
    const t1 = titulo("T1", 1000, { estado: "en_coactiva" });
    const r = saldoCarteraPorTitulo({
      corte: CORTE,
      titulos: [t1, { ...t1 }, { ...t1 }, titulo("T2", 300)],
      pagos: [pago("P1", "T1", 200)],
      juicios,
    });
    const fila = r.valor.titulos.find((t) => t.tituloId === "T1");
    expect(fila?.saldo).toBe(800);
    expect(fila?.juicios).toEqual(["JC-1", "JC-2", "JC-3"]);
    expect(r.valor.totalSaldo).toBe(1100);
    expect(r.valor.cantidadTitulos).toBe(2);
    expect(r.valor.titulosConVariosJuicios).toBe(1);
    expect(r.valor.filasRepetidasDescartadas).toBe(2);
    expectMetadatos(r);
  });

  it("excluye bajas, repone reversos y separa saldo a favor", () => {
    const r = saldoCarteraPorTitulo({
      corte: CORTE,
      titulos: [titulo("T1", 100), titulo("T2", 100, { estado: "baja" }), titulo("T3", 50)],
      pagos: [pago("P1", "T1", 100), pago("P3", "T3", 60)],
      reversos: [reverso("R1", "P1", 100, true)],
    });
    expect(r.valor.titulos.map((t) => t.tituloId)).toEqual(["T1", "T3"]);
    expect(r.valor.totalSaldo).toBe(100);
    expect(r.valor.totalSaldoAFavor).toBe(10);
  });

  it("lanza error tipado si un mismo id trae valores distintos", () => {
    expect(() => saldoCarteraPorTitulo({ corte: CORTE, titulos: [titulo("T1", 100), titulo("T1", 200)] })).toThrow(
      FinanzasError,
    );
  });
});

describe("antiguedadCartera", () => {
  it("asigna los limites de cada tramo de forma inclusiva", () => {
    expect([0, 30, 31, 90, 91, 180, 181, 360, 361, -1].map(tramoDeDias)).toEqual([
      "0-30",
      "0-30",
      "31-90",
      "31-90",
      "91-180",
      "91-180",
      "181-360",
      "181-360",
      "mas_de_360",
      null,
    ]);
    const vencidoHace = (dias: number, i: number) =>
      titulo(`T${i}`, 100, { fechaVencimiento: new Date(CORTE.fechaCorte.getTime() - dias * MS_DIA) });
    const titulos = [0, 30, 31, 90, 91, 180, 181, 360, 361, -1].map(vencidoHace);
    const r = antiguedadCartera({ corte: CORTE, titulos });
    expect(r.valor.tramos.map((t) => [t.tramo, t.titulos, t.saldo])).toEqual([
      ["0-30", 2, 200],
      ["31-90", 2, 200],
      ["91-180", 2, 200],
      ["181-360", 2, 200],
      ["mas_de_360", 1, 100],
    ]);
    expect(r.valor.porVencer).toEqual({ titulos: 1, saldo: 100 });
    expect(r.valor.totalSaldo).toBe(1000);
    expect(r.valor.tramos.map((t) => t.porcentaje)).toEqual([20, 20, 20, 20, 10]);
    expect(r.valor.cuadra).toBe(true);
    expectMetadatos(r);
  });

  it("no cuenta titulos sin saldo", () => {
    const r = antiguedadCartera({ corte: CORTE, titulos: [titulo("T1", 100)], pagos: [pago("P1", "T1", 100)] });
    expect(r.valor.totalSaldo).toBe(0);
    expect(r.valor.tramos.every((t) => t.titulos === 0)).toBe(true);
  });
});

describe("segmentarPareto", () => {
  it("agrega por clave y segmenta A/B/C por proporcion acumulada", () => {
    const r = segmentarPareto({
      corte: CORTE,
      partidas: [
        { clave: "A", valor: 25 },
        { clave: "A", valor: 25 },
        { clave: "B", valor: 30 },
        { clave: "C", valor: 10 },
        { clave: "D", valor: 5 },
        { clave: "E", valor: 5 },
        { clave: "Z", valor: 0 },
      ],
    });
    expect(r.valor.detalle.map((x) => `${x.clave}${x.segmento}`)).toEqual(["AA", "BA", "CB", "DB", "EC"]);
    expect(r.valor.segmentos.map((s) => s.valor)).toEqual([80, 15, 5]);
    expect(r.valor.total).toBe(100);
    expect(r.valor.detalle.map((x) => x.porcentajeAcumulado)).toEqual([50, 80, 90, 95, 100]);
    expect(r.valor.concentracionTop20).toBe(0.5);
    expect(r.valor.sinValor).toEqual(["Z"]);
    expectMetadatos(r);
  });

  it("rechaza umbrales incoherentes", () => {
    expect(() => segmentarPareto({ corte: CORTE, partidas: [], umbrales: [0.9, 0.5] })).toThrow(FinanzasError);
  });
});

describe("conciliarBanco", () => {
  it("devuelve conciliado, pendiente, diferencias y depositos sin transaccion", () => {
    const transacciones = [
      pago("P1", "T1", 100),
      pago("P2", "T2", 50),
      pago("P3", "T3", 70),
      pago("P4", "T4", 40, "2026-08-15", { bancoId: "BCO-02" }),
    ];
    const depositos: Deposito[] = [
      { id: "D1", bancoId: "BCO-01", fecha: d("2026-08-11"), valor: 100, referencia: "P1" },
      { id: "D3", bancoId: "BCO-01", fecha: d("2026-08-11"), valor: 69.5, referencia: "P3" },
      { id: "D4", bancoId: "BCO-02", fecha: d("2026-08-15"), valor: 40, referencia: null },
      { id: "D5", bancoId: "BCO-01", fecha: d("2026-08-12"), valor: 12, referencia: "P-NO-EXISTE" },
    ];
    const r = conciliarBanco({ corte: CORTE, transacciones, depositos });
    expect(r.valor.conciliado.cantidad).toBe(2);
    expect(r.valor.conciliado.valor).toBe(140);
    expect(r.valor.conciliado.pares.map((p) => [p.pagoId, p.criterio])).toEqual([
      ["P1", "referencia"],
      ["P4", "banco_fecha_valor"],
    ]);
    expect(r.valor.pendiente).toEqual({ cantidad: 1, valor: 50, pagoIds: ["P2"] });
    expect(r.valor.diferencias.detalle).toEqual([
      { pagoId: "P3", depositoIds: ["D3"], valorTransaccion: 70, valorDeposito: 69.5, diferencia: -0.5 },
    ]);
    expect(r.valor.depositosSinTransaccion.depositoIds).toEqual(["D5"]);
    expect(r.valor.totalTransacciones).toBe(260);
    expect(r.valor.cuadra).toBe(true);
    expectMetadatos(r);
  });
});

describe("identificaciones", () => {
  it("valida cedula y RUC con digito verificador", () => {
    const base = "091234567";
    const cedula = base + digitoVerificadorCedula(base);
    expect(cedulaValida(cedula)).toBe(true);
    expect(cedulaValida(base + ((digitoVerificadorCedula(base) + 1) % 10))).toBe(false);
    expect(rucValido(cedula + "001")).toBe(true);
    expect(rucValido("1790000001001")).toBe(true);
    expect(rucValido("1760000070001")).toBe(true);
    expect(rucValido("1790000002001")).toBe(false);
  });
});

describe("calidadDatos", () => {
  const base = "091234567";
  const valida = base + digitoVerificadorCedula(base);
  const contribuyente = (id: string, extra: Partial<Contribuyente> = {}): Contribuyente => ({
    id,
    tipoIdentificacion: "cedula",
    identificacion: valida,
    nombre: `Contribuyente de prueba ${id}`,
    parroquia: "Parroquia 01",
    sector: "Sector 01",
    latitud: -2.19,
    longitud: -79.9,
    ...extra,
  });

  it("reporta observaciones sin excluir a nadie del total general", () => {
    const contribuyentes = [
      contribuyente("C1"),
      contribuyente("C2", { identificacion: `${valida.slice(0, 5)} ${valida.slice(5)}` }), // duplicada con espacio
      contribuyente("C3", { identificacion: "0912345", parroquia: null }),
      contribuyente("C4", { identificacion: "0102030405", sector: "  ", latitud: null }),
      contribuyente("C5", { tipoIdentificacion: "otro", identificacion: "PX123", latitud: 0, longitud: 0 }),
    ];
    const r = calidadDatos({ corte: { ...CORTE, fuente: "rentas" }, contribuyentes });
    const v = r.valor;
    expect(v.totalGeneral).toBe(5);
    expect(v.identificaciones.validas.contribuyenteIds).toEqual(["C1", "C2"]);
    expect(v.identificaciones.invalidas.contribuyenteIds).toEqual(["C3", "C4"]);
    expect(v.identificaciones.noVerificables.contribuyenteIds).toEqual(["C5"]);
    expect(v.identificaciones.duplicadas.detalle).toEqual([{ identificacion: valida, contribuyenteIds: ["C1", "C2"] }]);
    expect(v.sinParroquia.contribuyenteIds).toEqual(["C3"]);
    expect(v.sinSector.contribuyenteIds).toEqual(["C4"]);
    expect(v.sinUbicacionSuficiente.contribuyenteIds).toEqual(["C4", "C5"]);
    expect(v.porParroquia).toContainEqual({ parroquia: SIN_PARROQUIA, contribuyentes: 1 });
    expect(v.porParroquia.reduce((acc, p) => acc + p.contribuyentes, 0)).toBe(5);
    expect(v.cuadra).toBe(true);
    expectMetadatos(r);
  });
});

describe("contarUnicos", () => {
  it("usa la union para grupos solapados y no suma conteos", () => {
    const r = contarUnicos({
      corte: CORTE,
      grupos: [
        { nombre: "coactiva", ids: ["1", "2", "3"] },
        { nombre: "cobranza", ids: ["3", "4"] },
        { nombre: "convenio", ids: ["4", "5", "1", "1"] },
      ],
    });
    expect(r.valor.porGrupo.map((g) => g.unicos)).toEqual([3, 2, 3]);
    expect(r.valor.sumaDeGrupos).toBe(8);
    expect(r.valor.unicosTotales).toBe(5);
    expect(r.valor.solapamiento).toBe(3);
    expect(r.valor.idsEnVariosGrupos).toBe(3);
    expectMetadatos(r);
  });
});

describe("compararCortes", () => {
  const rentas: Corte = { ...CORTE, fuente: "rentas" };
  const coactiva: Corte = { ...CORTE, fechaCorte: d("2026-08-28"), fuente: "coactiva" };

  it("lanza un error tipado si se comparan como simultaneas fuentes con cortes distintos", () => {
    const entrada = { mediciones: [{ corte: rentas, valor: 10 }, { corte: coactiva, valor: 12 }] };
    expect(() => compararCortes(entrada)).toThrow(CortesDistintosError);
    try {
      compararCortes(entrada);
    } catch (e) {
      expect(e).toBeInstanceOf(FinanzasError);
      expect((e as CortesDistintosError).codigo).toBe("cortes_distintos");
      expect((e as CortesDistintosError).diferencias.map((x) => x.campo)).toEqual(["fechaCorte"]);
    }
  });

  it("detecta hora de extraccion distinta salvo tolerancia", () => {
    const banco: Corte = { ...CORTE, horaExtraccion: "23:30", fuente: "banco" };
    const mediciones = [{ corte: rentas }, { corte: banco }];
    expect(() => compararCortes({ mediciones })).toThrow(CortesDistintosError);
    expect(compararCortes({ mediciones, toleranciaMinutos: 30 }).valor.modo).toBe("simultaneo");
  });

  it("compara cortes iguales y ordena cortes distintos en modo evolutivo", () => {
    const tesoreria: Corte = { ...CORTE, fuente: "tesoreria" };
    const simultaneo = compararCortes({ mediciones: [{ corte: rentas, valor: 10 }, { corte: tesoreria, valor: 12.5 }] });
    expect(simultaneo.valor.diferenciaMaxima).toBe(2.5);
    expect(simultaneo.fuente).toBe("rentas + tesoreria");
    expectMetadatos(simultaneo);

    const evolutivo = compararCortes({
      modo: "evolutivo",
      mediciones: [{ corte: rentas, valor: 10 }, { corte: coactiva, valor: 12 }],
    });
    expect(evolutivo.valor.filas.map((f) => [f.fuente, f.diasDesdeAnterior, f.variacion])).toEqual([
      ["coactiva", null, null],
      ["rentas", 3, -2],
    ]);
  });
});

describe("HERRAMIENTAS_FINANZAS", () => {
  it("expone exactamente las herramientas acordadas con funcion y esquema Zod", () => {
    expect(Object.keys(HERRAMIENTAS_FINANZAS).sort()).toEqual(
      [
        "recaudacion_neta",
        "saldo_cartera_por_titulo",
        "antiguedad_cartera",
        "segmentar_pareto",
        "conciliar_banco",
        "calidad_datos",
        "cruzar_identificaciones",
        "comparar_cortes",
        "contar_unicos",
      ].sort(),
    );
    for (const h of Object.values(HERRAMIENTAS_FINANZAS)) {
      expect(typeof h.funcion).toBe("function");
      expect(typeof h.esquemaEntrada.parse).toBe("function");
    }
  });

  it("valida entrada JSON cruda y ejecuta la calculadora", () => {
    const corte = { fechaCorte: "2026-08-31", horaExtraccion: "23:59", periodo: "2026-08", fuente: "tesoreria" };
    const r = ejecutarHerramientaFinanzas("recaudacion_neta", {
      corte,
      pagos: [{ id: "P1", tituloId: "T1", canal: "caja", fechaPago: "2026-08-02", valorBruto: 10 }],
      reversos: [{ id: "R1", pagoId: "P1", valor: 4, fecha: "2026-08-03", extemporaneo: false }],
    });
    expect((r.valor as { neto: number }).neto).toBe(6);
    expect(() => ejecutarHerramientaFinanzas("contar_unicos", { corte, grupos: "x" })).toThrow(ZodError);
  });
});
