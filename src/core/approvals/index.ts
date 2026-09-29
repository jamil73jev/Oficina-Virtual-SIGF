import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { AprobacionesMemoriaRepo } from "./repo";
import { ServicioAprobaciones } from "./service";

export * from "./repo";
export * from "./service";
export * from "./http";

const CLAVE = Symbol.for("oficina-virtual.servicioAprobaciones");

/**
 * Servicio compartido en memoria (sin BD real todavia). PENDIENTE: sustituir
 * por repos Drizzle/Postgres con RLS por org_id al cablear el esquema.
 */
export function obtenerServicioAprobaciones(): ServicioAprobaciones {
  const g = globalThis as unknown as Record<symbol, ServicioAprobaciones>;
  g[CLAVE] ??= new ServicioAprobaciones(
    new AprobacionesMemoriaRepo(),
    new Auditor(new AuditoriaMemoriaRepo()),
  );
  return g[CLAVE];
}
