import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { permitirModelo, type Alojamiento } from "@/core/datos";
import { agente, crearEntorno, ID_ANALISTA, ID_ORQ, ORG, PROYECTO } from "@/orchestration/evals/fixtures";
import { ModeloNoPermitidoError, RuntimeAgente } from "@/orchestration/runtime/agent-runtime";
import { ModeloAiSdk } from "@/orchestration/runtime/ai-sdk";
import { orquestar } from "@/orchestration/orchestrator";
import { ModeloSimulado } from "@/orchestration/runtime/modelo";

describe("permitirModelo", () => {
  it("real + nube se rechaza con un motivo legible", () => {
    const r = permitirModelo("real", "nube");
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/datos reales.*nube/i);
  });
  it("real + local, sintetico + nube y sintetico + local pasan", () => {
    expect(permitirModelo("real", "local")).toEqual({ permitido: true });
    expect(permitirModelo("sintetico", "nube")).toEqual({ permitido: true });
    expect(permitirModelo("sintetico", "local")).toEqual({ permitido: true });
  });
});

describe("alojamiento de los modelos", () => {
  it("el simulado es local y el adaptador AI SDK es nube por defecto, configurable", () => {
    const mock = new MockLanguageModelV4({});
    expect(new ModeloSimulado().alojamiento).toBe("local");
    expect(new ModeloAiSdk(mock).alojamiento).toBe("nube");
    expect(new ModeloAiSdk(mock, "ollama", "local").alojamiento).toBe("local");
  });
});

describe("RuntimeAgente aplica la politica de datos", () => {
  const tarea = { id: "00000000-0000-4000-8000-0000000000c3", orgId: ORG, proyectoId: PROYECTO, padreId: null, agenteId: ID_ANALISTA, estado: "asignada" as const, criteriosVerificacion: ["longitud_min:1"], deps: [], titulo: "t", descripcion: "d", rolAgente: "analista" };
  const solicitud = () => ({
    orgId: ORG, agente: agente(ID_ANALISTA, "analista"), tarea, referencias: [], profundidad: 1,
  });
  // Modelo en la nube falso que cuenta llamadas (ModeloSimulado con alojamiento nube).
  class SimuladoNube extends ModeloSimulado {
    override readonly alojamiento: Alojamiento = "nube";
  }
  const armar = (modoDatos?: "real" | "sintetico", nube = true) => {
    const env = crearEntorno();
    const modelo = nube ? new SimuladoNube() : new ModeloSimulado();
    const runtime = new RuntimeAgente({
      modelo,
      presupuesto: env.presupuesto,
      herramientas: env.herramientas,
      almacen: env.almacen,
      auditor: env.auditor,
      solicitarAprobacion: env.aprobacion.solicitar,
      ...(modoDatos ? { modoDatos } : {}),
    });
    return { env, modelo, runtime };
  };

  it("real + nube: rechaza, audita y no llama al modelo", async () => {
    const { env, modelo, runtime } = armar("real");
    const err = await runtime.ejecutar(solicitud()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModeloNoPermitidoError);
    expect((err as ModeloNoPermitidoError).motivo).toMatch(/datos reales/i);
    expect(modelo.llamadasTexto).toBe(0);
    const log = await env.auditor.listar(ORG);
    const e = log.find((x) => x.accion === "modelo.rechazado_politica_datos");
    expect(e?.actor).toBe(`agente:${ID_ANALISTA}`);
    expect(e?.despues).toMatchObject({
      agenteId: ID_ANALISTA, modelo: "simulado", modoDatos: "real", motivo: expect.stringMatching(/datos reales/i),
    });
  });
  it("sin opcion explicita se comporta como real", async () => {
    const { modelo, runtime } = armar(undefined);
    await expect(runtime.ejecutar(solicitud())).rejects.toBeInstanceOf(ModeloNoPermitidoError);
    expect(modelo.llamadasTexto).toBe(0);
  });
  it("real + local pasa", async () => {
    const { modelo, runtime } = armar("real", false);
    await expect(runtime.ejecutar(solicitud())).resolves.toBeDefined();
    expect(modelo.llamadasTexto).toBe(1);
  });
  it("sintetico + nube pasa", async () => {
    const { modelo, runtime } = armar("sintetico");
    await expect(runtime.ejecutar(solicitud())).resolves.toBeDefined();
    expect(modelo.llamadasTexto).toBe(1);
  });
});

describe("orquestador aplica la politica de datos", () => {
  class SimuladoNube extends ModeloSimulado {
    override readonly alojamiento: Alojamiento = "nube";
  }
  const entrada = () => ({
    orgId: ORG,
    proyectoId: PROYECTO,
    objetivo: "Estudiar el mercado",
    orquestador: agente(ID_ORQ, "pm", { skills: ["pm"] }),
    agentes: [agente(ID_ANALISTA, "analista", { skills: ["analista"] })],
  });
  const plan = {
    tareas: [{ clave: "a", titulo: "A", descripcion: "d", rol: "analista", deps: [], criterios: ["longitud_min:1"] }],
  };
  const armar = (modelo: ModeloSimulado, modoDatos?: "real" | "sintetico") => {
    const env = crearEntorno();
    const deps = { ...env.deps, modelo, ...(modoDatos ? { modoDatos } : {}) };
    const runtime = new RuntimeAgente({
      modelo, presupuesto: env.presupuesto, herramientas: env.herramientas, almacen: env.almacen,
      auditor: env.auditor, solicitarAprobacion: env.aprobacion.solicitar, ...(modoDatos ? { modoDatos } : {}),
    });
    return { env, deps: { ...deps, runtime } };
  };
  const guion = { objeto: () => plan };

  it("real (o por defecto) + nube: no llama al modelo y audita el rechazo", async () => {
    for (const modo of ["real", undefined] as const) {
      const modelo = new SimuladoNube(guion);
      const { env, deps } = armar(modelo, modo);
      const err = await orquestar(deps, entrada()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ModeloNoPermitidoError);
      expect(modelo.llamadasObjeto).toBe(0);
      expect(modelo.llamadasTexto).toBe(0);
      const e = (await env.auditor.listar(ORG)).find((x) => x.accion === "modelo.rechazado_politica_datos");
      expect(e?.actor).toBe(`agente:${ID_ORQ}`);
      expect(e?.despues).toMatchObject({ modelo: "simulado", modoDatos: "real", motivo: expect.stringMatching(/datos reales/i) });
    }
  });
  it("real + local funciona", async () => {
    const modelo = new ModeloSimulado(guion);
    const { deps } = armar(modelo, "real");
    const r = await orquestar(deps, entrada());
    expect(r.estado).toBe("completado");
    expect(modelo.llamadasObjeto).toBe(1);
  });
  it("sintetico + nube funciona", async () => {
    const modelo = new SimuladoNube(guion);
    const { deps } = armar(modelo, "sintetico");
    const r = await orquestar(deps, entrada());
    expect(r.estado).toBe("completado");
    expect(modelo.llamadasObjeto).toBe(1);
  });
});
