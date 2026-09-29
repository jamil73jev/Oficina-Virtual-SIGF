import { and, asc, eq } from "drizzle-orm";
import type { BaseDatos } from "@/core/db";
import { aprobacion } from "@/core/db/schema";
import type { AprobacionRegistro, AprobacionesRepo } from "./repo";

type Fila = typeof aprobacion.$inferSelect;

const aRegistro = (f: Fila): AprobacionRegistro => ({
  id: f.id,
  orgId: f.orgId,
  ejecucionId: f.ejecucionId,
  tipo: f.tipo,
  payload: f.payload as AprobacionRegistro["payload"],
  riesgo: f.riesgo,
  estado: f.estado,
  decididoPor: f.decididoPor,
  decididoEn: f.decididoEn,
  expiraEn: f.expiraEn,
});

/** Aprobaciones en PostgreSQL. Toda consulta filtra por org_id (aislamiento estricto). */
export class AprobacionesDrizzleRepo implements AprobacionesRepo {
  constructor(private readonly db: BaseDatos) {}

  async crear(r: AprobacionRegistro) {
    // PK duplicada => error de unicidad, igual que "Aprobacion duplicada" en memoria.
    await this.db.insert(aprobacion).values({
      id: r.id,
      orgId: r.orgId,
      ejecucionId: r.ejecucionId,
      tipo: r.tipo,
      payload: r.payload,
      riesgo: r.riesgo,
      estado: r.estado,
      decididoPor: r.decididoPor,
      decididoEn: r.decididoEn,
      expiraEn: r.expiraEn,
    });
  }

  async obtener(orgId: string, id: string) {
    const [f] = await this.db
      .select()
      .from(aprobacion)
      .where(and(eq(aprobacion.orgId, orgId), eq(aprobacion.id, id)));
    return f ? aRegistro(f) : null;
  }

  async listar(orgId: string) {
    const filas = await this.db
      .select()
      .from(aprobacion)
      .where(eq(aprobacion.orgId, orgId))
      .orderBy(asc(aprobacion.expiraEn), asc(aprobacion.id));
    return filas.map(aRegistro);
  }

  /**
   * Compare-and-set en una sola sentencia: `UPDATE ... WHERE estado = 'pendiente'`.
   * Ante decisiones concurrentes Postgres re-evalua el WHERE tras el bloqueo de fila,
   * asi que solo una actualiza y el resto recibe 0 filas (null).
   */
  async resolverSiPendiente(
    orgId: string,
    id: string,
    parche: Pick<AprobacionRegistro, "estado" | "decididoPor" | "decididoEn">,
  ) {
    const [f] = await this.db
      .update(aprobacion)
      .set({
        estado: parche.estado,
        decididoPor: parche.decididoPor,
        decididoEn: parche.decididoEn,
      })
      .where(
        and(
          eq(aprobacion.orgId, orgId),
          eq(aprobacion.id, id),
          eq(aprobacion.estado, "pendiente"),
        ),
      )
      .returning();
    return f ? aRegistro(f) : null;
  }
}
