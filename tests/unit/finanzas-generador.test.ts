import { describe, expect, it } from "vitest";
import {
  Aleatorio,
  calidadDatos,
  compararCortes,
  conciliarBanco,
  Contribuyente,
  Corte,
  corteDe,
  CortesDistintosError,
  Deposito,
  FUENTES_SINTETICAS,
  generarDatosSinteticos,
  Juicio,
  Pago,
  recaudacionNeta,
  Reverso,
  Rubro,
  saldoCarteraPorTitulo,
  separarIngresosPorOrigen,
  Titulo,
} from "@/modules/finanzas";

describe("Aleatorio", () => {
  it("repite la secuencia con la misma semilla", () => {
    const a = new Aleatorio(42);
    const b = new Aleatorio(42);
    const c = new Aleatorio("otra");
    const serie = (r: Aleatorio) => Array.from({ length: 5 }, () => r.siguiente());
    expect(serie(a)).toEqual(serie(b));
    expect(serie(new Aleatorio(42))).not.toEqual(serie(c));
  });
});

describe("generarDatosSinteticos", () => {
  const datos = generarDatosSinteticos();

  it("es determinista: misma semilla, mismo resultado", () => {
    expect(JSON.stringify(generarDatosSinteticos({ semilla: 7 }))).toBe(JSON.stringify(generarDatosSinteticos({ semilla: 7 })));
    expect(JSON.stringify(generarDatosSinteticos())).toBe(JSON.stringify(datos));
    expect(JSON.stringify(generarDatosSinteticos({ semilla: 8 }))).not.toBe(JSON.stringify(generarDatosSinteticos({ semilla: 7 })));
  });

  it("respeta el tamano por defecto y el configurable", () => {
    expect(datos.contribuyentes).toHaveLength(500);
    expect(datos.titulos).toHaveLength(1500);
    const chico = generarDatosSinteticos({ contribuyentes: 20, titulos: 40 });
    expect(chico.contribuyentes).toHaveLength(20);
    expect(chico.titulos).toHaveLength(40);
    expect(chico.juicios.length).toBeGreaterThanOrEqual(3);
  });

  it("cumple los contratos Zod y usa llaves unicas", () => {
    for (const c of datos.contribuyentes) Contribuyente.parse(c);
    for (const r of datos.rubros) Rubro.parse(r);
    for (const t of datos.titulos) Titulo.parse(t);
    for (const p of datos.pagos) Pago.parse(p);
    for (const r of datos.reversos) Reverso.parse(r);
    for (const j of datos.juicios) Juicio.parse(j);
    for (const dep of datos.depositos) Deposito.parse(dep);
    for (const c of datos.cortes) Corte.parse(c);
    expect(new Set(datos.titulos.map((t) => t.id)).size).toBe(datos.titulos.length);
    expect(new Set(datos.pagos.map((p) => p.id)).size).toBe(datos.pagos.length);
  });

  it("incluye los casos borde de calidad de datos", () => {
    const calidad = calidadDatos({ corte: corteDe(datos, FUENTES_SINTETICAS.rentas), contribuyentes: datos.contribuyentes });
    const v = calidad.valor;
    expect(v.totalGeneral).toBe(500);
    expect(v.identificaciones.duplicadas.grupos).toBeGreaterThan(0);
    expect(v.identificaciones.invalidas.cantidad).toBeGreaterThan(0);
    expect(v.sinParroquia.cantidad).toBeGreaterThan(0);
    expect(v.sinSector.cantidad).toBeGreaterThan(0);
    expect(v.sinUbicacionSuficiente.cantidad).toBeGreaterThan(0);
    expect(v.cuadra).toBe(true);
  });

  it("incluye titulos con varios juicios sin duplicar el saldo", () => {
    const porTitulo = new Map<string, number>();
    for (const j of datos.juicios) porTitulo.set(j.tituloId, (porTitulo.get(j.tituloId) ?? 0) + 1);
    expect(Math.max(...porTitulo.values())).toBeGreaterThanOrEqual(3);
    const corte = corteDe(datos, FUENTES_SINTETICAS.rentas);
    const base = { corte, titulos: datos.titulos, pagos: datos.pagos, reversos: datos.reversos };
    expect(saldoCarteraPorTitulo({ ...base, juicios: datos.juicios }).valor.totalSaldo).toBe(
      saldoCarteraPorTitulo(base).valor.totalSaldo,
    );
  });

  it("incluye reversos extemporaneos, pagos sin deposito y fuentes con cortes distintos", () => {
    expect(datos.reversos.some((r) => r.extemporaneo)).toBe(true);
    const tesoreria = corteDe(datos, FUENTES_SINTETICAS.tesoreria);
    const recaudacion = recaudacionNeta({ corte: tesoreria, pagos: datos.pagos, reversos: datos.reversos });
    expect(recaudacion.valor.reversosExtemporaneos).toBeGreaterThan(0);
    expect(recaudacion.valor.neto).toBe(
      Math.round((recaudacion.valor.bruto - recaudacion.valor.reversosNormales) * 100) / 100,
    );

    const separacion = separarIngresosPorOrigen({ corte: tesoreria, pagos: datos.pagos, reversos: datos.reversos, titulos: datos.titulos, rubros: datos.rubros });
    expect(separacion.valor.cuadra).toBe(true);
    expect(separacion.valor.total).toBe(recaudacion.valor.neto);
    expect(separacion.valor.terceros).toBeGreaterThan(0);

    const bancarios = datos.pagos.filter((p) => p.canal !== "caja");
    const conciliacion = conciliarBanco({ corte: tesoreria, transacciones: bancarios, depositos: datos.depositos });
    expect(conciliacion.valor.pendiente.cantidad).toBeGreaterThan(0);
    expect(conciliacion.valor.depositosSinTransaccion.cantidad).toBeGreaterThan(0);
    expect(conciliacion.valor.cuadra).toBe(true);

    const rentas = corteDe(datos, FUENTES_SINTETICAS.rentas);
    const coactiva = corteDe(datos, FUENTES_SINTETICAS.coactiva);
    expect(() => compararCortes({ mediciones: [{ corte: rentas }, { corte: coactiva }] })).toThrow(CortesDistintosError);
    expect(() => compararCortes({ mediciones: [{ corte: rentas }, { corte: tesoreria }] })).not.toThrow();
  });
});
