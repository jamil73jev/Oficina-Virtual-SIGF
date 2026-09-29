import { describe, expect, it, vi } from "vitest";
import type { ContextoAcceso } from "@/core/rbac";
import {
  crearManejadorConsultaLocal,
  crearManejadorEstadoModeloLocal,
} from "@/modules/agentes-ui";
import { ModeloOllama } from "@/orchestration/runtime/ollama";

const ORG = "00000000-0000-4000-8000-000000000001";
const PROYECTO = "00000000-0000-4000-8000-0000000000a1";
const admin: ContextoAcceso = { usuarioId: "usuario", orgId: ORG, rol: "admin" };
const req = () => new Request("http://local/api/agents/datos/consulta", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ proyectoId: PROYECTO, pregunta: "Analiza el corte" }),
});
const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

const modeloDisponible = () => new ModeloOllama("qwen", {
  fetch: async (url) => String(url).endsWith("/api/tags")
    ? json({ models: [{ name: "qwen" }] })
    : json({ message: { content: "respuesta" }, prompt_eval_count: 1, eval_count: 1 }),
});

describe("API de modelo local", () => {
  it("informa configuracion y disponibilidad sin exponer datos", async () => {
    const configurado = await crearManejadorEstadoModeloLocal(modeloDisponible)();
    expect(await configurado.json()).toEqual({ configurado: true, disponible: true, modelo: "qwen" });
    const ausente = await crearManejadorEstadoModeloLocal(() => null)();
    expect(await ausente.json()).toEqual({ configurado: false, disponible: false, modelo: null });
  });

  it("consulta devuelve 503 sin configuracion y no ejecuta fallback", async () => {
    const ejecutar = vi.fn();
    const respuesta = await crearManejadorConsultaLocal({
      identidad: () => admin,
      crearModelo: () => null,
      ejecutar,
    })(req(), "datos");
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toEqual({ error: "modelo_local_no_configurado" });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("consulta devuelve 503 si el servidor es inalcanzable y no ejecuta fallback", async () => {
    const ejecutar = vi.fn();
    const modelo = new ModeloOllama("qwen", { fetch: async () => { throw new TypeError("sin servidor"); } });
    const respuesta = await crearManejadorConsultaLocal({
      identidad: () => admin,
      crearModelo: () => modelo,
      ejecutar,
    })(req(), "datos");
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toEqual({ error: "modelo_local_no_disponible" });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("devuelve 401 sin identidad antes de consultar configuracion", async () => {
    const crearModelo = vi.fn(modeloDisponible);
    const respuesta = await crearManejadorConsultaLocal({ identidad: () => null, crearModelo })(req(), "datos");
    expect(respuesta.status).toBe(401);
    expect(crearModelo).not.toHaveBeenCalled();
  });

  it("devuelve 403 sin permiso antes de consultar configuracion", async () => {
    const crearModelo = vi.fn(modeloDisponible);
    const respuesta = await crearManejadorConsultaLocal({
      identidad: () => ({ ...admin, rol: "viewer" }),
      crearModelo,
    })(req(), "datos");
    expect(respuesta.status).toBe(403);
    expect(crearModelo).not.toHaveBeenCalled();
  });
});

