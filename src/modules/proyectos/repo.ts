import type { ProyectoRegistro, TareaRegistro } from "./domain";

/** Repositorio inyectable. Toda operacion exige orgId: aislamiento estricto. */
export interface ProyectosRepo {
  crearProyecto(p: ProyectoRegistro): Promise<void>;
  obtenerProyecto(orgId: string, id: string): Promise<ProyectoRegistro | null>;
  listarProyectos(orgId: string): Promise<ProyectoRegistro[]>;
  crearTarea(t: TareaRegistro): Promise<void>;
  obtenerTarea(orgId: string, id: string): Promise<TareaRegistro | null>;
  listarTareas(orgId: string, proyectoId: string): Promise<TareaRegistro[]>;
  /** Reemplaza una tarea existente de la org. False si no existe. */
  guardarTarea(t: TareaRegistro): Promise<boolean>;
}

const clonar = <T>(v: T): T => structuredClone(v);

export class ProyectosMemoriaRepo implements ProyectosRepo {
  private readonly proyectos = new Map<string, Map<string, ProyectoRegistro>>();
  private readonly tareas = new Map<string, Map<string, TareaRegistro>>();

  async crearProyecto(p: ProyectoRegistro) {
    const m = this.proyectos.get(p.orgId) ?? new Map();
    if (m.has(p.id)) throw new Error("Proyecto duplicado");
    m.set(p.id, clonar(p));
    this.proyectos.set(p.orgId, m);
  }

  async obtenerProyecto(orgId: string, id: string) {
    const p = this.proyectos.get(orgId)?.get(id);
    return p ? clonar(p) : null;
  }

  async listarProyectos(orgId: string) {
    return [...(this.proyectos.get(orgId)?.values() ?? [])].map(clonar);
  }

  async crearTarea(t: TareaRegistro) {
    const m = this.tareas.get(t.orgId) ?? new Map();
    if (m.has(t.id)) throw new Error("Tarea duplicada");
    m.set(t.id, clonar(t));
    this.tareas.set(t.orgId, m);
  }

  async obtenerTarea(orgId: string, id: string) {
    const t = this.tareas.get(orgId)?.get(id);
    return t ? clonar(t) : null;
  }

  async listarTareas(orgId: string, proyectoId: string) {
    return [...(this.tareas.get(orgId)?.values() ?? [])]
      .filter((t) => t.proyectoId === proyectoId)
      .map(clonar);
  }

  async guardarTarea(t: TareaRegistro) {
    const m = this.tareas.get(t.orgId);
    if (!m?.has(t.id)) return false;
    m.set(t.id, clonar(t));
    return true;
  }
}
