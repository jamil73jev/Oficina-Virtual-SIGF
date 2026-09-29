import type { z } from "zod";
import type { Agente } from "@/types";
import type { NivelRiesgo } from "../ports";

export interface ContextoHerramienta {
  orgId: string;
  agenteId: string;
  tareaId: string;
}

export interface Herramienta<A> {
  nombre: string;
  descripcion: string;
  /** lectura | escritura_reversible | irreversible (irreversible/costosa exige aprobacion). */
  riesgo: NivelRiesgo;
  entrada: z.ZodType<A>;
  ejecutar(args: A, ctx: ContextoHerramienta): Promise<unknown>;
}

export interface HerramientaRegistrada {
  nombre: string;
  descripcion: string;
  riesgo: NivelRiesgo;
  /** Valida los argumentos (datos del modelo, no confiables) y ejecuta. */
  invocar(
    crudo: unknown,
    ctx: ContextoHerramienta,
  ): Promise<{ ok: true; salida: unknown } | { ok: false; error: string }>;
}

export function definirHerramienta<A>(h: Herramienta<A>): HerramientaRegistrada {
  return {
    nombre: h.nombre,
    descripcion: h.descripcion,
    riesgo: h.riesgo,
    async invocar(crudo, ctx) {
      const r = h.entrada.safeParse(crudo);
      if (!r.success) return { ok: false, error: "argumentos_invalidos" };
      return { ok: true, salida: await h.ejecutar(r.data, ctx) };
    },
  };
}

export class RegistroHerramientas {
  private readonly mapa = new Map<string, HerramientaRegistrada>();

  registrar(h: HerramientaRegistrada): this {
    if (this.mapa.has(h.nombre)) throw new Error(`Herramienta duplicada: ${h.nombre}`);
    this.mapa.set(h.nombre, h);
    return this;
  }

  obtener(nombre: string): HerramientaRegistrada | undefined {
    return this.mapa.get(nombre);
  }

  /** Minimo privilegio: solo lo listado en herramientasPermitidas del agente. */
  permitidasPara(agente: Pick<Agente, "herramientasPermitidas">): HerramientaRegistrada[] {
    return agente.herramientasPermitidas.flatMap((n) => {
      const h = this.mapa.get(n);
      return h ? [h] : [];
    });
  }

  puede(agente: Pick<Agente, "herramientasPermitidas">, nombre: string): boolean {
    return this.mapa.has(nombre) && agente.herramientasPermitidas.includes(nombre);
  }
}

export * from "./sanitizar";
