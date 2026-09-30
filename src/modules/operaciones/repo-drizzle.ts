import { and, eq } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos } from "@/core/db";
import { operacion } from "@/core/db/schema";
import type { EstadoOperacion } from "@/orchestration/traza/eventos";
import type { IdiomaOperacion } from "./plan";
import type { RegistroOperacion, RepositorioOperaciones } from "./repo";

type Fila = typeof operacion.$inferSelect;

const aRegistro = (f: Fila): RegistroOperacion => ({
  operacionId: f.id,
  orgId: f.orgId,
  usuarioId: f.usuarioId,
  texto: f.texto,
  idioma: f.idioma as IdiomaOperacion,
  estado: f.estado as EstadoOperacion,
  creadaEn: f.creadaEn.toISOString(),
});

/**
 * Operaciones en PostgreSQL (enTransaccionOrg: rol app_rw + app.org_id, RLS). La retencion
 * no descarta operaciones en curso: la purga de la traza es por antiguedad
 * (purgarEventosAntiguos en src/orchestration/traza/postgres.ts).
 */
export class RepositorioOperacionesDrizzle implements RepositorioOperaciones {
  constructor(private readonly db: BaseDatos) {}

  async crear(r: RegistroOperacion): Promise<void> {
    // PK duplicada => error de unicidad, igual que "Operacion duplicada" en memoria.
    await enTransaccionOrg(this.db, r.orgId, (tx) =>
      tx.insert(operacion).values({
        id: r.operacionId,
        orgId: r.orgId,
        usuarioId: r.usuarioId,
        texto: r.texto,
        idioma: r.idioma,
        estado: r.estado,
        creadaEn: new Date(r.creadaEn),
      }),
    );
  }

  obtener(orgId: string, operacionId: string): Promise<RegistroOperacion | null> {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx
        .select()
        .from(operacion)
        .where(and(eq(operacion.orgId, orgId), eq(operacion.id, operacionId)));
      return f ? aRegistro(f) : null;
    });
  }

  async actualizarEstado(orgId: string, operacionId: string, estado: EstadoOperacion): Promise<void> {
    const filas = await enTransaccionOrg(this.db, orgId, (tx) =>
      tx
        .update(operacion)
        .set({ estado })
        .where(and(eq(operacion.orgId, orgId), eq(operacion.id, operacionId)))
        .returning({ id: operacion.id }),
    );
    if (filas.length === 0) throw new Error("Operacion inexistente");
  }
}
