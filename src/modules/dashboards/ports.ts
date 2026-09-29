import type { z } from "zod";
import type {
  AmbitoPresupuesto,
  EstadoAprobacion,
  EstadoEjecucion,
  EstadoTarea,
  Organizacion,
  Riesgo,
} from "@/types";
import type { FiltroDashboard } from "./domain";

export type AmbitoPresupuestoTipo = z.infer<typeof AmbitoPresupuesto>;
export type EstadoAprobacionTipo = z.infer<typeof EstadoAprobacion>;
export type EstadoEjecucionTipo = z.infer<typeof EstadoEjecucion>;
export type EstadoTareaTipo = z.infer<typeof EstadoTarea>;
export type RiesgoTipo = z.infer<typeof Riesgo>;

export interface EjecucionDashboard {
  id: string;
  orgId: string;
  tareaId: string;
  agenteId: string;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
  costo: number;
  estado: EstadoEjecucionTipo;
  proyectoId?: string | null;
  creadoEn?: Date | string | null;
  periodo?: string | null;
  resumen?: string | null;
}

export interface PresupuestoDashboard {
  id: string;
  orgId: string;
  ambito: AmbitoPresupuestoTipo;
  refId: string;
  topeTokens: number;
  topeCosto: number;
  topeIteraciones: number;
  consumido: {
    tokens: number;
    costo: number;
    iteraciones: number;
  };
  periodo: string;
}

export interface TareaDashboard {
  id: string;
  orgId: string;
  proyectoId: string;
  agenteId: string | null;
  estado: EstadoTareaTipo;
  criteriosVerificacion?: string[];
  deps?: string[];
}

export interface AprobacionDashboard {
  id: string;
  orgId: string;
  ejecucionId: string;
  tipo: string;
  riesgo: RiesgoTipo;
  estado: EstadoAprobacionTipo;
  decididoPor?: string | null;
  decididoEn?: Date | string | null;
  expiraEn?: Date | string;
}

export interface LectorEjecuciones {
  listar(orgId: string, filtro?: FiltroDashboard): Promise<EjecucionDashboard[]>;
}

export interface LectorPresupuestos {
  listar(orgId: string, periodo?: string): Promise<PresupuestoDashboard[]>;
}

export interface LectorTareas {
  listar(orgId: string, proyectoId?: string): Promise<TareaDashboard[]>;
}

export interface LectorAprobaciones {
  listar(orgId: string): Promise<AprobacionDashboard[]>;
}

export interface LectorOrganizaciones {
  obtener(orgId: string): Promise<Organizacion | null>;
}

const clonar = <T>(v: T): T => structuredClone(v);

export class EjecucionesMemoriaRepo implements LectorEjecuciones {
  private readonly porOrg = new Map<string, EjecucionDashboard[]>();

  agregar(e: EjecucionDashboard): void {
    const lista = this.porOrg.get(e.orgId) ?? [];
    lista.push(clonar(e));
    this.porOrg.set(e.orgId, lista);
  }

  definir(orgId: string, ejecuciones: EjecucionDashboard[]): void {
    this.porOrg.set(orgId, ejecuciones.map(clonar));
  }

  async listar(orgId: string, filtro?: FiltroDashboard): Promise<EjecucionDashboard[]> {
    const lista = this.porOrg.get(orgId) ?? [];
    return lista
      .filter((e) => {
        if (filtro?.proyectoId && e.proyectoId && e.proyectoId !== filtro.proyectoId) {
          return false;
        }
        if (filtro?.agenteId && e.agenteId !== filtro.agenteId) {
          return false;
        }
        if (filtro?.periodo) {
          if (e.periodo) {
            if (e.periodo !== filtro.periodo) return false;
          } else if (e.creadoEn) {
            const strFecha = new Date(e.creadoEn).toISOString();
            if (!strFecha.startsWith(filtro.periodo)) return false;
          }
        }
        if (filtro?.desde && e.creadoEn) {
          if (new Date(e.creadoEn).getTime() < new Date(filtro.desde).getTime()) return false;
        }
        if (filtro?.hasta && e.creadoEn) {
          if (new Date(e.creadoEn).getTime() > new Date(filtro.hasta).getTime()) return false;
        }
        return true;
      })
      .map(clonar);
  }
}

export class PresupuestosMemoriaRepo implements LectorPresupuestos {
  private readonly porOrg = new Map<string, PresupuestoDashboard[]>();

  agregar(p: PresupuestoDashboard): void {
    const lista = this.porOrg.get(p.orgId) ?? [];
    lista.push(clonar(p));
    this.porOrg.set(p.orgId, lista);
  }

  definir(orgId: string, presupuestos: PresupuestoDashboard[]): void {
    this.porOrg.set(orgId, presupuestos.map(clonar));
  }

  async listar(orgId: string, periodo?: string): Promise<PresupuestoDashboard[]> {
    const lista = this.porOrg.get(orgId) ?? [];
    if (!periodo) return lista.map(clonar);
    return lista.filter((p) => p.periodo === periodo).map(clonar);
  }
}

export class TareasMemoriaRepo implements LectorTareas {
  private readonly porOrg = new Map<string, TareaDashboard[]>();

  agregar(t: TareaDashboard): void {
    const lista = this.porOrg.get(t.orgId) ?? [];
    lista.push(clonar(t));
    this.porOrg.set(t.orgId, lista);
  }

  definir(orgId: string, tareas: TareaDashboard[]): void {
    this.porOrg.set(orgId, tareas.map(clonar));
  }

  async listar(orgId: string, proyectoId?: string): Promise<TareaDashboard[]> {
    const lista = this.porOrg.get(orgId) ?? [];
    if (!proyectoId) return lista.map(clonar);
    return lista.filter((t) => t.proyectoId === proyectoId).map(clonar);
  }
}

export class AprobacionesMemoriaRepoDashboards implements LectorAprobaciones {
  private readonly porOrg = new Map<string, AprobacionDashboard[]>();

  agregar(a: AprobacionDashboard): void {
    const lista = this.porOrg.get(a.orgId) ?? [];
    lista.push(clonar(a));
    this.porOrg.set(a.orgId, lista);
  }

  definir(orgId: string, aprobaciones: AprobacionDashboard[]): void {
    this.porOrg.set(orgId, aprobaciones.map(clonar));
  }

  async listar(orgId: string): Promise<AprobacionDashboard[]> {
    const lista = this.porOrg.get(orgId) ?? [];
    return lista.map(clonar);
  }
}

export class OrganizacionesMemoriaRepo implements LectorOrganizaciones {
  private readonly orgs = new Map<string, Organizacion>();

  definir(org: Organizacion): void {
    this.orgs.set(org.id, clonar(org));
  }

  async obtener(orgId: string): Promise<Organizacion | null> {
    const org = this.orgs.get(orgId);
    return org ? clonar(org) : null;
  }
}
