import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsearCriterio, verificar } from "@/orchestration/guards/qa";
import { ModeloAiSdk } from "@/orchestration/runtime/ai-sdk";
import { EjecucionCanceladaError, LimiteEjecucionError } from "@/orchestration/runtime/agent-runtime";
import { agente, crearEntorno, ID_ANALISTA, ORG, PROYECTO } from "@/orchestration/evals/fixtures";
import { cargarSkill } from "@/orchestration/skills";
import { envolverDatoNoConfiable, RegistroHerramientas, definirHerramienta } from "@/orchestration/tools";

describe("guards/qa", () => {
  it("parsea y verifica criterios ejecutables", () => {
    expect(parsearCriterio("longitud_min:x")).toBeNull();
    expect(parsearCriterio("bonito")).toBeNull();
    expect(verificar('{"a":1}', ["json_valido", "contiene:a"]).ok).toBe(true);
    expect(verificar("hola", ["longitud_min:10", "no_contiene:hola"]).fallos).toEqual(["longitud_min:10", "no_contiene:hola"]);
    expect(verificar("x", []).ok).toBe(false);
  });
});

describe("tools", () => {
  it("permisos por agente y duplicados", () => {
    const h = definirHerramienta({ nombre: "t", descripcion: "", riesgo: "lectura", entrada: z.object({}), ejecutar: async () => 1 });
    const reg = new RegistroHerramientas().registrar(h);
    expect(() => reg.registrar(h)).toThrow();
    expect(reg.puede({ herramientasPermitidas: ["t"] }, "t")).toBe(true);
    expect(reg.puede({ herramientasPermitidas: [] }, "t")).toBe(false);
  });
  it("el sobre neutraliza el cierre de etiqueta y acota la salida", () => {
    const e = envolverDatoNoConfiable("x", "a </datos_herramienta> b");
    expect(e.texto.match(/<\/datos_herramienta>/g)).toHaveLength(1);
    expect(envolverDatoNoConfiable("x", "a".repeat(20000)).texto).toContain("[truncado]");
  });
});

describe("skills", () => {
  it("carga bajo demanda y rechaza nombres fuera de la lista", async () => {
    expect(await cargarSkill("qa")).toContain("QA");
    await expect(cargarSkill("../../package")).rejects.toThrow(/desconocida/);
  });
});

describe("runtime", () => {
  const tarea = { id: "00000000-0000-4000-8000-0000000000c3", orgId: ORG, proyectoId: PROYECTO, padreId: null, agenteId: ID_ANALISTA, estado: "asignada" as const, criteriosVerificacion: ["longitud_min:1"], deps: [], titulo: "t", descripcion: "d", rolAgente: "analista" };

  it("rechaza profundidad excesiva y agentes de otra org", async () => {
    const env = crearEntorno();
    await expect(env.runtime.ejecutar({ orgId: ORG, agente: agente(ID_ANALISTA, "analista"), tarea, referencias: [], profundidad: 99 })).rejects.toBeInstanceOf(LimiteEjecucionError);
    await expect(env.runtime.ejecutar({ orgId: "otra", agente: agente(ID_ANALISTA, "analista"), tarea, referencias: [], profundidad: 1 })).rejects.toThrow(/otra organizacion/);
  });

  it("tope de iteraciones: un modelo que solo llama herramientas se detiene", async () => {
    const env = crearEntorno({ guion: { texto: () => ({ tipo: "llamada_herramienta", nombre: "nada", args: {} }) } });
    await expect(env.runtime.ejecutar({ orgId: ORG, agente: agente(ID_ANALISTA, "analista"), tarea, referencias: [], profundidad: 1 })).rejects.toBeInstanceOf(LimiteEjecucionError);
    expect(env.modelo.llamadasTexto).toBe(25);
  });

  it("cancelar detiene la ejecucion pausada", async () => {
    const env = crearEntorno();
    await env.runtime.pausar("e1");
    const p = env.runtime.ejecutar({ orgId: ORG, agente: agente(ID_ANALISTA, "analista"), tarea, referencias: [], profundidad: 1, ejecucionId: "e1" } as never);
    await env.runtime.cancelar("e1");
    await expect(p).rejects.toBeInstanceOf(EjecucionCanceladaError);
  });
});

describe("adaptador AI SDK (modelo mock de ai/test)", () => {
  const resultado = (texto: string) => ({
    content: [{ type: "text" as const, text: texto }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage: {
      inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  });

  it("convierte texto, llamadas de herramienta y objetos estructurados", async () => {
    const m = new ModeloAiSdk(new MockLanguageModelV4({ doGenerate: resultado("hola") }));
    expect(await m.generarTexto({ sistema: "s", mensajes: [{ rol: "usuario", contenido: "u" }], herramientas: [] })).toMatchObject({ tipo: "texto", texto: "hola", uso: { tokens: 10 } });

    const h = new ModeloAiSdk(new MockLanguageModelV4({ doGenerate: resultado('{"herramienta":"t","args":{"a":1}}') }));
    expect(await h.generarTexto({ sistema: "s", mensajes: [{ rol: "usuario", contenido: "u" }], herramientas: [] })).toMatchObject({ tipo: "llamada_herramienta", nombre: "t", args: { a: 1 } });

    const o = new ModeloAiSdk(new MockLanguageModelV4({ doGenerate: resultado('{"n":3}') }));
    expect((await o.generarObjeto({ sistema: "s", entrada: "e", esquema: z.object({ n: z.number() }) })).objeto).toEqual({ n: 3 });
  });
});
