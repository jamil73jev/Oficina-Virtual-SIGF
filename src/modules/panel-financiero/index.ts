import { FuenteDatosSintetica } from "./fuente";
import { ServicioPanelFinanciero } from "./service";

export * from "./domain";
export * from "./fuente";
export * from "./service";
export * from "./mensajes";
export * from "./VistaPanelFinanciero";

const CLAVE = Symbol.for("oficina-virtual.servicioPanelFinanciero");

export function obtenerServicioPanelFinanciero(): ServicioPanelFinanciero {
  const g = globalThis as unknown as Record<symbol, ServicioPanelFinanciero>;
  if (!g[CLAVE]) {
    g[CLAVE] = new ServicioPanelFinanciero(new FuenteDatosSintetica());
  }
  return g[CLAVE];
}
