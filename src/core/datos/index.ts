/** Clasificacion de los datos que procesa el sistema. */
export type ModoDatos = "sintetico" | "real";

/** Donde se ejecuta un modelo: en infraestructura propia o en un proveedor en la nube. */
export type Alojamiento = "local" | "nube";

export class ConfiguracionDatosError extends Error {
  constructor(readonly codigo: "modo_invalido" | "vercel_solo_sintetico" | "nube_solo_sintetico") {
    const mensajes = {
      modo_invalido: "MODO_DATOS debe ser sintetico o real",
      vercel_solo_sintetico: "Vercel solo admite fuentes de datos sinteticas",
      nube_solo_sintetico: "Los modelos en la nube solo admiten datos sinteticos",
    } as const;
    super(mensajes[codigo]);
    this.name = "ConfiguracionDatosError";
  }
}

export interface ConfiguracionDatos {
  modo: ModoDatos;
  vercel: boolean;
}

/** Fuente unica de configuracion y validacion del modo de datos. */
export function obtenerConfiguracionDatos(
  env: Record<string, string | undefined> = process.env,
): ConfiguracionDatos {
  const valor = env.MODO_DATOS?.trim().toLowerCase() || "sintetico";
  if (valor !== "sintetico" && valor !== "real") throw new ConfiguracionDatosError("modo_invalido");
  const configuracion = { modo: valor, vercel: env.VERCEL_ENV !== undefined } satisfies ConfiguracionDatos;
  if (configuracion.vercel && configuracion.modo !== "sintetico") {
    throw new ConfiguracionDatosError("vercel_solo_sintetico");
  }
  return configuracion;
}

/** Se invoca al construir dependencias y nuevamente antes de cada consulta. */
export function exigirFuentePermitida(configuracion: ConfiguracionDatos, tipoFuente: string): void {
  if (configuracion.vercel && tipoFuente !== "sintetico") {
    throw new ConfiguracionDatosError("vercel_solo_sintetico");
  }
  if (tipoFuente !== configuracion.modo) throw new ConfiguracionDatosError("modo_invalido");
}

export function exigirAlojamientoPermitido(configuracion: ConfiguracionDatos, alojamiento: Alojamiento): void {
  if (alojamiento === "nube" && configuracion.modo !== "sintetico") {
    throw new ConfiguracionDatosError("nube_solo_sintetico");
  }
}

export type ResultadoPolitica =
  | { permitido: true }
  | { permitido: false; motivo: string };

/** Politica pura: los datos reales (terceros) solo pueden tratarse con modelos locales. */
export function permitirModelo(modoDatos: ModoDatos, alojamiento: Alojamiento): ResultadoPolitica {
  if (modoDatos === "real" && alojamiento !== "local") {
    return {
      permitido: false,
      motivo:
        "Los datos reales no pueden enviarse a un modelo alojado en la nube: " +
        "use un modelo local o cambie a datos sinteticos",
    };
  }
  return { permitido: true };
}
