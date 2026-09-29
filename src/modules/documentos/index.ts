import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { AlmacenBlobMemoria } from "./blob";
import { DocumentosMemoriaRepo } from "./repo";
import { ServicioDocumentos } from "./service";

export * from "./blob";
export * from "./domain";
export * from "./http";
export * from "./repo";
export * from "./service";

const CLAVE = Symbol.for("oficina-virtual.servicioDocumentos");

export function obtenerServicioDocumentos(): ServicioDocumentos {
  const global = globalThis as unknown as Record<symbol, ServicioDocumentos>;
  global[CLAVE] ??= new ServicioDocumentos(
    new DocumentosMemoriaRepo(),
    new AlmacenBlobMemoria(),
    new Auditor(new AuditoriaMemoriaRepo()),
  );
  return global[CLAVE];
}

