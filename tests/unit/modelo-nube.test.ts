import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ModeloLenguaje } from "@/orchestration/runtime/modelo";
import { ModeloSimulado } from "@/orchestration/runtime/modelo";
import { ModeloNubeAgotadoError, ModeloNubeResiliente } from "@/orchestration/runtime/modelo-nube";
import { crearModeloDesdeEntorno } from "@/orchestration/runtime/ollama";

const peticion = { sistema: "s", mensajes: [], herramientas: [] };

const modeloQueFalla = (): ModeloLenguaje => ({
  id: "gateway:prueba/modelo",
  alojamiento: "nube",
  generarTexto: vi.fn(async () => { throw Object.assign(new Error("limite"), { statusCode: 429 }); }),
  generarObjeto: vi.fn(async () => { throw Object.assign(new Error("limite"), { statusCode: 429 }); }) as ModeloLenguaje["generarObjeto"],
});

describe("modelo de nube", () => {
  it("valida ausencia, formato y credenciales", () => {
    expect(crearModeloDesdeEntorno({})).toBeNull();
    expect(() => crearModeloDesdeEntorno({ MODELO: "gateway:invalido", AI_GATEWAY_API_KEY: "x" })).toThrow(/invalido/);
    expect(() => crearModeloDesdeEntorno({ MODELO: "gateway:google/gemini-2.5-flash-lite" })).toThrow(/AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN/);
    expect(crearModeloDesdeEntorno({ MODELO: "gateway:google/gemini-2.5-flash-lite", AI_GATEWAY_API_KEY: "secreto" }))
      .toMatchObject({ id: "gateway:google/gemini-2.5-flash-lite", alojamiento: "nube" });
  });

  it("valida el modelo google: formato y clave obligatoria", () => {
    expect(() => crearModeloDesdeEntorno({ MODELO: "google:gemini-2.5-flash-lite" })).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => crearModeloDesdeEntorno({ MODELO: "google:mal/formato", GOOGLE_GENERATIVE_AI_API_KEY: "x" })).toThrow(/invalido/);
    expect(crearModeloDesdeEntorno({ MODELO: "google:gemini-2.5-flash-lite", GOOGLE_GENERATIVE_AI_API_KEY: "secreto" }))
      .toMatchObject({ id: "google:gemini-2.5-flash-lite", alojamiento: "nube" });
  });

  it("en Vercel acepta el token OIDC automatico sin variable de credencial", () => {
    expect(crearModeloDesdeEntorno({ MODELO: "gateway:google/gemini-2.5-flash-lite", VERCEL: "1" }))
      .toMatchObject({ id: "gateway:google/gemini-2.5-flash-lite", alojamiento: "nube" });
  });

  it("reintenta 429 y lanza error tipado al agotar tres intentos", async () => {
    const base = modeloQueFalla();
    const esperar = vi.fn(async () => undefined);
    const modelo = new ModeloNubeResiliente(base, { esperar, timeoutMs: 100 });
    await expect(modelo.generarTexto(peticion)).rejects.toBeInstanceOf(ModeloNubeAgotadoError);
    expect(base.generarTexto).toHaveBeenCalledTimes(3);
    expect(esperar).toHaveBeenCalledTimes(2);
  });

  it("solo usa respaldo explícito y marca visiblemente su comentario", async () => {
    const modelo = new ModeloNubeResiliente(modeloQueFalla(), {
      respaldo: new ModeloSimulado(),
      esperar: async () => undefined,
      timeoutMs: 100,
    });
    const resultado = await modelo.generarTexto({ ...peticion, mensajes: [{ rol: "usuario", contenido: "hola" }] });
    expect(resultado).toMatchObject({ tipo: "texto" });
    if (resultado.tipo === "texto") expect(resultado.texto).toContain("respaldo simulado");
    await expect(modelo.generarObjeto({ sistema: "s", entrada: "e", esquema: z.object({}) })).resolves.toMatchObject({ objeto: {} });
  });
});
