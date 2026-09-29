import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Base de datos Drizzle sobre PostgreSQL, independiente del driver (PGlite en pruebas,
 * node-postgres/postgres-js/Neon en despliegue). Los repos solo usan el query builder.
 */
export type BaseDatos = PgDatabase<PgQueryResultHKT>;

/** Transaccion de `BaseDatos` (mismo query builder). */
export type TransaccionBd = Parameters<Parameters<BaseDatos["transaction"]>[0]>[0];

/**
 * Abre una transaccion con `app.org_id` fijado (equivale a SET LOCAL): las politicas RLS
 * de auditoria lo exigen. El orgId sale de la identidad autenticada, nunca de la peticion.
 */
export function enTransaccionOrg<T>(
  db: BaseDatos,
  orgId: string,
  fn: (tx: TransaccionBd) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
