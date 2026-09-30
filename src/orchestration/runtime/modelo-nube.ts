import { createGateway } from "ai";
import { ModeloAiSdk } from "./ai-sdk";
import { ModeloSimulado, type ModeloLenguaje, type PeticionObjeto, type PeticionTexto } from "./modelo";

export class ModeloNubeConfiguracionError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ModeloNubeConfiguracionError";
  }
}

export class ModeloNubeAgotadoError extends Error {
  constructor(readonly intentos: number, readonly causa: unknown) {
    super(`AI Gateway no respondio tras ${intentos} intentos`);
    this.name = "ModeloNubeAgotadoError";
  }
}

export interface OpcionesModeloNube {
  intentos?: number;
  timeoutMs?: number;
  esperaMs?: number;
  esperar?: (ms: number) => Promise<void>;
  respaldo?: ModeloLenguaje;
}

const aviso = "[AVISO: se uso el respaldo simulado; no es una respuesta del modelo de nube]";

function codigoHttp(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidato = error as { statusCode?: unknown; status?: unknown; isRetryable?: unknown };
  return typeof candidato.statusCode === "number"
    ? candidato.statusCode
    : typeof candidato.status === "number" ? candidato.status : undefined;
}

function esTransitorio(error: unknown): boolean {
  if (error && typeof error === "object" && (error as { isRetryable?: unknown }).isRetryable === true) return true;
  const codigo = codigoHttp(error);
  return codigo === 429 || (codigo !== undefined && codigo >= 500);
}

export class ModeloNubeResiliente implements ModeloLenguaje {
  readonly alojamiento = "nube" as const;
  readonly id: string;
  private readonly intentos: number;
  private readonly timeoutMs: number;
  private readonly esperaMs: number;
  private readonly esperar: (ms: number) => Promise<void>;

  constructor(private readonly principal: ModeloLenguaje, private readonly opciones: OpcionesModeloNube = {}) {
    this.id = principal.id;
    this.intentos = opciones.intentos ?? 3;
    this.timeoutMs = opciones.timeoutMs ?? 30_000;
    this.esperaMs = opciones.esperaMs ?? 250;
    this.esperar = opciones.esperar ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  generarTexto(p: PeticionTexto) {
    return this.ejecutar(() => this.principal.generarTexto(p), async () => {
      const paso = await this.opciones.respaldo!.generarTexto(p);
      return paso.tipo === "texto" ? { ...paso, texto: `${aviso}\n\n${paso.texto}` } : paso;
    });
  }

  generarObjeto<T>(p: PeticionObjeto<T>) {
    return this.ejecutar(() => this.principal.generarObjeto(p), () => this.opciones.respaldo!.generarObjeto(p));
  }

  private async ejecutar<T>(principal: () => Promise<T>, respaldo: () => Promise<T>): Promise<T> {
    let ultima: unknown;
    for (let intento = 1; intento <= this.intentos; intento++) {
      try {
        return await this.conTiempoMaximo(principal());
      } catch (error) {
        ultima = error;
        if (!esTransitorio(error) || intento === this.intentos) break;
        await this.esperar(this.esperaMs * intento);
      }
    }
    if (this.opciones.respaldo) return respaldo();
    throw new ModeloNubeAgotadoError(this.intentos, ultima);
  }

  private async conTiempoMaximo<T>(promesa: Promise<T>): Promise<T> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promesa,
        new Promise<never>((_resolve, reject) => {
          temporizador = setTimeout(
            () => reject(Object.assign(new Error("AI Gateway excedio el tiempo maximo"), { isRetryable: true })),
            this.timeoutMs,
          );
          temporizador.unref?.();
        }),
      ]);
    } finally {
      if (temporizador) clearTimeout(temporizador);
    }
  }
}

export function crearModeloGateway(
  idModelo: string,
  env: Record<string, string | undefined>,
  opciones: OpcionesModeloNube = {},
): ModeloNubeResiliente {
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(idModelo)) {
    throw new ModeloNubeConfiguracionError(`MODELO gateway invalido: ${idModelo}`);
  }
  const credencial = env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim();
  if (!credencial) {
    throw new ModeloNubeConfiguracionError("AI Gateway requiere AI_GATEWAY_API_KEY o VERCEL_OIDC_TOKEN");
  }
  const proveedor = createGateway({ apiKey: credencial });
  const base = new ModeloAiSdk(proveedor(idModelo), `gateway:${idModelo}`, "nube", 0);
  if (env.MODELO_RESPALDO !== undefined && env.MODELO_RESPALDO !== "simulado") {
    throw new ModeloNubeConfiguracionError("MODELO_RESPALDO solo admite el valor simulado");
  }
  const respaldo = env.MODELO_RESPALDO === "simulado" ? new ModeloSimulado() : undefined;
  return new ModeloNubeResiliente(base, { ...opciones, respaldo: opciones.respaldo ?? respaldo });
}
