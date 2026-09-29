import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Solo para herramientas y pruebas: lee ficheros del disco (no importar desde rutas de la app).

/** Carpeta de migraciones generadas por drizzle-kit (`npm run db:generate`). */
export const CARPETA_MIGRACIONES = fileURLToPath(new URL("./migrations", import.meta.url));

const CARPETA_SQL = fileURLToPath(new URL("./sql", import.meta.url));

/**
 * SQL escrito a mano que se aplica tras las migraciones de drizzle-kit, en orden:
 * 0001 endurece auditoria (rol app_rw, REVOKE, triggers, advisory lock, RLS) y 0002
 * concede el minimo privilegio a app_rw. Ambos son idempotentes.
 */
export async function leerSqlEndurecimiento(): Promise<{ nombre: string; sql: string }[]> {
  const nombres = (await readdir(CARPETA_SQL)).filter((n) => n.endsWith(".sql")).sort();
  return Promise.all(
    nombres.map(async (nombre) => ({
      nombre,
      sql: await readFile(`${CARPETA_SQL}/${nombre}`, "utf8"),
    })),
  );
}
