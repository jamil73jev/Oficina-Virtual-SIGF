import type { Ejecucion } from "@/types";

export type CambiosEjecucion = Partial<
  Pick<Ejecucion, "estado" | "resumen" | "tokensIn" | "tokensOut" | "tokensCache" | "costo">
>;

export interface RepositorioEjecuciones {
  crear(e: Ejecucion): Promise<void>;
  obtener(orgId: string, id: string): Promise<Ejecucion | null>;
  actualizar(orgId: string, id: string, cambios: CambiosEjecucion): Promise<Ejecucion>;
  listar(orgId: string): Promise<Ejecucion[]>;
}

/** Implementacion en memoria (desarrollo y pruebas). */
export class RepositorioEjecucionesMemoria implements RepositorioEjecuciones {
  private readonly datos = new Map<string, Ejecucion>();

  async crear(e: Ejecucion) {
    if (this.datos.has(e.id)) throw new Error("Ejecucion duplicada");
    this.datos.set(e.id, structuredClone(e));
  }

  async obtener(orgId: string, id: string) {
    const e = this.datos.get(id);
    return e && e.orgId === orgId ? structuredClone(e) : null;
  }

  async actualizar(orgId: string, id: string, cambios: CambiosEjecucion) {
    const e = await this.obtener(orgId, id);
    if (!e) throw new Error("Ejecucion no encontrada");
    const nueva = { ...e, ...cambios };
    this.datos.set(id, structuredClone(nueva));
    return nueva;
  }

  async listar(orgId: string) {
    return [...this.datos.values()].filter((e) => e.orgId === orgId).map((e) => structuredClone(e));
  }
}
