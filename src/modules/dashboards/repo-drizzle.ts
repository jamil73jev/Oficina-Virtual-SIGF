import { and, asc, eq, gte, lte } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos } from "@/core/db";
import { aprobacion, ejecucion, organizacion, presupuesto, tarea } from "@/core/db/schema";
import type { FiltroDashboard } from "./domain";
import type {
  AprobacionDashboard,
  EjecucionDashboard,
  LectorAprobaciones,
  LectorEjecuciones,
  LectorOrganizaciones,
  LectorPresupuestos,
  LectorTareas,
  PresupuestoDashboard,
  TareaDashboard,
} from "./ports";

/**
 * Lectores de los dashboards sobre PostgreSQL (solo lectura). Todo en enTransaccionOrg:
 * rol app_rw + app.org_id (RLS en tarea y ejecucion) ademas del filtro explicito por org.
 */

export class LectorEjecucionesDrizzle implements LectorEjecuciones {
  constructor(private readonly db: BaseDatos) {}

  listar(orgId: string, filtro?: FiltroDashboard): Promise<EjecucionDashboard[]> {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const filas = await tx
        .select({ e: ejecucion, proyectoId: tarea.proyectoId })
        .from(ejecucion)
        .leftJoin(tarea, and(eq(tarea.orgId, ejecucion.orgId), eq(tarea.id, ejecucion.tareaId)))
        .where(
          and(
            eq(ejecucion.orgId, orgId),
            filtro?.agenteId ? eq(ejecucion.agenteId, filtro.agenteId) : undefined,
            filtro?.proyectoId ? eq(tarea.proyectoId, filtro.proyectoId) : undefined,
            filtro?.desde ? gte(ejecucion.creadoEn, new Date(filtro.desde)) : undefined,
            filtro?.hasta ? lte(ejecucion.creadoEn, new Date(filtro.hasta)) : undefined,
          ),
        )
        .orderBy(asc(ejecucion.creadoEn), asc(ejecucion.id));
      return filas
        .filter(({ e }) => !filtro?.periodo || e.creadoEn.toISOString().startsWith(filtro.periodo))
        .map(({ e, proyectoId }) => ({
          id: e.id,
          orgId: e.orgId,
          tareaId: e.tareaId,
          agenteId: e.agenteId,
          modelo: e.modelo,
          tokensIn: e.tokensIn,
          tokensOut: e.tokensOut,
          tokensCache: e.tokensCache,
          costo: e.costo,
          estado: e.estado,
          proyectoId,
          creadoEn: e.creadoEn,
          resumen: e.resumen,
        }));
    });
  }
}

export class LectorPresupuestosDrizzle implements LectorPresupuestos {
  constructor(private readonly db: BaseDatos) {}

  listar(orgId: string, periodo?: string): Promise<PresupuestoDashboard[]> {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(presupuesto)
          .where(and(eq(presupuesto.orgId, orgId), periodo ? eq(presupuesto.periodo, periodo) : undefined))
          .orderBy(asc(presupuesto.id))
      ).map((f) => ({
        id: f.id,
        orgId: f.orgId,
        ambito: f.ambito,
        refId: f.refId,
        topeTokens: f.topeTokens,
        topeCosto: f.topeCosto,
        topeIteraciones: f.topeIteraciones,
        consumido: { tokens: f.consumidoTokens, costo: f.consumidoCosto, iteraciones: f.consumidoIteraciones },
        periodo: f.periodo,
      })),
    );
  }
}

export class LectorTareasDrizzle implements LectorTareas {
  constructor(private readonly db: BaseDatos) {}

  listar(orgId: string, proyectoId?: string): Promise<TareaDashboard[]> {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(tarea)
          .where(and(eq(tarea.orgId, orgId), proyectoId ? eq(tarea.proyectoId, proyectoId) : undefined))
          .orderBy(asc(tarea.id))
      ).map((f) => ({
        id: f.id,
        orgId: f.orgId,
        proyectoId: f.proyectoId,
        agenteId: f.agenteId,
        estado: f.estado,
        criteriosVerificacion: [...f.criteriosVerificacion],
        deps: [...f.deps],
      })),
    );
  }
}

export class LectorAprobacionesDrizzle implements LectorAprobaciones {
  constructor(private readonly db: BaseDatos) {}

  listar(orgId: string): Promise<AprobacionDashboard[]> {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx.select().from(aprobacion).where(eq(aprobacion.orgId, orgId)).orderBy(asc(aprobacion.expiraEn), asc(aprobacion.id))
      ).map((f) => ({
        id: f.id,
        orgId: f.orgId,
        ejecucionId: f.ejecucionId,
        tipo: f.tipo,
        riesgo: f.riesgo,
        estado: f.estado,
        decididoPor: f.decididoPor,
        decididoEn: f.decididoEn,
        expiraEn: f.expiraEn,
      })),
    );
  }
}

export class LectorOrganizacionesDrizzle implements LectorOrganizaciones {
  constructor(private readonly db: BaseDatos) {}

  obtener(orgId: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx.select().from(organizacion).where(eq(organizacion.id, orgId));
      return f ? { ...f } : null;
    });
  }
}
