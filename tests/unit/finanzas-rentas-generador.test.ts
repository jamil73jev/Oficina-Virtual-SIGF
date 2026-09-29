import { describe, expect, it } from "vitest";
import { corteDe, generarDatosSinteticos, saldoCarteraPorTitulo } from "@/modules/finanzas";
import {
  efectoResoluciones,
  ejecutarHerramientaRentas,
  emisionPorRubro,
  estadoVigenteAlCorte,
  generarDatosRentas,
  HERRAMIENTAS_RENTAS,
  NOMBRES_HERRAMIENTAS_RENTAS,
  recuperacionCoactiva,
  resumenCoactiva,
  Resolucion,
  HistorialTitulo,
  MovimientoJuicio,
} from "@/modules/finanzas-rentas";

const base = generarDatosSinteticos();
const rentas = generarDatosRentas(20260831, base);
const corteR = corteDe(base, "rentas");
const corteC = corteDe(base, "coactiva");
const dias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe("generarDatosRentas", () => {
  it("es determinista por semilla y cambia con otra semilla", () => {
    const a = JSON.stringify(generarDatosRentas(7));
    expect(a).toBe(JSON.stringify(generarDatosRentas(7)));
    expect(a).not.toBe(JSON.stringify(generarDatosRentas(8)));
    expect(JSON.stringify(generarDatosRentas())).toBe(JSON.stringify(generarDatosRentas(20260831, base)));
  });

  it("produce registros validos y coherentes con los titulos y juicios de finanzas", () => {
    const titulos = new Set(base.titulos.map((t) => t.id));
    const juicios = new Set(base.juicios.map((j) => j.id));
    for (const r of rentas.resoluciones) expect(Resolucion.safeParse(r).success && titulos.has(r.tituloId)).toBe(true);
    for (const h of rentas.historial) expect(HistorialTitulo.safeParse(h).success && titulos.has(h.tituloId)).toBe(true);
    for (const m of rentas.movimientos) expect(MovimientoJuicio.safeParse(m).success && juicios.has(m.juicioId)).toBe(true);
    for (const p of rentas.pagosCoactiva) expect(titulos.has(p.tituloId)).toBe(true);
    expect(new Set(rentas.resoluciones.map((r) => r.id)).size).toBe(rentas.resoluciones.length);
    expect(new Set(rentas.historial.map((r) => r.id)).size).toBe(rentas.historial.length);
    expect(new Set(rentas.movimientos.map((r) => r.id)).size).toBe(rentas.movimientos.length);
  });

  it("el historial termina en el estado actual de cada titulo, sin saltos", () => {
    const r = estadoVigenteAlCorte({ corte: corteR, titulos: base.titulos, historial: rentas.historial });
    expect(r.valor.sinHistorial).toBe(0);
    expect(r.valor.cambiaronDespuesDelCorte).toBe(0);
    expect(r.valor.titulos.flatMap((t) => t.inconsistencias)).toEqual([]);
    expect(r.valor.titulos.every((t) => t.estadoAlCorte === base.titulos.find((x) => x.id === t.tituloId)?.estado)).toBe(true);
  });

  it("incluye un titulo con transiciones de ida y vuelta y estados pasados distintos del actual", () => {
    const porTitulo = new Map<string, number>();
    for (const h of rentas.historial) porTitulo.set(h.tituloId, (porTitulo.get(h.tituloId) ?? 0) + 1);
    expect([...porTitulo.values()].some((n) => n >= 5)).toBe(true);

    const pasado = { ...corteR, fechaCorte: new Date("2025-06-30") };
    const r = estadoVigenteAlCorte({ corte: pasado, titulos: base.titulos, historial: rentas.historial });
    expect(r.valor.cambiaronDespuesDelCorte).toBeGreaterThan(0);
  });

  it("incluye resoluciones multiples, que cambian el saldo, posteriores al corte y no vigentes", () => {
    const r = efectoResoluciones({
      corte: corteR,
      titulos: base.titulos,
      resoluciones: rentas.resoluciones,
      pagos: base.pagos,
      reversos: base.reversos,
      historial: rentas.historial,
    });
    expect(r.valor.titulos.some((t) => t.resolucionesAplicadas.length >= 3)).toBe(true);
    expect(r.valor.titulos.some((t) => t.saldoDespues < t.saldoAntes)).toBe(true);
    expect(r.valor.titulos.some((t) => t.resolucionesPosterioresAlCorte.length > 0)).toBe(true);
    expect(r.valor.titulos.some((t) => t.resolucionesNoVigentes.length > 0)).toBe(true);
    expect(r.valor.resolucionesSinTitulo).toEqual([]);
    const posterior = r.valor.titulos.find((t) => t.resolucionesPosterioresAlCorte.length > 0);
    expect(posterior?.saldoDespues).toBe(posterior?.saldoAntes);
  });

  it("un titulo con 3 juicios tiene movimientos en cada uno y su valor se cuenta una vez", () => {
    const r = resumenCoactiva({ corte: corteC, titulos: base.titulos, juicios: base.juicios, movimientos: rentas.movimientos });
    const triple = r.valor.titulos.find((t) => t.cantidadJuicios === 3);
    expect(triple).toBeDefined();
    expect(triple?.historialJuicios.every((j) => j.movimientos.length >= 2)).toBe(true);
    const titulo = base.titulos.find((t) => t.id === triple?.tituloId);
    expect(triple?.valorEmitido).toBe(titulo?.valorEmitido);

    const unicos = new Map(base.titulos.map((t) => [t.id, t.valorEmitido]));
    const conJuicio = new Set(base.juicios.filter((j) => dias(j.fecha, corteC.fechaCorte) >= 0).map((j) => j.tituloId));
    const esperado = Math.round([...conJuicio].reduce((s, id) => s + Math.round((unicos.get(id) ?? 0) * 100), 0)) / 100;
    expect(r.valor.totalValorTitulos).toBe(esperado);
    expect(r.valor.cantidadTitulos).toBe(conJuicio.size);
    expect(r.valor.movimientosPosterioresAlCorte).toBeGreaterThan(0);
    // Coherente con la vista de cartera de finanzas.
    const cartera = saldoCarteraPorTitulo({ corte: corteC, titulos: base.titulos, juicios: base.juicios });
    expect(r.valor.titulosConVariosJuicios).toBe(cartera.valor.titulosConVariosJuicios);
  });

  it("recupera pagos en coactiva con porcentaje entre 0 y 1", () => {
    const r = recuperacionCoactiva({
      corte: corteC,
      titulos: base.titulos,
      pagos: [...base.pagos, ...rentas.pagosCoactiva],
      reversos: base.reversos,
      juicios: base.juicios,
      historial: rentas.historial,
      resoluciones: rentas.resoluciones,
    });
    expect(r.valor.cantidadTitulos).toBeGreaterThan(0);
    expect(r.valor.totalRecuperado).toBeGreaterThan(0);
    expect(r.valor.porcentajeRecuperado).toBeGreaterThan(0);
    expect(r.valor.porcentajeRecuperado).toBeLessThanOrEqual(1);
    expect(r.valor.titulosSinFechaDeIngreso).toEqual([]);
  });

  it("emision por rubro cuadra con la suma unica de los titulos", () => {
    const r = emisionPorRubro({ corte: corteR, titulos: base.titulos, rubros: base.rubros });
    const total = base.titulos.reduce((s, t) => s + Math.round(t.valorEmitido * 100), 0) / 100;
    expect(r.valor.totalValorEmitido).toBe(total);
    expect(r.valor.totalTitulos).toBe(base.titulos.length);
    expect(r.valor.titulosSinRubro).toEqual([]);
    expect(r.valor.totalPorTipo.reduce((s, x) => s + x.titulos, 0)).toBe(base.titulos.length);
  });
});

