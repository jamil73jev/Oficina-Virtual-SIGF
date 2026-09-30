import { describe, expect, it } from "vitest";
import { verificarCifras } from "@/orchestration/runtime/verificador-cifras";

describe("verificarCifras", () => {
  it("detecta el porcentaje inventado del caso real", () => {
    const resultado = verificarCifras(
      "El tramo suma 580034.46 de 1021655.02, es decir 54.19%.",
      [{ valor: { saldo: 580034.46, totalSaldo: 1021655.02, porcentaje: 56.77 } }],
    );
    expect(resultado.verificadas.map((c) => c.texto)).toEqual(["580034.46", "1021655.02"]);
    expect(resultado.noVerificadas.map((c) => c.texto)).toEqual(["54.19%"]);
  });

  it.each(["31032.78", "31.032,78", "31,032.78"])("normaliza miles y decimales: %s", (texto) => {
    expect(verificarCifras(texto, [{ total: 31032.78 }]).noVerificadas).toHaveLength(0);
  });

  it.each(["1,855,231.81", "1.855.231,81", "1855231.81"])("verifica importes grandes con formato regional: %s", (texto) => {
    const resultado = verificarCifras(`Valor emitido ${texto}; cifra inventada 9,999,999.99.`, [{ totalValorEmitido: 1855231.81 }]);
    expect(resultado.verificadas.map((cifra) => cifra.texto)).toContain(texto);
    expect(resultado.noVerificadas.map((cifra) => cifra.texto)).toContain("9,999,999.99");
  });

  it("excluye fechas, cortes, periodos, rangos, listas e identificadores", () => {
    const respuesta = "1. Corte 2026-08-31, periodo 2026-08, 23:59.\n2. Tramos 0-30 y 181-360; título T123 y código AB-456.";
    expect(verificarCifras(respuesta, []).noVerificadas).toEqual([]);
  });

  it("tolera solo redondeo a cero, uno o dos decimales", () => {
    const resultado = verificarCifras("Valores: 57, 56.8 y 56.77; no 56.777.", [{ valor: 56.774 }]);
    expect(resultado.verificadas.map((c) => c.texto)).toEqual(["57", "56.8", "56.77"]);
    expect(resultado.noVerificadas.map((c) => c.texto)).toEqual(["56.777"]);
  });

  it("compara una fraccion de herramienta con un porcentaje de respuesta", () => {
    expect(verificarCifras("Representa 56.77 %.", [{ proporcion: 0.5677 }]).noVerificadas).toHaveLength(0);
  });

  it.each([
    ["0.029", 0.029],
    ["0.208", 0.208],
    ["0,0655", 0.0655],
  ])("interpreta siempre como decimal un cero inicial: %s", (texto, valor) => {
    expect(verificarCifras(texto, [{ valor }]).noVerificadas).toHaveLength(0);
  });

  it("verifica ambos significados posibles de un separador seguido por tres digitos", () => {
    expect(verificarCifras("31.032", [{ valor: 31032 }]).noVerificadas).toHaveLength(0);
    expect(verificarCifras("31.032", [{ valor: 31.032 }]).noVerificadas).toHaveLength(0);
  });

  it("mantiene como no verificada una cifra que no coincide con ningun candidato", () => {
    const resultado = verificarCifras("El valor es 5.42.", [{ valores: [4.55, 0.0455] }]);
    expect(resultado.noVerificadas.map((c) => c.texto)).toEqual(["5.42"]);
  });

  it("verifica enteros pequenos y conserva texto y posicion de los no verificados", () => {
    const respuesta = "Hay 3 casos y 4 pendientes.";
    const resultado = verificarCifras(respuesta, [{ casos: 3 }]);
    expect(resultado.verificadas[0]).toMatchObject({ texto: "3", posicion: 4 });
    expect(resultado.noVerificadas[0]).toMatchObject({ texto: "4", posicion: 14 });
  });
});
