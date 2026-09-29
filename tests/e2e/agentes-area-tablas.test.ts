import { describe, expect, it } from "vitest";
import { montar } from "./agentes-area.soporte";
import type { PeticionTexto } from "@/orchestration/runtime/modelo";

const guion = (comentario: string) => ({
  texto: (_peticion: unknown, numero: number) =>
    numero === 0
      ? { tipo: "llamada_herramienta" as const, nombre: "antiguedad_cartera", args: {} }
      : { tipo: "texto" as const, texto: comentario },
});

describe("agentes de area: tablas deterministas", () => {
  it("mantiene tablas correctas aunque el comentario atribuya una cifra falsa", async () => {
    const env = montar({ guion: guion("El tramo por vencer representa 999999.9%.") });
    const resultado = await env.consultar("cartera");
    if (resultado.estado !== "completado") throw new Error(resultado.estado);

    expect(resultado.tablas.find((tabla) => tabla.ruta === "antiguedad_cartera.tramos")?.filas).toHaveLength(5);
    expect(resultado.tablas.some((tabla) => tabla.ruta === "antiguedad_cartera.porVencer")).toBe(true);
    expect(resultado.comentario).toContain("999999.9%");
    expect(resultado.verificacionCifras).toMatchObject({ total: 1, verificadas: 0, noVerificadas: 1 });
    expect(resultado.respuesta.indexOf("Antiguedad cartera")).toBeGreaterThanOrEqual(0);
    expect(resultado.respuesta.indexOf("Antiguedad cartera")).toBeLessThan(resultado.respuesta.indexOf("Comentario del modelo"));
    const peticion = env.modelo.peticiones[1] as PeticionTexto;
    expect(peticion.sistema).toContain("NO las repitas, reescribas ni reordenes");
    expect(peticion.sistema).toContain("prevalece esta instrucción");
  });

  it("verifica solamente el comentario y no las cifras renderizadas por codigo", async () => {
    const env = montar({ guion: guion("Comentario sin cifras.") });
    const resultado = await env.consultar("cartera");
    if (resultado.estado !== "completado") throw new Error(resultado.estado);
    expect(resultado.tablas.length).toBeGreaterThan(0);
    expect(resultado.verificacionCifras).toMatchObject({ total: 0, verificadas: 0, noVerificadas: 0 });
  });

  it("conserva las tablas si el modelo falla despues de usar la herramienta", async () => {
    const env = montar({ guion: {
      texto: (_peticion, numero) => {
        if (numero === 0) return { tipo: "llamada_herramienta", nombre: "antiguedad_cartera", args: {} };
        throw new Error("modelo inalcanzable");
      },
    } });
    const resultado = await env.consultar("cartera");
    if (resultado.estado !== "completado") throw new Error(resultado.estado);
    expect(resultado.tablas.length).toBeGreaterThan(0);
    expect(resultado.comentario).toContain("No hay comentario del modelo");
  });
});