describe("HERRAMIENTAS_RENTAS", () => {
  it("expone las cinco calculadoras con formato de finanzas", () => {
    expect(NOMBRES_HERRAMIENTAS_RENTAS.sort()).toEqual(
      ["efecto_resoluciones", "emision_por_rubro", "estado_vigente_al_corte", "recuperacion_coactiva", "resumen_coactiva"].sort(),
    );
    for (const h of Object.values(HERRAMIENTAS_RENTAS)) {
      expect(typeof h.funcion).toBe("function");
      expect(h.descripcion.length).toBeGreaterThan(10);
      expect(typeof h.esquemaEntrada.parse).toBe("function");
    }
  });

  it("valida la entrada cruda y devuelve fuente, formula, filtros y corte", () => {
    const entrada = JSON.parse(JSON.stringify({ corte: corteR, titulos: base.titulos.slice(0, 5), rubros: base.rubros }));
    const r = ejecutarHerramientaRentas("emision_por_rubro", entrada);
    expect(r.fuente).toBe("rentas");
    expect(r.formula.length).toBeGreaterThan(10);
    expect(r.filtros.length).toBeGreaterThan(0);
    expect(r.corte).toBeDefined();
    expect(() => ejecutarHerramientaRentas("estado_vigente_al_corte", { corte: corteR })).toThrow();
  });
});
