import { describe, expect, it } from "vitest";
import { verificarCifras } from "@/orchestration/runtime/verificador-cifras";

describe("verificarCifras: fechas escritas en palabras", () => {
  const salida = { corte: { fechaCorte: "2026-08-31T23:59:00.000Z" }, valor: { total: 1500.25 } };

  it("verifica anio y dia de una fecha en palabras a partir de la fecha ISO de la herramienta", () => {
    const r = verificarCifras("Al 31 de agosto de 2026 el total es 1500.25.", [salida]);
    expect(r.noVerificadas).toEqual([]);
    expect(r.verificadas.map((c) => c.texto)).toEqual(["31", "2026", "1500.25"]);
  });

  it("acepta fechas como objeto Date y la forma en ingles", () => {
    const r = verificarCifras("As of August 31, 2026.", [{ corte: new Date("2026-08-31T12:00:00Z") }]);
    expect(r.noVerificadas).toEqual([]);
  });

  it("no inventa componentes: otro anio u otro dia siguen sin verificar", () => {
    const r = verificarCifras("Al 30 de agosto de 2025.", [salida]);
    expect(r.noVerificadas.map((c) => c.texto)).toEqual(["30", "2025"]);
  });

  it("sin fecha en las herramientas, el anio escrito no se verifica", () => {
    expect(verificarCifras("En 2026.", [{ valor: { total: 1 } }]).noVerificadas.map((c) => c.texto)).toEqual(["2026"]);
  });
});
