import { TransactionRollbackError, and, asc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { BaseDatos, TransaccionBd } from "@/core/db";
import { presupuesto, solicitudAmpliacion } from "@/core/db/schema";
import type { EstadoPresupuesto, Uso } from "@/orchestration/runtime";
import type {
  ClavePresupuesto,
  PresupuestoRepo,
  SolicitudAmpliacion,
  TxPresupuesto,
} from "./index";

type FilaPresupuesto = typeof presupuesto.$inferSelect;
type FilaSolicitud = typeof solicitudAmpliacion.$inferSelect;

/** Periodo por defecto al dar de alta un presupuesto desde el repo. */
export const PERIODO_VIGENTE = "vigente";

const aEstado = (f: FilaPresupuesto): EstadoPresupuesto => ({
  ambito: f.ambito,
  tope: { tokens: f.topeTokens, costo: f.topeCosto, iteraciones: f.topeIteraciones },
  consumido: {
    tokens: f.consumidoTokens,
    costo: f.consumidoCosto,
    iteraciones: f.consumidoIteraciones,
  },
});

const aSolicitud = (f: FilaSolicitud): SolicitudAmpliacion => ({
  id: f.id,
  orgId: f.orgId,
  tipo: "ampliacion_presupuesto",
  claves: f.claves as ClavePresupuesto[],
  estimado: f.estimado as Uso,
  estado: f.estado,
  decididoPor: f.decididoPor,
  creadaEn: f.creadaEn.toISOString(),
});

const deClave = (orgId: string, c: ClavePresupuesto) =>
  and(
    eq(presupuesto.orgId, orgId),
    eq(presupuesto.ambito, c.ambito),
    eq(presupuesto.refId, c.refId),
  );

const columnas = (e: EstadoPresupuesto) => ({
  topeTokens: e.tope.tokens,
  topeCosto: e.tope.costo,
  topeIteraciones: e.tope.iteraciones,
  consumidoTokens: e.consumido.tokens,
  consumidoCosto: e.consumido.costo,
  consumidoIteraciones: e.consumido.iteraciones,
});

/** Alta o reemplazo (upsert por org, ambito, ref_id). */
const upsert = (
  db: BaseDatos | TransaccionBd,
  orgId: string,
  c: ClavePresupuesto,
  e: EstadoPresupuesto,
  periodo = PERIODO_VIGENTE,
) =>
  db
    .insert(presupuesto)
    .values({ orgId, ambito: c.ambito, refId: c.refId, periodo, ...columnas(e) })
    .onConflictDoUpdate({
      target: [presupuesto.orgId, presupuesto.ambito, presupuesto.refId],
      set: columnas(e),
    });

const coincide = (a: ClavePresupuesto, b: ClavePresupuesto) =>
  a.ambito === b.ambito && a.refId === b.refId;

class TxDrizzle implements TxPresupuesto {
  constructor(private readonly tx: TransaccionBd) {}

  /** SELECT ... FOR UPDATE: bloquea la fila hasta el fin de la transaccion. */
  async obtener(orgId: string, c: ClavePresupuesto) {
    const [f] = await this.tx.select().from(presupuesto).where(deClave(orgId, c)).for("update");
    return f ? aEstado(f) : null;
  }

  async guardar(orgId: string, c: ClavePresupuesto, e: EstadoPresupuesto) {
    await upsert(this.tx, orgId, c, e);
  }

  async pendientePara(orgId: string, claves: ClavePresupuesto[]) {
    const filas = await this.tx
      .select()
      .from(solicitudAmpliacion)
      .where(
        and(eq(solicitudAmpliacion.orgId, orgId), eq(solicitudAmpliacion.estado, "pendiente")),
      )
      .orderBy(asc(solicitudAmpliacion.creadaEn), asc(solicitudAmpliacion.id));
    const f = filas.find((x) =>
      (x.claves as ClavePresupuesto[]).some((c) => claves.some((k) => coincide(c, k))),
    );
    return f ? aSolicitud(f) : null;
  }

  async crearSolicitud(s: SolicitudAmpliacion) {
    await this.tx.insert(solicitudAmpliacion).values({
      id: s.id,
      orgId: s.orgId,
      claves: s.claves,
      estimado: s.estimado,
      estado: s.estado,
      decididoPor: s.decididoPor,
      creadaEn: new Date(s.creadaEn),
    });
  }

  async obtenerSolicitud(orgId: string, id: string) {
    const [f] = await this.tx
      .select()
      .from(solicitudAmpliacion)
      .where(and(eq(solicitudAmpliacion.orgId, orgId), eq(solicitudAmpliacion.id, id)))
      .for("update");
    return f ? aSolicitud(f) : null;
  }

  async guardarSolicitud(s: SolicitudAmpliacion) {
    const filas = await this.tx
      .update(solicitudAmpliacion)
      .set({
        claves: s.claves,
        estimado: s.estimado,
        estado: s.estado,
        decididoPor: s.decididoPor,
      })
      .where(and(eq(solicitudAmpliacion.orgId, s.orgId), eq(solicitudAmpliacion.id, s.id)))
      .returning({ id: solicitudAmpliacion.id });
    if (filas.length === 0) throw new Error("Solicitud inexistente");
  }
}

export type ResultadoReservaAtomica =
  | { ok: true; siguiente: EstadoPresupuesto[] }
  | { ok: false };

/**
 * Presupuesto en PostgreSQL. `transaccion` abre una transaccion real y `obtener` bloquea la
 * fila (FOR UPDATE), de modo que leer-decidir-guardar es atomico entre procesos. Orden de
 * bloqueo estable (agente, proyecto, org) en ServicioPresupuesto: sin interbloqueos.
 */
export class PresupuestoDrizzleRepo implements PresupuestoRepo {
  constructor(private readonly db: BaseDatos) {}

  transaccion<T>(fn: (tx: TxPresupuesto) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new TxDrizzle(tx)));
  }

  /** Siembra o reemplaza un presupuesto (arranque / pruebas). */
  async definir(
    orgId: string,
    clave: ClavePresupuesto,
    estado: EstadoPresupuesto,
    periodo = PERIODO_VIGENTE,
  ): Promise<void> {
    await upsert(this.db, orgId, clave, estado, periodo);
  }

  async leer(orgId: string, clave: ClavePresupuesto): Promise<EstadoPresupuesto | null> {
    const [f] = await this.db.select().from(presupuesto).where(deClave(orgId, clave));
    return f ? aEstado(f) : null;
  }

  async solicitudesDe(orgId: string): Promise<SolicitudAmpliacion[]> {
    const filas = await this.db
      .select()
      .from(solicitudAmpliacion)
      .where(eq(solicitudAmpliacion.orgId, orgId))
      .orderBy(asc(solicitudAmpliacion.creadaEn), asc(solicitudAmpliacion.id));
    return filas.map(aSolicitud);
  }

  /**
   * Reserva atomica sin leer antes: una sola sentencia
   * `UPDATE presupuesto SET consumido = consumido + est WHERE <claves> AND consumido + est <= tope`
   * en todas las dimensiones. Si alguna clave no cumple (o no existe), se revierte todo.
   * Mismo criterio fail-closed que el guard puro: un tope <= 0 bloquea cualquier consumo > 0.
   */
  reservarAtomico(
    orgId: string,
    claves: ClavePresupuesto[],
    estimado: Uso,
  ): Promise<ResultadoReservaAtomica> {
    // Fail-closed: sin ambitos no hay nada que reservar.
    if (claves.length === 0) return Promise.resolve({ ok: false });
    const cabe =(consumido: AnyPgColumn, est: number, tope: AnyPgColumn) =>
      sql`${consumido} + ${est} <= greatest(${tope}, 0)`;
    const deAlguna = sql.join(
      claves.map(
        (c) => sql`(${presupuesto.ambito} = ${c.ambito} and ${presupuesto.refId} = ${c.refId})`,
      ),
      sql` or `,
    );
    return this.db
      .transaction(async (tx) => {
        const filas = await tx
          .update(presupuesto)
          .set({
            consumidoTokens: sql`${presupuesto.consumidoTokens} + ${estimado.tokens}`,
            consumidoCosto: sql`${presupuesto.consumidoCosto} + ${estimado.costo}`,
            consumidoIteraciones: sql`${presupuesto.consumidoIteraciones} + ${estimado.iteraciones}`,
          })
          .where(
            and(
              eq(presupuesto.orgId, orgId),
              sql`(${deAlguna})`,
              cabe(presupuesto.consumidoTokens, estimado.tokens, presupuesto.topeTokens),
              cabe(presupuesto.consumidoCosto, estimado.costo, presupuesto.topeCosto),
              cabe(
                presupuesto.consumidoIteraciones,
                estimado.iteraciones,
                presupuesto.topeIteraciones,
              ),
            ),
          )
          .returning();
        if (filas.length !== claves.length) {
          tx.rollback();
        }
        // Mismo orden que `claves`.
        const orden = (f: FilaPresupuesto) =>
          claves.findIndex((c) => coincide(c, { ambito: f.ambito, refId: f.refId }));
        return {
          ok: true as const,
          siguiente: [...filas].sort((a, b) => orden(a) - orden(b)).map(aEstado),
        };
      })
      .catch((e: unknown) => {
        if (e instanceof TransactionRollbackError) return { ok: false as const };
        throw e;
      });
  }
}
