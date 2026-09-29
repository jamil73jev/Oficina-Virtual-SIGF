import { describe, expect, it } from "vitest";
import {
  arqueoCaja,
  generarDatosPagos,
  HERRAMIENTAS_PAGOS,
  NOMBRES_HERRAMIENTAS_PAGOS,
  productividadCajas,
  programarPagos,
  resumenOrdenesPago,
  validarOrdenPago,
  type Beneficiario,
  type OrdenPago,
  type Turno,
} from "@/modules/finanzas-pagos";

const corte = { fechaCorte: new Date("2026-08-31"), horaExtraccion: "23:59", periodo: "2026-08", fuente: "prueba" };
const beneficiarios: Beneficiario[] = [
  { id: "B1", identificacion: "1", nombre: "Uno", cuentaBancaria: "CTA1" },
  { id: "B2", identificacion: "2", nombre: "Dos", cuentaBancaria: null },
];
const orden = ({ id, ...parche }: Partial<OrdenPago> & Pick<OrdenPago, "id">): OrdenPago => ({
  id,
  beneficiarioId: "B1",
  concepto: "Servicio",
  valor: 10,
  partidaId: "P1",
  estado: "solicitada",
  fechaSolicitud: new Date("2026-08-01"),
  ...parche,
});

describe("pagaduria", () => {
  it("detecta duplicados, cuenta ausente y falta de disponibilidad con motivos", () => {
    const resultado = validarOrdenPago({
      corte,
      beneficiarios,
      disponibilidades: { P1: 100 },
      ordenes: [
        orden({ id: "O1" }),
        orden({ id: "O2" }),
        orden({ id: "O3", beneficiarioId: "B2", concepto: "Otro" }),
        orden({ id: "O4", partidaId: "P2", concepto: "Sin fondos" }),
      ],
    });
    expect(resultado.valor.resultados.find((r) => r.ordenId === "O1")?.motivos).toContain("orden_duplicada");
    expect(resultado.valor.resultados.find((r) => r.ordenId === "O2")?.motivos).toContain("orden_duplicada");
    expect(resultado.valor.resultados.find((r) => r.ordenId === "O3")?.motivos).toContain("beneficiario_sin_cuenta");
    expect(resultado.valor.resultados.find((r) => r.ordenId === "O4")?.motivos).toContain("sin_disponibilidad");
    expect(resultado.valor.totalOrdenes).toBe(4);
  });

  it("propone en orden de solicitud sin superar el tope y no cambia estados", () => {
    const ordenes = [
      orden({ id: "O2", estado: "validada", valor: 60, fechaSolicitud: new Date("2026-08-02") }),
      orden({ id: "O1", estado: "validada", valor: 50, fechaSolicitud: new Date("2026-08-01") }),
      orden({ id: "O3", estado: "solicitada", valor: 1, fechaSolicitud: new Date("2026-07-01") }),
    ];
    const resultado = programarPagos({ corte, ordenes, topeLiquidez: 100 });
    expect(resultado.valor.pagadas.map((p) => p.ordenId)).toEqual(["O1"]);
    expect(resultado.valor.diferidas).toEqual(expect.arrayContaining([
      expect.objectContaining({ ordenId: "O2", motivo: "liquidez_insuficiente" }),
      expect.objectContaining({ ordenId: "O3", motivo: "estado_no_validado" }),
    ]));
    expect(resultado.valor.totalPropuesto).toBe(50);
    expect(ordenes.map((o) => o.estado)).toEqual(["validada", "validada", "solicitada"]);
  });

  it("resume todas las ordenes por estado y valor", () => {
    const resultado = resumenOrdenesPago({
      corte,
      ordenes: [orden({ id: "O1", valor: 10 }), orden({ id: "O2", valor: 20, estado: "pagada" })],
    });
    expect(resultado.valor.total).toEqual({ cantidad: 2, valor: 30 });
    expect(resultado.valor.porEstado.solicitada).toEqual({ cantidad: 1, valor: 10 });
    expect(resultado.valor.porEstado.pagada).toEqual({ cantidad: 1, valor: 20 });
  });
});

describe("caja general", () => {
  const turno = ({ id, ...parche }: Partial<Turno> & Pick<Turno, "id">): Turno => ({
    id,
    cajaId: "C1",
    cajeroId: "CJ1",
    apertura: new Date("2026-08-31T08:00:00Z"),
    cierre: new Date("2026-08-31T16:00:00Z"),
    fondoInicial: 100,
    recaudadoSistema: 1000,
    contadoFisico: 1100,
    ...parche,
  });

  it("reporta sobrante, faltante y turno sin cierre sin omitirlo", () => {
    const resultado = arqueoCaja({
      corte,
      novedades: [],
      turnos: [
        turno({ id: "T1", contadoFisico: 1105 }),
        turno({ id: "T2", contadoFisico: 1093 }),
        turno({ id: "T3", cierre: undefined, contadoFisico: undefined }),
      ],
    });
    expect(resultado.valor).toMatchObject({ totalTurnos: 3, cerrados: 2, sobrante: 5, faltante: 7, cuadre: false });
    expect(resultado.valor.sinCierre).toEqual(["T3"]);
  });

  it("agrupa productividad por caja, cajero, sede y franja", () => {
    const resultado = productividadCajas({
      corte,
      cajas: [{ id: "C1", sede: "Centro", nombre: "Uno" }, { id: "C2", sede: "Norte", nombre: "Dos" }],
      turnos: [turno({ id: "T1" }), turno({ id: "T2", cajaId: "C1", recaudadoSistema: 500 }), turno({ id: "T3", cajaId: "C2", cajeroId: "CJ2", recaudadoSistema: 50, apertura: new Date("2026-08-31T19:00:00Z") })],
    });
    expect(resultado.valor.totalOperaciones).toBe(3);
    expect(resultado.valor.valorTotal).toBe(1550);
    expect(resultado.valor.porCaja.find((f) => f.clave === "C1")).toEqual({ clave: "C1", operaciones: 2, valor: 1500 });
    expect(resultado.valor.porFranja.find((f) => f.clave === "noche")?.valor).toBe(50);
  });
});

describe("generador de pagos", () => {
  it("es determinista por semilla e incluye todos los casos borde", () => {
    const a = generarDatosPagos("misma");
    const b = generarDatosPagos("misma");
    expect(a).toEqual(b);
    expect(a.ordenes.some((o) => !o.partidaId)).toBe(true);
    expect(a.ordenes.some((o) => o.partidaId && a.disponibilidades[o.partidaId] === undefined)).toBe(true);
    expect(a.beneficiarios.some((x) => !x.cuentaBancaria)).toBe(true);
    expect(a.turnos.some((t) => !t.cierre)).toBe(true);
    const arqueo = arqueoCaja({ corte: a.corte, turnos: a.turnos, novedades: a.novedades });
    expect(arqueo.valor.sobrante).toBeGreaterThan(0);
    expect(arqueo.valor.faltante).toBeGreaterThan(0);
  });
});

describe("registro de herramientas de pagos", () => {
  it("exporta exactamente los nombres de las herramientas registradas", () => {
    expect(NOMBRES_HERRAMIENTAS_PAGOS).toEqual(Object.keys(HERRAMIENTAS_PAGOS));
  });
});
