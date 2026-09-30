import type { RolUsuario } from "@/core/rbac";

/** Membresia de un usuario (id de Supabase Auth = usuario.id) en una organizacion. */
export interface Membresia {
  usuarioId: string;
  orgId: string;
  rol: RolUsuario;
}

/** Puerto de lectura de membresias. Solo lectura: las altas las hace scripts/alta-organizacion.mjs. */
export interface MembresiasRepo {
  /** Membresias del usuario, ordenadas por orgId (orden estable). */
  listarPorUsuario(usuarioId: string): Promise<Membresia[]>;
}

const porOrg = (a: Membresia, b: Membresia) => (a.orgId < b.orgId ? -1 : a.orgId > b.orgId ? 1 : 0);

export class MembresiasMemoriaRepo implements MembresiasRepo {
  private readonly membresias: Membresia[];

  constructor(membresias: readonly Membresia[] = []) {
    this.membresias = membresias.map((m) => ({ ...m }));
  }

  async listarPorUsuario(usuarioId: string): Promise<Membresia[]> {
    return this.membresias
      .filter((m) => m.usuarioId === usuarioId)
      .map((m) => ({ ...m }))
      .sort(porOrg);
  }
}

/**
 * Membresia activa: con una sola, esa. Con varias se elige la primera por orgId (orden
 * estable y determinista). LIMITACION: no hay selector de organizacion activa todavia.
 */
export function membresiaActiva(membresias: readonly Membresia[]): Membresia | null {
  return [...membresias].sort(porOrg)[0] ?? null;
}
