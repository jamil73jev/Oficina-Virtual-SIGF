import type { EstadoOperacion } from "@/orchestration/traza/eventos";
import type { IdiomaOperacion } from "./plan";

/** Metadatos de una operacion (los eventos viven en el PublicadorTraza). */
export interface RegistroOperacion {
  operacionId: string;
  orgId: string;
  usuarioId: string;
  texto: string;
  idioma: IdiomaOperacion;
  estado: EstadoOperacion;
  creadaEn: string;
}

/** Puerto de persistencia de operaciones (memoria hoy; Postgres en la ola B). Aislado por orgId. */
export interface RepositorioOperaciones {
  crear(registro: RegistroOperacion): Promise<void>;
  /** null si no existe o pertenece a otra organizacion. */
  obtener(orgId: string, operacionId: string): Promise<RegistroOperacion | null>;
  actualizarEstado(orgId: string, operacionId: string, estado: EstadoOperacion): Promise<void>;
}

export class RepositorioOperacionesMemoria implements RepositorioOperaciones {
  private readonly registros = new Map<string, RegistroOperacion>();

  constructor(private readonly maxOperaciones = 1000) {}

  private static clave(orgId: string, operacionId: string) {
    return `${orgId}\u0000${operacionId}`;
  }

  async crear(registro: RegistroOperacion): Promise<void> {
    const clave = RepositorioOperacionesMemoria.clave(registro.orgId, registro.operacionId);
    if (this.registros.has(clave)) throw new Error("Operacion duplicada");
    this.registros.set(clave, { ...registro });
    // Retencion acotada: se descartan primero las operaciones terminadas mas antiguas.
    for (const [k, r] of this.registros) {
      if (this.registros.size <= this.maxOperaciones) break;
      if (r.estado !== "en_curso") this.registros.delete(k);
    }
  }

  async obtener(orgId: string, operacionId: string): Promise<RegistroOperacion | null> {
    const r = this.registros.get(RepositorioOperacionesMemoria.clave(orgId, operacionId));
    return r && r.orgId === orgId ? { ...r } : null;
  }

  async actualizarEstado(orgId: string, operacionId: string, estado: EstadoOperacion): Promise<void> {
    const r = this.registros.get(RepositorioOperacionesMemoria.clave(orgId, operacionId));
    if (!r || r.orgId !== orgId) throw new Error("Operacion inexistente");
    r.estado = estado;
  }
}
