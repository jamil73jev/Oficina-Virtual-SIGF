import { baseDatosDe, crearAuditor, modoPersistencia, unicoPorProceso, type OpcionesFabrica } from "@/core/db/persistencia";
import { ProyectosMemoriaRepo } from "./repo";
import { ProyectosDrizzleRepo } from "./repo-drizzle";
import { ServicioProyectos } from "./service";

export * from "./domain";
export * from "./repo";
export * from "./service";
export * from "./http";

/** Servicio segun el entorno: Postgres con PERSISTENCIA=drizzle; si no, memoria. */
export function crearServicioProyectos(opciones: OpcionesFabrica = {}): ServicioProyectos {
  const modo = modoPersistencia(opciones.env);
  const repo = modo === "drizzle" ? new ProyectosDrizzleRepo(baseDatosDe(opciones)) : new ProyectosMemoriaRepo();
  return new ServicioProyectos(repo, crearAuditor(modo, opciones));
}

/** Servicio compartido del proceso (en Vercel exige PERSISTENCIA=drizzle). */
export function obtenerServicioProyectos(): ServicioProyectos {
  return unicoPorProceso("servicioProyectos", () => crearServicioProyectos());
}
