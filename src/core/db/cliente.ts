import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { BaseDatos } from "./index";
import * as schema from "./schema";

/**
 * CONTRATO de conexion a Postgres (Supabase). Lo usan la persistencia (repos Drizzle) y la
 * autenticacion (membresias); ambos importan SOLO obtenerBaseDatos().
 *
 * - DATABASE_URL: cadena del pooler de Supabase en modo transaccion (puerto 6543). Por eso
 *   `prepare: false` (el modo transaccion no admite sentencias preparadas).
 * - Las migraciones usan DATABASE_URL_DIRECT (puerto 5432), no este cliente.
 * - Pocas conexiones por instancia: en Vercel cada instancia serverless abre las suyas y el
 *   plan gratuito de Supabase tiene un tope bajo.
 * - Nunca se guarda ni se registra la cadena de conexion (lleva la contrasena).
 */

const ES_LOCAL = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/;

let cliente: ReturnType<typeof postgres> | undefined;
let instancia: BaseDatos | undefined;

export function obtenerBaseDatos(): BaseDatos {
  if (instancia) return instancia;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL no esta definida: no hay base de datos configurada");
  cliente = postgres(url, {
    prepare: false,
    max: Number(process.env.DB_MAX_CONEXIONES ?? 3),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: ES_LOCAL.test(url) ? false : "require",
  });
  // El tipo concreto de postgres-js es compatible en tiempo de ejecucion con el query builder
  // generico que usan los repos (el mismo que en las pruebas con PGlite).
  instancia = drizzle(cliente, { schema }) as unknown as BaseDatos;
  return instancia;
}

/** Cierra la conexion (pruebas y scripts). En serverless no hace falta llamarlo. */
export async function cerrarBaseDatos(): Promise<void> {
  const c = cliente;
  cliente = undefined;
  instancia = undefined;
  await c?.end({ timeout: 5 });
}
