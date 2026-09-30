import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { modoDatosDe } from "@/modules/agentes-area";
import { exigirModeloPermitido, ModeloNoPermitidoError } from "@/orchestration/runtime/politica-datos";
import { ModeloSimulado } from "@/orchestration/runtime/modelo";
import {
  crearModeloDesdeEntorno,
  ModeloOllama,
  OllamaNoLocalError,
  OllamaSalidaEstructuradaError,
  OllamaTimeoutError,
} from "@/orchestration/runtime/ollama";

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

describe("ModeloOllama", () => {
  it.each([
    "http://192.168.1.5:11434",
    "http://example.com",
    "http://0.0.0.0:11434",
    "http://user:pw@127.0.0.1:11434",
    "https://127.0.0.1:11434",
    "http://127.0.0.1.evil.com",
    "http://localhost.evil.com",
  ])("rechaza URL no local %s", (urlBase) => {
    expect(() => new ModeloOllama("modelo", { urlBase })).toThrow(OllamaNoLocalError);
  });

  it.each(["http://localhost:11434", "http://127.0.0.1:11434", "http://[::1]:11434"])(
    "acepta URL loopback %s y declara alojamiento local",
    (urlBase) => {
      const modelo = new ModeloOllama("modelo", { urlBase, fetch: async () => respuesta({}) });
      expect(modelo.alojamiento).toBe("local");
    },
  );

  it("mapea tool_calls, esquema de herramienta, opciones y tokens", async () => {
    let cuerpo: Record<string, unknown> | undefined;
    const modelo = new ModeloOllama("qwen", {
      fetch: async (_url, init) => {
        cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return respuesta({
          message: { content: "", tool_calls: [{ function: { name: "calcular", arguments: { periodo: "2026" } } }] },
          prompt_eval_count: 12,
          eval_count: 7,
        });
      },
    });
    const resultado = await modelo.generarTexto({
      sistema: "sistema",
      mensajes: [{ rol: "usuario", contenido: "consulta" }],
      herramientas: [{ nombre: "calcular", descripcion: "Calcula" }],
    });
    expect(resultado).toEqual({
      tipo: "llamada_herramienta",
      nombre: "calcular",
      args: { periodo: "2026" },
      uso: { tokens: 19, costo: 0 },
    });
    expect(cuerpo).toMatchObject({
      model: "qwen",
      stream: false,
      options: { temperature: 0, seed: 42 },
      tools: [{ type: "function", function: { name: "calcular", parameters: { type: "object" } } }],
    });
  });

  it("limita la generación a 220 tokens por defecto y permite configurarlo", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      cuerpos.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return respuesta({ message: { content: "ok" }, prompt_eval_count: 1, eval_count: 1 });
    };
    await new ModeloOllama("qwen", { fetch }).generarTexto({ sistema: "s", mensajes: [], herramientas: [] });
    await new ModeloOllama("qwen", { fetch, numPredict: 96 }).generarTexto({ sistema: "s", mensajes: [], herramientas: [] });
    expect(cuerpos[0]?.options).toMatchObject({ num_predict: 220 });
    expect(cuerpos[1]?.options).toMatchObject({ num_predict: 96 });
  });

  it("generarObjeto reintenta una vez, usa format y valida con Zod", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    const cola = [
      { message: { content: '{"n":"mal"}' }, prompt_eval_count: 2, eval_count: 1 },
      { message: { content: '{"n":3}' }, prompt_eval_count: 3, eval_count: 2 },
    ];
    const modelo = new ModeloOllama("qwen", {
      fetch: async (_url, init) => {
        cuerpos.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return respuesta(cola.shift());
      },
    });
    const resultado = await modelo.generarObjeto({ sistema: "s", entrada: "e", esquema: z.object({ n: z.number() }) });
    expect(resultado).toEqual({ objeto: { n: 3 }, uso: { tokens: 8, costo: 0 } });
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[0]?.format).toMatchObject({ type: "object" });
  });

  it("genera error tipado tras dos salidas estructuradas invalidas", async () => {
    const modelo = new ModeloOllama("qwen", {
      fetch: async () => respuesta({ message: { content: "{}" }, prompt_eval_count: 1, eval_count: 1 }),
    });
    await expect(modelo.generarObjeto({ sistema: "s", entrada: "e", esquema: z.object({ n: z.number() }) }))
      .rejects.toBeInstanceOf(OllamaSalidaEstructuradaError);
  });

  it("aborta al vencer el timeout configurable", async () => {
    const modelo = new ModeloOllama("qwen", {
      timeoutMs: 5,
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Abortado", "AbortError")));
      }),
    });
    await expect(modelo.generarTexto({ sistema: "s", mensajes: [], herramientas: [] }))
      .rejects.toBeInstanceOf(OllamaTimeoutError);
  });

  it("crea desde entorno sin fallback y usa valores configurados", () => {
    expect(crearModeloDesdeEntorno({})).toBeNull();
    const modelo = crearModeloDesdeEntorno(
      { MODELO_LOCAL: "ollama:qwen2.5:7b", OLLAMA_URL: "http://localhost:11434" },
      { fetch: async () => respuesta({}) },
    );
    expect(modelo).toMatchObject({ id: "ollama:qwen2.5:7b", nombreModelo: "qwen2.5:7b", alojamiento: "local" });
  });
});

describe("politica de datos reales", () => {
  const contexto = { orgId: "org", actor: "actor", agenteId: "agente", entidad: "entidad" };

  it("permite ModeloOllama local con modo real", async () => {
    const modelo = new ModeloOllama("qwen", { fetch: async () => respuesta({}) });
    const auditor = new Auditor(new AuditoriaMemoriaRepo(), { claveHmac: "clave-prueba-ollama-segura" });
    const modoDatos = modoDatosDe({ tipo: "real" });
    await expect(exigirModeloPermitido({ modelo, auditor, modoDatos }, contexto)).resolves.toBeUndefined();
  });

  it("rechaza un modelo de nube con modo real", async () => {
    class ModeloNube extends ModeloSimulado { override readonly alojamiento = "nube" as const; }
    const auditor = new Auditor(new AuditoriaMemoriaRepo(), { claveHmac: "clave-prueba-ollama-segura" });
    const modoDatos = modoDatosDe({ tipo: "real" });
    await expect(exigirModeloPermitido({ modelo: new ModeloNube(), auditor, modoDatos }, contexto))
      .rejects.toBeInstanceOf(ModeloNoPermitidoError);
  });
});
