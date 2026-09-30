import { describe, expect, it } from "vitest";
import { decidirRuta, destinoSeguro, rutaTrasRechazo, type EstadoSesionProxy } from "@/core/auth/rutas";

const LOCALES = ["es", "en"] as const;
const decidir = (ruta: string, sesion: EstadoSesionProxy) => decidirRuta(ruta, sesion, LOCALES, "es");

const SIN: EstadoSesionProxy = { autenticado: false, mfaPendiente: false, tieneFactor: false };
const COMPLETA: EstadoSesionProxy = { autenticado: true, mfaPendiente: false, tieneFactor: true };
const MFA_DESAFIO: EstadoSesionProxy = { autenticado: true, mfaPendiente: true, tieneFactor: true };
const MFA_INSCRIBIR: EstadoSesionProxy = { autenticado: true, mfaPendiente: true, tieneFactor: false };

describe("decision pura del proxy", () => {
  it("rutas publicas pasan sin sesion: login, desafio MFA, seguridad", () => {
    for (const r of ["/es/login", "/en/login", "/es/login/mfa", "/en/seguridad/mfa", "/es/seguridad/sin-acceso"]) {
      expect(decidir(r, SIN), r).toEqual({ tipo: "continuar" });
    }
  });

  it("estaticos, raiz y /api nunca se redirigen (la api responde 401 JSON)", () => {
    for (const r of ["/_next/static/chunk.js", "/favicon.ico", "/logo.svg", "/", "/api/projects", "/api/salud", "/api"]) {
      expect(decidir(r, SIN), r).toEqual({ tipo: "continuar" });
      expect(decidir(r, MFA_DESAFIO), r).toEqual({ tipo: "continuar" });
    }
  });

  it("oficina sin sesion: al login del MISMO locale con ?siguiente=", () => {
    expect(decidir("/es/costos", SIN)).toEqual({ tipo: "redirigir", destino: "/es/login?siguiente=%2Fes%2Fcostos" });
    expect(decidir("/en", SIN)).toEqual({ tipo: "redirigir", destino: "/en/login?siguiente=%2Fen" });
    expect(decidir("/en/operaciones/abc", SIN)).toEqual({
      tipo: "redirigir",
      destino: "/en/login?siguiente=%2Fen%2Foperaciones%2Fabc",
    });
  });

  it("ruta sin locale conocido: login del locale por defecto, sin siguiente", () => {
    expect(decidir("/fr/costos", SIN)).toEqual({ tipo: "redirigir", destino: "/es/login" });
  });

  it("MFA pendiente: desafio si hay factor, inscripcion si no", () => {
    expect(decidir("/es/finanzas", MFA_DESAFIO)).toEqual({ tipo: "redirigir", destino: "/es/login/mfa" });
    expect(decidir("/en/finanzas", MFA_INSCRIBIR)).toEqual({ tipo: "redirigir", destino: "/en/seguridad/mfa" });
    // Las propias paginas de MFA siguen accesibles.
    expect(decidir("/es/login/mfa", MFA_DESAFIO)).toEqual({ tipo: "continuar" });
    expect(decidir("/es/seguridad/mfa", MFA_INSCRIBIR)).toEqual({ tipo: "continuar" });
  });

  it("sesion completa: la oficina pasa y /login lleva a la portada", () => {
    expect(decidir("/es/costos", COMPLETA)).toEqual({ tipo: "continuar" });
    expect(decidir("/en/login", COMPLETA)).toEqual({ tipo: "redirigir", destino: "/en" });
    expect(decidir("/es/login", MFA_DESAFIO)).toEqual({ tipo: "continuar" });
  });

  it("un prefijo parecido no es ruta publica", () => {
    expect(decidir("/es/loginx", SIN).tipo).toBe("redirigir");
    expect(decidir("/es/seguridadx", SIN).tipo).toBe("redirigir");
  });
});

describe("destinoSeguro (evita redirecciones abiertas)", () => {
  it("acepta rutas internas bajo un locale", () => {
    expect(destinoSeguro("/es/costos", "es", LOCALES)).toBe("/es/costos");
    expect(destinoSeguro("/en/operaciones/1?completa=1", "es", LOCALES)).toBe("/en/operaciones/1?completa=1");
  });

  it("rechaza externas, protocol-relative, barras invertidas y rutas de acceso", () => {
    for (const malo of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/es/login",
      "/es/login/mfa",
      "/es/seguridad/mfa",
      "/fr/x",
      "es/costos",
      "/es/x\r\nSet-Cookie: a=b",
      "",
      null,
      "/es/" + "a".repeat(600),
    ]) {
      expect(destinoSeguro(malo, "es", LOCALES), String(malo)).toBe("/es");
    }
    // Codificado sigue siendo una ruta interna inerte (Next no lo decodifica en la cabecera).
    expect(destinoSeguro("/es/%0d%0a", "es", LOCALES)).toBe("/es/%0d%0a");
  });

  it("rutaTrasRechazo segun el motivo", () => {
    expect(rutaTrasRechazo("no_autenticado", false, "en")).toBe("/en/login");
    expect(rutaTrasRechazo("mfa_requerida", true, "es")).toBe("/es/login/mfa");
    expect(rutaTrasRechazo("mfa_requerida", false, "es")).toBe("/es/seguridad/mfa");
    expect(rutaTrasRechazo("sin_membresia", true, "es")).toBe("/es/seguridad/sin-acceso");
    expect(rutaTrasRechazo("correo_no_permitido", false, "es")).toBe("/es/seguridad/sin-acceso");
  });
});
