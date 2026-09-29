import { generarDatosSinteticos, type DatosFinanzas } from "@/modules/finanzas";
import type { FuenteDatos } from "./domain";

export const SEMILLA_SINTETICA_POR_DEFECTO = 20260831;

export class FuenteDatosSintetica implements FuenteDatos {
  constructor(private readonly semilla: number | string = SEMILLA_SINTETICA_POR_DEFECTO) {}

  obtenerDatos(): DatosFinanzas {
    return generarDatosSinteticos({ semilla: this.semilla });
  }
}
