import { HERRAMIENTAS_PAGOS, type NombreHerramientaPagos } from "./herramientas";

export * from "./domain";
export * from "./generador";
export * from "./pagaduria";
export * from "./cajas";
export * from "./herramientas";

export const NOMBRES_HERRAMIENTAS_PAGOS = Object.keys(HERRAMIENTAS_PAGOS) as NombreHerramientaPagos[];
