import { describe, expect, it } from "vitest";
import { CifrasNoVerificadasError } from "@/orchestration/runtime/verificador-cifras";
import { montar, ORG } from "./agentes-area.soporte";

const guionConCifraInventada = {
  texto: (_peticion: unknown, numero: number) =>
    numero === 0
      ? { tipo: "llamada_herramienta" as const, nombre: "antiguedad_cartera", args: {} }
      : { tipo: "texto" as const, texto: "El porcentaje inventado es 987654.32%." },
};

describe("agentes de area: verificacion determinista de cifras", () => {
  it("advierte en resultado y registra el evento de auditoria", async () => {
    const env = montar({ guion: guionConCifraInventada });
    const resultado = await env.consultar("cartera");
    expect(resultado.estado).toBe("completado");
    if (resultado.estado !== "completado") return;

    expect(resultado.verificacionCifras).toMatchObject({ verificadas: 0, noVerificadas: 1 });
    expect(resultado.verificacionCifras.cifrasNoVerificadas[0]?.texto).toBe("987654.32%");
    expect(resultado.respuesta).toContain("Cifras no verificadas por las herramientas");
    expect(resultado.respuesta).toContain("NO deben usarse");

    const evento = (await env.auditor.listar(ORG)).find((entrada) => entrada.accion === "respuesta.cifras_no_verificadas");
    expect(evento?.despues).toMatchObject({ agente: "cartera", cifras: [{ texto: "987654.32%" }] });
  });

  it("rechaza con un error tipado cuando se configura esa politica", async () => {
    const env = montar({ guion: guionConCifraInventada, politicaCifras: "rechazar" });
    await expect(env.consultar("cartera")).rejects.toBeInstanceOf(CifrasNoVerificadasError);
  });
});
