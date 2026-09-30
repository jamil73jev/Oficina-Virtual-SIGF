import { describe, expect, it } from "vitest";
import {
  CLAVE_TEMA,
  SCRIPT_TEMA,
  aplicarTema,
  esRutaActiva,
  guardarPreferencia,
  leerPreferencia,
  normalizarPreferencia,
  quitarLocale,
  resolverTema,
} from "@/components/theme/tema";

const locales = ["es", "en"] as const;

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  };
}

describe("preferencia de tema", () => {
  it("normaliza valores desconocidos a sistema", () => {
    expect(normalizarPreferencia("dark")).toBe("dark");
    expect(normalizarPreferencia("light")).toBe("light");
    expect(normalizarPreferencia("sepia")).toBe("system");
    expect(normalizarPreferencia(null)).toBe("system");
  });

  it("resuelve sistema según la preferencia del sistema operativo", () => {
    expect(resolverTema("system", true)).toBe("dark");
    expect(resolverTema("system", false)).toBe("light");
    expect(resolverTema("light", true)).toBe("light");
    expect(resolverTema("dark", false)).toBe("dark");
  });

  it("persiste claro y oscuro, y borra la clave para sistema", () => {
    const a = almacen();
    guardarPreferencia(a, "dark");
    expect(a.datos.get(CLAVE_TEMA)).toBe("dark");
    expect(leerPreferencia(a)).toBe("dark");
    guardarPreferencia(a, "system");
    expect(a.datos.has(CLAVE_TEMA)).toBe(false);
    expect(leerPreferencia(a)).toBe("system");
  });

  it("tolera un almacenamiento que lanza o no existe", () => {
    const boom = () => {
      throw new Error("bloqueado");
    };
    const roto = { getItem: boom, setItem: boom, removeItem: boom };
    expect(leerPreferencia(roto)).toBe("system");
    expect(() => guardarPreferencia(roto, "dark")).not.toThrow();
    expect(leerPreferencia(null)).toBe("system");
  });

  it("aplica data-theme y color-scheme en la raíz", () => {
    const attrs: Record<string, string> = {};
    const raiz = { setAttribute: (k: string, v: string) => void (attrs[k] = v), style: { colorScheme: "" } };
    aplicarTema(raiz, "dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(raiz.style.colorScheme).toBe("dark");
  });
});

describe("script anti-parpadeo", () => {
  function ejecutar(guardado: string | null, sistemaOscuro: boolean, almacenLanza = false) {
    const attrs: Record<string, string> = {};
    const raiz = { setAttribute: (k: string, v: string) => void (attrs[k] = v), style: { colorScheme: "" } };
    const localStorage = {
      getItem: (k: string) => {
        if (almacenLanza) throw new Error("bloqueado");
        return k === CLAVE_TEMA ? guardado : null;
      },
    };
    const window = { matchMedia: () => ({ matches: sistemaOscuro }) };
    new Function("localStorage", "window", "document", SCRIPT_TEMA)(localStorage, window, { documentElement: raiz });
    return { attrs, raiz };
  }

  it("respeta la preferencia guardada antes del primer pintado", () => {
    expect(ejecutar("dark", false).attrs["data-theme"]).toBe("dark");
    expect(ejecutar("light", true).attrs["data-theme"]).toBe("light");
  });

  it("sin preferencia sigue al sistema", () => {
    expect(ejecutar(null, true).attrs["data-theme"]).toBe("dark");
    expect(ejecutar(null, false).attrs["data-theme"]).toBe("light");
  });

  it("no falla si localStorage lanza y fija color-scheme", () => {
    const r = ejecutar(null, true, true);
    expect(r.attrs["data-theme"]).toBe("dark");
    expect(r.raiz.style.colorScheme).toBe("dark");
  });

  it("usa la misma clave que el conmutador", () => {
    expect(SCRIPT_TEMA).toContain(JSON.stringify(CLAVE_TEMA));
  });
});

describe("enlace activo por ruta con locale", () => {
  it("quita el locale del pathname", () => {
    expect(quitarLocale("/es", locales)).toBe("/");
    expect(quitarLocale("/en/proyectos", locales)).toBe("/proyectos");
    expect(quitarLocale("/es/proyectos/", locales)).toBe("/proyectos");
    expect(quitarLocale("/proyectos", locales)).toBe("/proyectos");
  });

  it("inicio solo está activo en la portada", () => {
    expect(esRutaActiva("/es", "/es", locales)).toBe(true);
    expect(esRutaActiva("/es/proyectos", "/es", locales)).toBe(false);
  });

  it("marca solo el elemento de la ruta actual, en ambos idiomas", () => {
    expect(esRutaActiva("/es/proyectos", "/es/proyectos", locales)).toBe(true);
    expect(esRutaActiva("/en/proyectos", "/en/proyectos", locales)).toBe(true);
    expect(esRutaActiva("/es/proyectos", "/es/documentos", locales)).toBe(false);
  });

  it("las subrutas activan su sección y no una vecina de prefijo parecido", () => {
    expect(esRutaActiva("/es/operaciones/abc", "/es/operaciones", locales)).toBe(true);
    expect(esRutaActiva("/es/operaciones-extra", "/es/operaciones", locales)).toBe(false);
  });
});
