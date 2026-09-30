// Sin dependencias: lo importan tambien modulos ligeros (publicador en memoria).

/**
 * Seleccion de persistencia por entorno (fabricas de los singletons de servicio):
 * - PERSISTENCIA=drizzle: Postgres (Supabase) via obtenerBaseDatos(), con RLS por org.
 * - cualquier otro valor: memoria (desarrollo y pruebas).
 * En Vercel (VERCEL_ENV definido) la memoria no sirve: cada instancia serverless tiene su
 * propio estado y se pierde entre peticiones, asi que arrancar sin drizzle es un error.
 */
export type ModoPersistencia = "drizzle" | "memoria";

export class PersistenciaNoDurableError extends Error {
  constructor(vercelEnv: string) {
    super(
      `PERSISTENCIA=drizzle es obligatoria en Vercel (VERCEL_ENV=${vercelEnv}): con persistencia ` +
        "en memoria cada instancia serverless tendria su propio estado y se perderia entre " +
        "peticiones. Configure PERSISTENCIA=drizzle y DATABASE_URL (ver docs/persistencia.md).",
    );
    this.name = "PersistenciaNoDurableError";
  }
}

export type Entorno = Record<string, string | undefined>;

export function modoPersistencia(env: Entorno = process.env): ModoPersistencia {
  if (env.PERSISTENCIA?.trim().toLowerCase() === "drizzle") return "drizzle";
  const vercel = env.VERCEL_ENV?.trim();
  if (vercel) throw new PersistenciaNoDurableError(vercel);
  return "memoria";
}

const PREFIJO = "oficina-virtual.";
const registro = new Set<symbol>();

/**
 * Instancia unica por proceso, creada al primer uso. La cache vive en globalThis SOLO aqui:
 * en desarrollo Next evalua cada ruta en su propio grafo de modulos y el modo memoria
 * necesita compartir el estado entre rutas. En modo drizzle lo cacheado son adaptadores sin
 * estado de negocio (el estado esta en Postgres), asi que varias instancias no divergen.
 */
export function unicoPorProceso<T>(nombre: string, crear: () => T): T {
  const clave = Symbol.for(PREFIJO + nombre);
  const g = globalThis as unknown as Record<symbol, T | undefined>;
  const existente = g[clave];
  if (existente !== undefined) return existente;
  const nuevo = crear();
  g[clave] = nuevo;
  registro.add(clave);
  return nuevo;
}

/** Solo pruebas: olvida las instancias creadas por unicoPorProceso en este proceso. */
export function reiniciarUnicosParaPruebas(): void {
  const g = globalThis as unknown as Record<symbol, unknown>;
  for (const clave of registro) delete g[clave];
  registro.clear();
}
