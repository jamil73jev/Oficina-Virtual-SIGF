import { describe, expect, it } from "vitest";
import {
  ConfiguracionDatosError,
  exigirAlojamientoPermitido,
  exigirFuentePermitida,
  obtenerConfiguracionDatos,
} from "@/core/datos";

describe("configuración central de datos", () => {
  it("usa sintético por defecto y bloquea real en Vercel", () => {
    expect(obtenerConfiguracionDatos({})).toEqual({ modo: "sintetico", vercel: false });
    expect(() => obtenerConfiguracionDatos({ VERCEL_ENV: "preview", MODO_DATOS: "real" }))
      .toThrow(ConfiguracionDatosError);
  });

  it("valida fuentes en cada llamada y nube con datos reales", () => {
    const vercel = obtenerConfiguracionDatos({ VERCEL_ENV: "production" });
    expect(() => exigirFuentePermitida(vercel, "real")).toThrow(ConfiguracionDatosError);
    const real = obtenerConfiguracionDatos({ MODO_DATOS: "real" });
    expect(() => exigirAlojamientoPermitido(real, "nube")).toThrow(ConfiguracionDatosError);
    expect(() => exigirAlojamientoPermitido(real, "local")).not.toThrow();
  });
});
