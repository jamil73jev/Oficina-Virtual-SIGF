import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Base de datos Drizzle sobre PostgreSQL, independiente del driver (PGlite en pruebas,
 * node-postgres/postgres-js/Neon en despliegue). Los repos solo usan el query builder.
 */
export type BaseDatos = PgDatabase<PgQueryResultHKT>;

/** Transaccion de `BaseDatos` (mismo query builder). */
export type TransaccionBd = Parameters<Parameters<BaseDatos["transaction"]>[0]>[0];

/** Rol de aplicacion: sin BYPASSRLS ni propiedad de tablas (src/core/db/sql). */
export const ROL_APLICACION = "app_rw";

/**
 * Abre una transaccion con `SET LOCAL ROLE app_rw` y `app.org_id` fijado (ambos se deshacen
 * al terminar la transaccion, apto para el pooler en modo transaccion). El rol importa: la
 * cuenta de conexion de Supabase ("postgres") es propietaria y se salta RLS; como app_rw las
 * politicas `org_id = app.org_id` SIEMPRE aplican. El orgId sale de la identidad
 * autenticada, nunca de la peticion.
 */
export function enTransaccionOrg<T>(
  db: BaseDatos,
  orgId: string,
  fn: (tx: TransaccionBd) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local role ${ROL_APLICACION}`));
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
