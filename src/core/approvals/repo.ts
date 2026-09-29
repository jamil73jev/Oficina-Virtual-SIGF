import type { z } from "zod";
import type { Aprobacion } from "@/types";

export type AprobacionRegistro = z.infer<typeof Aprobacion>;

/** Repositorio inyectable. Toda operacion exige orgId: aislamiento estricto. */
export interface AprobacionesRepo {
  crear(registro: AprobacionRegistro): Promise<void>;
  obtener(orgId: string, id: string): Promise<AprobacionRegistro | null>;
  listar(orgId: string): Promise<AprobacionRegistro[]>;
  /**
   * Compare-and-set: aplica el parche solo si el estado actual es "pendiente".
   * Devuelve null si no existe en la org o ya no estaba pendiente.
   */
  resolverSiPendiente(
    orgId: string,
    id: string,
    parche: Pick<AprobacionRegistro, "estado" | "decididoPor" | "decididoEn">,
  ): Promise<AprobacionRegistro | null>;
}

const clonar = <T>(v: T): T => structuredClone(v);

export class AprobacionesMemoriaRepo implements AprobacionesRepo {
  private readonly porOrg = new Map<string, Map<string, AprobacionRegistro>>();

  async crear(registro: AprobacionRegistro) {
    const m = this.porOrg.get(registro.orgId) ?? new Map();
    if (m.has(registro.id)) throw new Error("Aprobacion duplicada");
    m.set(registro.id, clonar(registro));
    this.porOrg.set(registro.orgId, m);
  }

  async obtener(orgId: string, id: string) {
    const r = this.porOrg.get(orgId)?.get(id);
    return r ? clonar(r) : null;
  }

  async listar(orgId: string) {
    return [...(this.porOrg.get(orgId)?.values() ?? [])].map(clonar);
  }

  async resolverSiPendiente(
    orgId: string,
    id: string,
    parche: Pick<AprobacionRegistro, "estado" | "decididoPor" | "decididoEn">,
  ) {
    const r = this.porOrg.get(orgId)?.get(id);
    if (!r || r.estado !== "pendiente") return null;
    Object.assign(r, parche);
    return clonar(r);
  }
}
