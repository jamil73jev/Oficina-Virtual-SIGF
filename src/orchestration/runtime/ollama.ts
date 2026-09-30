import { z } from "zod";
import type { Alojamiento } from "@/core/datos";
import type {
  MensajeModelo,
  ModeloLenguaje,
  PasoModelo,
  PeticionObjeto,
  PeticionTexto,
  UsoModelo,
} from "./modelo";

export class OllamaNoLocalError extends Error {
  constructor(readonly url: string) {
    super(`La URL de Ollama no es un servidor local permitido: ${url}`);
    this.name = "OllamaNoLocalError";
  }
}

export class OllamaTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Ollama excedio el tiempo limite de ${timeoutMs} ms`);
    this.name = "OllamaTimeoutError";
  }
}

export class OllamaRespuestaError extends Error {
  constructor(readonly codigo: "http" | "respuesta_invalida", detalle: string) {
    super(`Ollama: ${codigo} (${detalle})`);
    this.name = "OllamaRespuestaError";
  }
}

export class OllamaSalidaEstructuradaError extends Error {
  constructor(readonly intentos: number) {
    super(`Ollama no produjo una salida estructurada valida tras ${intentos} intentos`);
    this.name = "OllamaSalidaEstructuradaError";
  }
}

export class OllamaConfiguracionError extends Error {
  constructor(readonly valor: string) {
    super(`MODELO_LOCAL invalido: ${valor}`);
    this.name = "OllamaConfiguracionError";
  }
}

type FetchOllama = typeof fetch;

export interface OpcionesModeloOllama {
  urlBase?: string;
  timeoutMs?: number;
  fetch?: FetchOllama;
  semilla?: number;
  /** Máximo de tokens generados por respuesta. */
  numPredict?: number;
}

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validarUrlOllama(valor: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new OllamaNoLocalError(valor);
  }
  if (
    url.protocol !== "http:" ||
    !HOSTS_LOCALES.has(url.hostname.toLowerCase()) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new OllamaNoLocalError(valor);
  }
  return url;
}

const uso = (respuesta: { prompt_eval_count?: unknown; eval_count?: unknown }): UsoModelo => {
  const entrada = typeof respuesta.prompt_eval_count === "number" ? respuesta.prompt_eval_count : 0;
  const salida = typeof respuesta.eval_count === "number" ? respuesta.eval_count : 0;
  return { tokens: entrada + salida, costo: 0 };
};

const mensajeOllama = (mensaje: MensajeModelo) => ({
  role: mensaje.rol === "usuario" ? "user" : mensaje.rol === "asistente" ? "assistant" : "tool",
  content: mensaje.contenido,
  ...(mensaje.rol === "herramienta" && mensaje.herramienta ? { tool_name: mensaje.herramienta } : {}),
});

interface RespuestaChat {
  message?: {
    content?: unknown;
    tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
  };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
}

export class ModeloOllama implements ModeloLenguaje {
  readonly alojamiento: Alojamiento = "local";
  readonly id: string;
  readonly urlBase: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchOllama;
  private readonly semilla: number;
  private readonly numPredict: number;

  constructor(readonly nombreModelo: string, opciones: OpcionesModeloOllama = {}) {
    if (!nombreModelo.trim()) throw new OllamaConfiguracionError("ollama:");
    this.id = `ollama:${nombreModelo}`;
    this.urlBase = validarUrlOllama(opciones.urlBase ?? "http://127.0.0.1:11434");
    this.timeoutMs = opciones.timeoutMs ?? 180_000;
    this.fetchImpl = opciones.fetch ?? fetch;
    this.semilla = opciones.semilla ?? 42;
    this.numPredict = opciones.numPredict ?? 220;
  }

  async generarTexto(p: PeticionTexto): Promise<PasoModelo> {
    const respuesta = await this.chat({
      messages: [{ role: "system", content: p.sistema }, ...p.mensajes.map(mensajeOllama)],
      tools: p.herramientas.map((h) => ({
        type: "function",
        function: {
          name: h.nombre,
          description: h.descripcion,
          parameters: { type: "object", properties: {}, additionalProperties: true },
        },
      })),
    });
    const u = uso(respuesta);
    const llamada = respuesta.message?.tool_calls?.[0]?.function;
    if (typeof llamada?.name === "string") {
      let args: unknown = llamada.arguments ?? {};
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      return { tipo: "llamada_herramienta", nombre: llamada.name, args, uso: u };
    }
    if (typeof respuesta.message?.content !== "string") {
      throw new OllamaRespuestaError("respuesta_invalida", "message.content ausente");
    }
    return { tipo: "texto", texto: respuesta.message.content, uso: u };
  }

  async generarObjeto<T>(p: PeticionObjeto<T>): Promise<{ objeto: T; uso: UsoModelo }> {
    let tokens = 0;
    for (let intento = 1; intento <= 2; intento++) {
      const respuesta = await this.chat({
        messages: [
          { role: "system", content: p.sistema },
          { role: "user", content: intento === 1 ? p.entrada : `${p.entrada}\nLa respuesta anterior no cumplio el esquema. Devuelve solo JSON valido.` },
        ],
        format: z.toJSONSchema(p.esquema),
      });
      tokens += uso(respuesta).tokens;
      const contenido = respuesta.message?.content;
      if (typeof contenido === "string") {
        try {
          const validado = p.esquema.safeParse(JSON.parse(contenido));
          if (validado.success) return { objeto: validado.data, uso: { tokens, costo: 0 } };
        } catch {
          // El segundo intento recibe una instruccion de correccion; nunca se acepta JSON invalido.
        }
      }
    }
    throw new OllamaSalidaEstructuradaError(2);
  }

  async disponible(timeoutMs = 3_000): Promise<boolean> {
    try {
      const respuesta = await this.solicitar("/api/tags", { method: "GET" }, timeoutMs);
      if (!respuesta.ok) return false;
      const cuerpo = await respuesta.json() as { models?: { name?: unknown; model?: unknown }[] };
      return (cuerpo.models ?? []).some((m) => m.name === this.nombreModelo || m.model === this.nombreModelo);
    } catch {
      return false;
    }
  }

  private async chat(extra: Record<string, unknown>): Promise<RespuestaChat> {
    const respuesta = await this.solicitar("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.nombreModelo,
        stream: false,
        options: { temperature: 0, seed: this.semilla, num_predict: this.numPredict },
        ...extra,
      }),
    }, this.timeoutMs);
    if (!respuesta.ok) throw new OllamaRespuestaError("http", String(respuesta.status));
    const cuerpo = await respuesta.json() as RespuestaChat;
    if (!cuerpo || typeof cuerpo !== "object") throw new OllamaRespuestaError("respuesta_invalida", "JSON ausente");
    return cuerpo;
  }

  private async solicitar(ruta: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      return await this.fetchImpl(new URL(ruta, this.urlBase), {
        redirect: "error",
        ...init,
        signal: controlador.signal,
      });
    } catch (error) {
      if (controlador.signal.aborted) throw new OllamaTimeoutError(timeoutMs);
      throw error;
    } finally {
      clearTimeout(temporizador);
    }
  }
}

export function crearModeloDesdeEntorno(
  env: Record<string, string | undefined> = process.env,
  opciones: Omit<OpcionesModeloOllama, "urlBase"> = {},
): ModeloOllama | null {
  const configurado = env.MODELO_LOCAL;
  if (configurado === undefined || configurado.trim() === "") return null;
  const coincidencia = /^ollama:(.+)$/.exec(configurado.trim());
  if (!coincidencia?.[1]?.trim()) throw new OllamaConfiguracionError(configurado);
  return new ModeloOllama(coincidencia[1].trim(), {
    ...opciones,
    urlBase: env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434",
  });
}
