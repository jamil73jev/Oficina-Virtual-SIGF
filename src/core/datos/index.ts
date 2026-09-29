/** Clasificacion de los datos que procesa el sistema. */
export type ModoDatos = "sintetico" | "real";

/** Donde se ejecuta un modelo: en infraestructura propia o en un proveedor en la nube. */
export type Alojamiento = "local" | "nube";

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
