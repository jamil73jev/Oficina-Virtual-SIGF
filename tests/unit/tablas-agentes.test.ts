import { describe, expect, it } from "vitest";
import { renderizarTablas, etiquetaCampo, tablaACsv } from "@/modules/agentes-area";
import { antiguedadCartera, corteDe, generarDatosSinteticos } from "@/modules/finanzas";

describe("tablas deterministas de agentes", () => {
  it("conserva todas las filas y celdas exactas de antiguedad_cartera", () => {
    const datos = generarDatosSinteticos({ semilla: 20260831 });
    const directo = antiguedadCartera({
      corte: corteDe(datos, "rentas"),
      titulos: datos.titulos,
      pagos: datos.pagos,
      reversos: datos.reversos,
      juicios: datos.juicios,
    });
    const tablas = renderizarTablas([{ herramienta: "antiguedad_cartera", ...directo }], "es");
    const tramos = tablas.find((tabla) => tabla.ruta === "antiguedad_cartera.tramos");
    expect(tramos?.filas).toHaveLength(directo.valor.tramos.length);
    expect(tramos?.filas.map((fila) => Object.fromEntries(fila.celdas.map((celda) => [celda.columna, celda.valorExacto]))))
      .toEqual(directo.valor.tramos);

    const porVencer = tablas.find((tabla) => tabla.ruta === "antiguedad_cartera.porVencer");
    expect(porVencer).toBeDefined();
    expect(Object.fromEntries(porVencer!.filas.map((fila) => [fila.celdas[0]?.valorExacto, fila.celdas[1]?.valorExacto])))
      .toEqual({ Títulos: directo.valor.porVencer.titulos, Saldo: directo.valor.porVencer.saldo });
  });

  it("separa correctamente camelCase con una O mayuscula", () => {
    expect(etiquetaCampo("recaudadoOPagado", "es")).toBe("Recaudado o pagado");
    expect(etiquetaCampo("recaudadoOPagado", "en")).toBe("Collected or paid");
  });

  it("formatea numeros y monedas en ES y EN y conserva el valor exacto", () => {
    const salida = [{ herramienta: "prueba", fuente: "x", formula: "x", filtros: [], corte: {}, valor: { cantidad: 1234.5, saldo: 1234.5 } }];
    const es = renderizarTablas(salida, "es")[0]!;
    const en = renderizarTablas(salida, "en")[0]!;
    expect(es.filas.map((fila) => fila.celdas[1]?.texto)).toEqual(["1.234,5", "$1.234,50"]);
    expect(en.filas.map((fila) => fila.celdas[1]?.texto)).toEqual(["1,234.5", "$1,234.50"]);
    expect(es.filas.map((fila) => fila.celdas[1]?.valorExacto)).toEqual([1234.5, 1234.5]);
  });

  it("recorta 1.500 filas de forma visible, resume anidados y exporta todas por CSV", () => {
    const titulos = Array.from({ length: 1_500 }, (_, indice) => ({
      id: `T-${indice + 1}`,
      saldo: indice + 0.5,
      inconsistencias: indice === 0 ? ["identificación", "rubro"] : [],
    }));
    const [tabla] = renderizarTablas([{ herramienta: "estado_vigente_al_corte", valor: { titulos } }], "es");
    expect(tabla?.filas).toHaveLength(200);
    expect(tabla?.filasTotales).toBe(1_500);
    expect(tabla?.avisoFilas).toBe("Mostrando 200 de 1.500 filas");
    expect(tabla?.filas[0]?.celdas.find((celda) => celda.columna === "inconsistencias")?.texto).toBe("2: identificación; rubro");
    const csv = tablaACsv(tabla!);
    expect(csv.split("\r\n")).toHaveLength(1_501);
    expect(csv).toContain("T-1500");
  });

  it("limita y prioriza tablas por herramienta con aviso exacto", () => {
    const valor = Object.fromEntries(Array.from({ length: 10 }, (_, indice) => [`detalle_${indice + 1}`, [{ id: indice }]]));
    Object.assign(valor, { resumen_total: [{ total: 10 }] });
    const tablas = renderizarTablas([{ herramienta: "prueba", valor }], "en");
    expect(tablas).toHaveLength(8);
    expect(tablas[0]?.ruta).toBe("prueba.resumen_total");
    expect(tablas[0]?.tablasOmitidas).toHaveLength(3);
    expect(tablas[0]?.avisoTablas).toContain("3 detail tables omitted");
  });
});
