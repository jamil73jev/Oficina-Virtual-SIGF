import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { CARPETA_MIGRACIONES, leerSqlEndurecimiento } from "@/core/db/migrar";

/** Ids sembrados para una organizacion de prueba (todas las FK satisfechas). */
export interface OrgSembrada {
  orgId: string;
  usuarios: [string, string];
  agenteId: string;
  proyectoId: string;
  ejecucionId: string;
}

export interface BdPrueba {
  client: PGlite;
  db: PgliteDatabase;
  /** Ejecuta SQL como propietario (superusuario de PGlite) y vuelve al rol app_rw. */
  comoPropietario<T>(fn: () => Promise<T>): Promise<T>;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

/** Aplica migraciones drizzle-kit + SQL de endurecimiento (0001, 0002) sobre un PGlite. */
export async function aplicarEsquema(client: PGlite): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: CARPETA_MIGRACIONES });
  for (const { sql } of await leerSqlEndurecimiento()) await client.exec(sql);
}

/**
 * Postgres en proceso (PGlite, sin red ni credenciales) con el esquema aplicado.
 * La sesion queda como `app_rw`, el rol de aplicacion: los repos corren con sus permisos.
 */
export async function crearBdPrueba(): Promise<BdPrueba> {
  const client = await PGlite.create();
  await aplicarEsquema(client);
  await client.exec("SET ROLE app_rw");

  const comoPropietario = async <T>(fn: () => Promise<T>): Promise<T> => {
    await client.exec("RESET ROLE");
    try {
      return await fn();
    } finally {
      await client.exec("SET ROLE app_rw");
    }
  };

  const nuevaOrg = () =>
    comoPropietario(async () => {
      const o: OrgSembrada = {
        orgId: randomUUID(),
        usuarios: [randomUUID(), randomUUID()],
        agenteId: randomUUID(),
        proyectoId: randomUUID(),
        ejecucionId: randomUUID(),
      };
      const tareaId = randomUUID();
      const [u1, u2] = o.usuarios;
      await client.query(
        `INSERT INTO organizacion (id, nombre, huso, moneda, locale)
           VALUES ($1, 'Org prueba', 'America/Guayaquil', 'USD', 'es')`,
        [o.orgId],
      );
      await client.query(
        "INSERT INTO usuario (id, email) VALUES ($1, $2), ($3, $4)",
        [u1, `${u1}@prueba.test`, u2, `${u2}@prueba.test`],
      );
      await client.query(
        "INSERT INTO proyecto (id, org_id, objetivo, owner_id) VALUES ($1, $2, 'objetivo', $3)",
        [o.proyectoId, o.orgId, u1],
      );
      await client.query(
        "INSERT INTO agente (id, org_id, rol, modelo) VALUES ($1, $2, 'analista', 'modelo-prueba')",
        [o.agenteId, o.orgId],
      );
      await client.query(
        "INSERT INTO tarea (id, org_id, proyecto_id, agente_id) VALUES ($1, $2, $3, $4)",
        [tareaId, o.orgId, o.proyectoId, o.agenteId],
      );
      await client.query(
        "INSERT INTO ejecucion (id, org_id, tarea_id, agente_id, modelo) VALUES ($1, $2, $3, $4, 'modelo-prueba')",
        [o.ejecucionId, o.orgId, tareaId, o.agenteId],
      );
      return o;
    });

  return {
    client,
    db: drizzle(client),
    comoPropietario,
    nuevaOrg,
    cerrar: () => client.close(),
  };
}

/** Org "sembrada" para repos en memoria: no hay FK que satisfacer. */
export const orgEnMemoria = async (): Promise<OrgSembrada> => ({
  orgId: randomUUID(),
  usuarios: [randomUUID(), randomUUID()],
  agenteId: randomUUID(),
  proyectoId: randomUUID(),
  ejecucionId: randomUUID(),
});

/** Timeout generoso para arrancar PGlite (WASM) y migrar. */
export const TIMEOUT_ARRANQUE = 60_000;
