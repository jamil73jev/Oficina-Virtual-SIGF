import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos } from "@/core/db";
import { artefacto, ejecucion, tarea } from "@/core/db/schema";
import type { AlmacenArtefactos, NuevoArtefacto, RepositorioTareas, TareaOrq } from "@/orchestration/ports";
import type { Ejecucion } from "@/types";
import type { CambiosEjecucion, RepositorioEjecuciones } from "./repos";

type FilaEjecucion = typeof ejecucion.$inferSelect;
type FilaTarea = typeof tarea.$inferSelect;

const aEjecucion = (f: FilaEjecucion): Ejecucion => ({
  id: f.id,
  orgId: f.orgId,
  tareaId: f.tareaId,
  agenteId: f.agenteId,
  padreEjecucionId: f.padreEjecucionId,
  workflowRunId: f.workflowRunId,
  modelo: f.modelo,
  tokensIn: f.tokensIn,
  tokensOut: f.tokensOut,
  tokensCache: f.tokensCache,
  costo: f.costo,
  estado: f.estado,
  resumen: f.resumen,
});

/**
 * Ejecuciones de los agentes de area en PostgreSQL (arbol orquestador -> subagentes).
 * enTransaccionOrg: rol app_rw + app.org_id, RLS por organizacion.
 */
export class RepositorioEjecucionesDrizzle implements RepositorioEjecuciones {
  constructor(private readonly db: BaseDatos) {}

  async crear(e: Ejecucion) {
    // PK duplicada => error de unicidad, igual que "Ejecucion duplicada" en memoria.
    await enTransaccionOrg(this.db, e.orgId, (tx) => tx.insert(ejecucion).values({ ...e }));
  }

  obtener(orgId: string, id: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx.select().from(ejecucion).where(and(eq(ejecucion.orgId, orgId), eq(ejecucion.id, id)));
      return f ? aEjecucion(f) : null;
    });
  }

  actualizar(orgId: string, id: string, cambios: CambiosEjecucion) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const where = and(eq(ejecucion.orgId, orgId), eq(ejecucion.id, id));
      const hayCambios = Object.values(cambios).some((v) => v !== undefined);
      const [f] = hayCambios
        ? await tx.update(ejecucion).set(cambios).where(where).returning()
        : await tx.select().from(ejecucion).where(where);
      if (!f) throw new Error("Ejecucion no encontrada");
      return aEjecucion(f);
    });
  }

  listar(orgId: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(ejecucion)
          .where(eq(ejecucion.orgId, orgId))
          .orderBy(asc(ejecucion.creadoEn), asc(ejecucion.id))
      ).map(aEjecucion),
    );
  }
}

const aTareaOrq = (f: FilaTarea): TareaOrq => ({
  id: f.id,
  orgId: f.orgId,
  proyectoId: f.proyectoId,
  padreId: f.padreId,
  agenteId: f.agenteId,
  estado: f.estado,
  criteriosVerificacion: [...f.criteriosVerificacion],
  deps: [...f.deps],
  titulo: f.titulo,
  descripcion: f.descripcion,
  rolAgente: f.rolAgente ?? "",
});

const columnasTareaOrq = (t: TareaOrq) => ({
  proyectoId: t.proyectoId,
  padreId: t.padreId,
  agenteId: t.agenteId,
  estado: t.estado,
  criteriosVerificacion: t.criteriosVerificacion,
  deps: t.deps,
  titulo: t.titulo,
  descripcion: t.descripcion,
  rolAgente: t.rolAgente,
});

/** Tareas del orquestador (TareaOrq) en la tabla `tarea`, con titulo, descripcion y rol. */
export class RepositorioTareasDrizzle implements RepositorioTareas {
  constructor(private readonly db: BaseDatos) {}

  async crear(tareas: TareaOrq[]) {
    const porOrg = new Map<string, TareaOrq[]>();
    for (const t of tareas) porOrg.set(t.orgId, [...(porOrg.get(t.orgId) ?? []), t]);
    for (const [orgId, lote] of porOrg) {
      await enTransaccionOrg(this.db, orgId, async (tx) => {
        // Alta o reemplazo, como en memoria. Bajo RLS no puede reemplazar una tarea ajena.
        for (const t of lote) {
          await tx
            .insert(tarea)
            .values({ id: t.id, orgId: t.orgId, ...columnasTareaOrq(t) })
            .onConflictDoUpdate({ target: tarea.id, set: columnasTareaOrq(t) });
        }
      });
    }
  }

  obtener(orgId: string, id: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx.select().from(tarea).where(and(eq(tarea.orgId, orgId), eq(tarea.id, id)));
      return f ? aTareaOrq(f) : null;
    });
  }

  actualizar(orgId: string, id: string, cambios: Partial<Pick<TareaOrq, "estado" | "agenteId">>) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const where = and(eq(tarea.orgId, orgId), eq(tarea.id, id));
      const hayCambios = Object.values(cambios).some((v) => v !== undefined);
      const [f] = hayCambios
        ? await tx.update(tarea).set(cambios).where(where).returning()
        : await tx.select().from(tarea).where(where);
      if (!f) throw new Error("Tarea no encontrada");
      return aTareaOrq(f);
    });
  }

  listarPorProyecto(orgId: string, proyectoId: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(tarea)
          .where(and(eq(tarea.orgId, orgId), eq(tarea.proyectoId, proyectoId)))
          .orderBy(asc(tarea.id))
      ).map(aTareaOrq),
    );
  }
}

/** Artefactos de texto por referencia (misma forma de ref que AlmacenArtefactosMemoria). */
export class AlmacenArtefactosDrizzle implements AlmacenArtefactos {
  constructor(private readonly db: BaseDatos) {}

  async guardar(a: NuevoArtefacto) {
    const hash = createHash("sha256").update(a.contenido).digest("hex").slice(0, 16);
    const ref = `artefacto://${a.orgId}/${a.tareaId}/${hash}`;
    await enTransaccionOrg(this.db, a.orgId, (tx) =>
      tx
        .insert(artefacto)
        .values({ orgId: a.orgId, ref, proyectoId: a.proyectoId, tareaId: a.tareaId, tipo: a.tipo, contenido: a.contenido })
        // Direccionado por contenido: la misma ref es el mismo contenido.
        .onConflictDoNothing({ target: [artefacto.orgId, artefacto.ref] }),
    );
    return ref;
  }

  async leer(orgId: string, ref: string) {
    if (!ref.startsWith(`artefacto://${orgId}/`)) return null;
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx
        .select({ contenido: artefacto.contenido })
        .from(artefacto)
        .where(and(eq(artefacto.orgId, orgId), eq(artefacto.ref, ref)));
      return f?.contenido ?? null;
    });
  }
}
