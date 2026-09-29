import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import type { Alojamiento } from "@/core/datos";
import {
  PRECIO_TOKEN,
  type MensajeModelo,
  type ModeloLenguaje,
  type PasoModelo,
  type PeticionObjeto,
  type PeticionTexto,
  type UsoModelo,
} from "./modelo";

const uso = (u: { totalTokens?: number | undefined }): UsoModelo => {
  const tokens = u.totalTokens ?? 0;
  return { tokens, costo: tokens * PRECIO_TOKEN };
};

const llamadaDe = (m: MensajeModelo): { herramienta: string; args: unknown } | null => {
  try {
    const j: unknown = JSON.parse(m.contenido);
    if (j && typeof j === "object" && "herramienta" in j && typeof j.herramienta === "string") {
      return { herramienta: j.herramienta, args: "args" in j ? j.args : {} };
    }
  } catch {
    /* no es una llamada */
  }
  return null;
};

/**
 * Convierte los mensajes al formato del AI SDK. La salida de una herramienta viaja con el
 * rol NATIVO `tool` (tool-result), nunca como mensaje de usuario: asi el modelo la trata
 * como dato de herramienta y no como instruccion del usuario.
 */
export function aMensajesAiSdk(mensajes: readonly MensajeModelo[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  let n = 0;
  for (let i = 0; i < mensajes.length; i++) {
    const m = mensajes[i] as MensajeModelo;
    const sig = mensajes[i + 1];
    if (m.rol === "asistente") {
      const llamada = sig?.rol === "herramienta" ? llamadaDe(m) : null;
      if (llamada && sig) {
        const id = `call_${++n}`;
        out.push({
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: id, toolName: llamada.herramienta, input: llamada.args },
          ],
        });
        out.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: id,
              toolName: llamada.herramienta,
              output: { type: "text", value: sig.contenido },
            },
          ],
        });
        i++;
        continue;
      }
      out.push({ role: "assistant", content: m.contenido });
    } else if (m.rol === "herramienta") {
      // Salida sin llamada emparejada: se sintetiza la llamada para conservar el rol tool.
      const id = `call_${++n}`;
      const nombre = m.herramienta ?? "herramienta";
      out.push({
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: id, toolName: nombre, input: {} }],
      });
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: id,
            toolName: nombre,
            output: { type: "text", value: m.contenido },
          },
        ],
      });
    } else {
      out.push({ role: "user", content: m.contenido });
    }
  }
  return out;
}

/**
 * Adaptador al AI SDK (`ai`): acepta cualquier LanguageModel (Gateway o mock de `ai/test`).
 * El runtime ejecuta las herramientas (riesgo y aprobacion), por eso aqui no se pasan `tools`;
 * una llamada se expresa como texto JSON `{"herramienta":..., "args":...}` hasta cablear
 * tool-calling nativo con el modelo real.
 */
export class ModeloAiSdk implements ModeloLenguaje {
  constructor(
    private readonly modelo: LanguageModel,
    readonly id = "ai-sdk",
    /** Por defecto nube (Gateway); indicar "local" solo para un modelo en infraestructura propia. */
    readonly alojamiento: Alojamiento = "nube",
  ) {}

  async generarTexto(p: PeticionTexto): Promise<PasoModelo> {
    const r = await generateText({
      model: this.modelo,
      system: p.sistema,
      messages: aMensajesAiSdk(p.mensajes),
    });
    const u = uso(r.usage);
    try {
      const j: unknown = JSON.parse(r.text);
      if (j && typeof j === "object" && "herramienta" in j && typeof j.herramienta === "string") {
        return {
          tipo: "llamada_herramienta",
          nombre: j.herramienta,
          args: "args" in j ? j.args : {},
          uso: u,
        };
      }
    } catch {
      /* no es una llamada: texto normal */
    }
    return { tipo: "texto", texto: r.text, uso: u };
  }

  async generarObjeto<T>(p: PeticionObjeto<T>) {
    const r = await generateText({
      model: this.modelo,
      system: p.sistema,
      prompt: p.entrada,
      output: Output.object({ schema: p.esquema }),
    });
    return { objeto: p.esquema.parse(r.output), uso: uso(r.usage) };
  }
}
