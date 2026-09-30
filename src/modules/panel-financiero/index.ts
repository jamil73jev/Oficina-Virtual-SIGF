import { unicoPorProceso } from "@/core/db/entorno";
import { FuenteDatosSintetica } from "./fuente";
import { ServicioPanelFinanciero } from "./service";

export * from "./domain";
export * from "./fuente";
export * from "./service";
export * from "./mensajes";
export * from "./VistaPanelFinanciero";

/** Sin estado de negocio (lee la fuente sintetica): no depende del modo de persistencia. */
export function obtenerServicioPanelFinanciero(): ServicioPanelFinanciero {
  return unicoPorProceso("servicioPanelFinanciero", () => new ServicioPanelFinanciero(new FuenteDatosSintetica()));
}
