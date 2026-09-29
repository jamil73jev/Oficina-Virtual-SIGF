import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { ProyectosMemoriaRepo } from "./repo";
import { ServicioProyectos } from "./service";

export * from "./domain";
export * from "./repo";
export * from "./service";
export * from "./http";

const CLAVE = Symbol.for("oficina-virtual.servicioProyectos");

/**
 * Servicio compartido en memoria (sin BD real todavia). PENDIENTE: sustituir
 * por repos Drizzle/Postgres con RLS por org_id al cablear el esquema.
 */
export function obtenerServicioProyectos(): ServicioProyectos {
  const g = globalThis as unknown as Record<symbol, ServicioProyectos>;
  g[CLAVE] ??= new ServicioProyectos(
    new ProyectosMemoriaRepo(),
    new Auditor(new AuditoriaMemoriaRepo()),
  );
  return g[CLAVE];
}
