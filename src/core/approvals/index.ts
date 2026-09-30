import { baseDatosDe, crearAuditor, modoPersistencia, unicoPorProceso, type OpcionesFabrica } from "@/core/db/persistencia";
import { AprobacionesMemoriaRepo } from "./repo";
import { AprobacionesDrizzleRepo } from "./repo-drizzle";
import { ServicioAprobaciones } from "./service";

export * from "./repo";
export * from "./service";
export * from "./http";

/** Servicio segun el entorno: Postgres con PERSISTENCIA=drizzle; si no, memoria. */
export function crearServicioAprobaciones(opciones: OpcionesFabrica = {}): ServicioAprobaciones {
  const modo = modoPersistencia(opciones.env);
  const repo = modo === "drizzle" ? new AprobacionesDrizzleRepo(baseDatosDe(opciones)) : new AprobacionesMemoriaRepo();
  return new ServicioAprobaciones(repo, crearAuditor(modo, opciones));
}

/** Servicio compartido del proceso (en Vercel exige PERSISTENCIA=drizzle). */
export function obtenerServicioAprobaciones(): ServicioAprobaciones {
  return unicoPorProceso("servicioAprobaciones", () => crearServicioAprobaciones());
}
