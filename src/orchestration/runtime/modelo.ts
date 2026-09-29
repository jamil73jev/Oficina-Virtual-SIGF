import type { z } from "zod";
import type { Alojamiento } from "@/core/datos";

/** Precio simulado por token; el real vendra del Gateway. */
export const PRECIO_TOKEN = 0.000001;

export interface UsoModelo {
  tokens: number;
  costo: number;
}

export interface MensajeModelo {
  rol: "usuario" | "asistente" | "herramienta";
  contenido: string;
  /** Para rol herramienta: herramienta cuya salida (dato no confiable) se incluye. */
  herramienta?: string;
}

export interface HerramientaVisible {
  nombre: string;
  descripcion: string;
}

export interface PeticionTexto {
  sistema: string;
  mensajes: MensajeModelo[];
  herramientas: HerramientaVisible[];
}

export type PasoModelo =
  | { tipo: "texto"; texto: string; uso: UsoModelo }
  | { tipo: "llamada_herramienta"; nombre: string; args: unknown; uso: UsoModelo };

export type PasoSinUso =
  | { tipo: "texto"; texto: string }
  | { tipo: "llamada_herramienta"; nombre: string; args: unknown };

export interface PeticionObjeto<T> {
  sistema: string;
  entrada: string;
  esquema: z.ZodType<T>;
}

/** Puerto del modelo: cambiar al modelo real (AI SDK + Gateway) es cambiar de adaptador. */
export interface ModeloLenguaje {
  readonly id: string;
  /** Donde corre el modelo; la politica de datos decide con esto si puede recibir datos reales. */
  readonly alojamiento: Alojamiento;
  generarTexto(p: PeticionTexto): Promise<PasoModelo>;
  generarObjeto<T>(p: PeticionObjeto<T>): Promise<{ objeto: T; uso: UsoModelo }>;
}

export const estimarTokens = (texto: string): number => Math.ceil(texto.length / 4);

export const usoDe = (entrada: string, salida: string): UsoModelo => {
  const tokens = estimarTokens(entrada) + estimarTokens(salida);
  return { tokens, costo: tokens * PRECIO_TOKEN };
};

export interface GuionSimulado {
  /** Respuesta n-esima (desde 0) de generarTexto. Por defecto: texto determinista. */
  texto?: (p: PeticionTexto, n: number) => PasoSinUso;
  /** Objeto n-esimo de generarObjeto; se valida con el esquema (si es invalido, lanza). */
  objeto?: (p: PeticionObjeto<unknown>, n: number) => unknown;
}

/** Modelo simulado y determinista: sin red, sin claves. */
export class ModeloSimulado implements ModeloLenguaje {
  readonly id = "simulado";
  readonly alojamiento: Alojamiento = "local";
  llamadasTexto = 0;
  llamadasObjeto = 0;
  /** Peticiones recibidas, para asertar aislamiento de contexto en pruebas. */
  readonly peticiones: PeticionTexto[] = [];

  constructor(private readonly guion: GuionSimulado = {}) {}

  async generarTexto(p: PeticionTexto): Promise<PasoModelo> {
    const n = this.llamadasTexto++;
    this.peticiones.push(structuredClone(p));
    const entrada = p.sistema + p.mensajes.map((m) => m.contenido).join("\n");
    const paso: PasoSinUso = this.guion.texto?.(p, n) ?? {
      tipo: "texto",
      texto: `# Resultado\n\n${p.mensajes[0]?.contenido ?? ""}`,
    };
    const salida = paso.tipo === "texto" ? paso.texto : JSON.stringify(paso.args);
    return { ...paso, uso: usoDe(entrada, salida) };
  }

  async generarObjeto<T>(p: PeticionObjeto<T>) {
    const n = this.llamadasObjeto++;
    const bruto = this.guion.objeto ? this.guion.objeto(p as PeticionObjeto<unknown>, n) : {};
    const objeto = p.esquema.parse(bruto);
    return { objeto, uso: usoDe(p.sistema + p.entrada, JSON.stringify(bruto)) };
  }
}
