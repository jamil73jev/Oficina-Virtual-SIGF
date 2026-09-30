import { and, asc, eq } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos } from "@/core/db";
import { proyecto, tarea } from "@/core/db/schema";
import type { ProyectoRegistro, TareaRegistro } from "./domain";
import type { ProyectosRepo } from "./repo";

type FilaProyecto = typeof proyecto.$inferSelect;
type FilaTarea = typeof tarea.$inferSelect;

const aProyecto = (f: FilaProyecto): ProyectoRegistro => ({
  id: f.id,
  orgId: f.orgId,
  objetivo: f.objetivo,
  estado: f.estado,
  presupuestoId: f.presupuestoId,
  ownerId: f.ownerId,
});

const aTarea = (f: FilaTarea): TareaRegistro => ({
  id: f.id,
  orgId: f.orgId,
  proyectoId: f.proyectoId,
  padreId: f.padreId,
  agenteId: f.agenteId,
  estado: f.estado,
  criteriosVerificacion: [...f.criteriosVerificacion],
  deps: [...f.deps],
});

const columnasTarea = (t: TareaRegistro) => ({
  proyectoId: t.proyectoId,
  padreId: t.padreId,
  agenteId: t.agenteId,
  estado: t.estado,
  criteriosVerificacion: t.criteriosVerificacion,
  deps: t.deps,
});

/**
 * Proyectos y tareas del tablero en PostgreSQL. Cada operacion corre en enTransaccionOrg
 * (rol app_rw + app.org_id): RLS aisla por organizacion ademas del filtro explicito.
 */
export class ProyectosDrizzleRepo implements ProyectosRepo {
  constructor(private readonly db: BaseDatos) {}

  async crearProyecto(p: ProyectoRegistro) {
    await enTransaccionOrg(this.db, p.orgId, (tx) =>
      tx.insert(proyecto).values({
        id: p.id,
        orgId: p.orgId,
        objetivo: p.objetivo,
        estado: p.estado,
        presupuestoId: p.presupuestoId,
        ownerId: p.ownerId,
      }),
    );
  }

  obtenerProyecto(orgId: string, id: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx
        .select()
        .from(proyecto)
        .where(and(eq(proyecto.orgId, orgId), eq(proyecto.id, id)));
      return f ? aProyecto(f) : null;
    });
  }

  listarProyectos(orgId: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (await tx.select().from(proyecto).where(eq(proyecto.orgId, orgId)).orderBy(asc(proyecto.id))).map(
        aProyecto,
      ),
    );
  }

  async crearTarea(t: TareaRegistro) {
    await enTransaccionOrg(this.db, t.orgId, (tx) =>
      tx.insert(tarea).values({ id: t.id, orgId: t.orgId, ...columnasTarea(t) }),
    );
  }

  obtenerTarea(orgId: string, id: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx.select().from(tarea).where(and(eq(tarea.orgId, orgId), eq(tarea.id, id)));
      return f ? aTarea(f) : null;
    });
  }

  listarTareas(orgId: string, proyectoId: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(tarea)
          .where(and(eq(tarea.orgId, orgId), eq(tarea.proyectoId, proyectoId)))
          .orderBy(asc(tarea.id))
      ).map(aTarea),
    );
  }

  guardarTarea(t: TareaRegistro) {
    return enTransaccionOrg(this.db, t.orgId, async (tx) => {
      const filas = await tx
        .update(tarea)
        .set(columnasTarea(t))
        .where(and(eq(tarea.orgId, t.orgId), eq(tarea.id, t.id)))
        .returning({ id: tarea.id });
      return filas.length > 0;
    });
  }
}
