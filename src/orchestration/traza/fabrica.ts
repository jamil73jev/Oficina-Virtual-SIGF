import { baseDatosDe, modoPersistencia, unicoPorProceso, type OpcionesFabrica } from "@/core/db/persistencia";
import type { PublicadorTraza } from "./eventos";
import { obtenerPublicadorTraza } from "./memoria";
import { PublicadorTrazaPostgres } from "./postgres";

/**
 * Publicador de traza segun el entorno: Postgres con sondeo (PERSISTENCIA=drizzle, el SSE y la
 * operacion pueden correr en instancias distintas) o memoria del proceso (desarrollo y pruebas).
 * En Vercel sin PERSISTENCIA=drizzle lanza PersistenciaNoDurableError.
 */
export function obtenerPublicadorTrazaEntorno(opciones: OpcionesFabrica = {}): PublicadorTraza {
  if (modoPersistencia(opciones.env) === "drizzle") {
    return unicoPorProceso("publicadorTrazaPostgres", () => new PublicadorTrazaPostgres(baseDatosDe(opciones)));
  }
  return obtenerPublicadorTraza();
}
