import { baseDatosDe, crearAuditor, modoPersistencia, unicoPorProceso, type OpcionesFabrica } from "@/core/db/persistencia";
import { AlmacenBlobMemoria } from "./blob";
import { crearAlmacenBlobSupabaseDesdeEntorno } from "./blob-supabase";
import { DocumentosMemoriaRepo } from "./repo";
import { DocumentosDrizzleRepo } from "./repo-drizzle";
import { ServicioDocumentos } from "./service";

export * from "./blob";
export * from "./domain";
export * from "./http";
export * from "./repo";
export * from "./service";

/**
 * Servicio segun el entorno: con PERSISTENCIA=drizzle, metadatos y versiones en Postgres y
 * contenido en Supabase Storage (bucket privado, service role solo en servidor); si no, memoria.
 */
export function crearServicioDocumentos(opciones: OpcionesFabrica = {}): ServicioDocumentos {
  const modo = modoPersistencia(opciones.env);
  if (modo === "drizzle") {
    return new ServicioDocumentos(
      new DocumentosDrizzleRepo(baseDatosDe(opciones)),
      crearAlmacenBlobSupabaseDesdeEntorno(opciones.env),
      crearAuditor(modo, opciones),
    );
  }
  return new ServicioDocumentos(new DocumentosMemoriaRepo(), new AlmacenBlobMemoria(), crearAuditor(modo, opciones));
}

/** Servicio compartido del proceso (en Vercel exige PERSISTENCIA=drizzle). */
export function obtenerServicioDocumentos(): ServicioDocumentos {
  return unicoPorProceso("servicioDocumentos", () => crearServicioDocumentos());
}
