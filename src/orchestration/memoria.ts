import { createHash } from "node:crypto";
import type {
  AlmacenArtefactos,
  NuevoArtefacto,
  RepositorioTareas,
  TareaOrq,
} from "./ports";

/** Implementaciones en memoria (desarrollo y pruebas). */
export class RepositorioTareasMemoria implements RepositorioTareas {
  private readonly tareas = new Map<string, TareaOrq>();

  async crear(tareas: TareaOrq[]) {
    for (const t of tareas) this.tareas.set(t.id, structuredClone(t));
  }

  async obtener(orgId: string, id: string) {
    const t = this.tareas.get(id);
    return t && t.orgId === orgId ? structuredClone(t) : null;
  }

  async actualizar(
    orgId: string,
    id: string,
    cambios: Partial<Pick<TareaOrq, "estado" | "agenteId">>,
  ) {
    const t = await this.obtener(orgId, id);
    if (!t) throw new Error("Tarea no encontrada");
    const nueva = { ...t, ...cambios };
    this.tareas.set(id, structuredClone(nueva));
    return nueva;
  }

  async listarPorProyecto(orgId: string, proyectoId: string) {
    return [...this.tareas.values()]
      .filter((t) => t.orgId === orgId && t.proyectoId === proyectoId)
      .map((t) => structuredClone(t));
  }
}

export class AlmacenArtefactosMemoria implements AlmacenArtefactos {
  private readonly datos = new Map<string, string>();

  async guardar(a: NuevoArtefacto) {
    const hash = createHash("sha256").update(a.contenido).digest("hex").slice(0, 16);
    const ref = `artefacto://${a.orgId}/${a.tareaId}/${hash}`;
    this.datos.set(ref, a.contenido);
    return ref;
  }

  async leer(orgId: string, ref: string) {
    if (!ref.startsWith(`artefacto://${orgId}/`)) return null;
    return this.datos.get(ref) ?? null;
  }
}
