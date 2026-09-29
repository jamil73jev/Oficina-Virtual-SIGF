/**
 * QA determinista: criterios ejecutables como cadenas (caben en Tarea.criteriosVerificacion).
 * Sintaxis: contiene:<t> | no_contiene:<t> | longitud_min:<n> | longitud_max:<n> |
 *           lineas_min:<n> | seccion:<titulo> | json_valido
 * No usa ningun LLM.
 */
export type Criterio =
  | { tipo: "contiene" | "no_contiene" | "seccion"; valor: string }
  | { tipo: "longitud_min" | "longitud_max" | "lineas_min"; valor: number }
  | { tipo: "json_valido" };

export function parsearCriterio(texto: string): Criterio | null {
  const t = texto.trim();
  if (t === "json_valido") return { tipo: "json_valido" };
  const i = t.indexOf(":");
  if (i < 1) return null;
  const clave = t.slice(0, i);
  const valor = t.slice(i + 1).trim();
  if (!valor) return null;
  if (clave === "contiene" || clave === "no_contiene" || clave === "seccion") {
    return { tipo: clave, valor };
  }
  if (clave === "longitud_min" || clave === "longitud_max" || clave === "lineas_min") {
    const n = Number(valor);
    // Minimos triviales (0) o topes sin sentido se rechazan: un criterio debe poder fallar.
    return Number.isInteger(n) && n >= 1 ? { tipo: clave, valor: n } : null;
  }
  return null;
}

/**
 * Un criterio "sustantivo" exige contenido (no pasa con documento vacio). Solo
 * no_contiene / longitud_max se cumplen trivialmente con texto vacio.
 */
export function tieneCriterioSustantivo(criterios: readonly string[]): boolean {
  return criterios.some((texto) => {
    const c = parsearCriterio(texto);
    return c !== null && c.tipo !== "no_contiene" && c.tipo !== "longitud_max";
  });
}

export interface ResultadoQA {
  ok: boolean;
  fallos: string[];
}

function cumple(c: Criterio, contenido: string): boolean {
  const bajo = contenido.toLowerCase();
  switch (c.tipo) {
    case "contiene":
      return bajo.includes(c.valor.toLowerCase());
    case "no_contiene":
      return !bajo.includes(c.valor.toLowerCase());
    case "longitud_min":
      return contenido.length >= c.valor;
    case "longitud_max":
      return contenido.length <= c.valor;
    case "lineas_min":
      return contenido.split("\n").filter((l) => l.trim()).length >= c.valor;
    case "seccion":
      return contenido
        .split("\n")
        .some(
          (l) =>
            /^#{1,6}\s/.test(l) &&
            l.replace(/^#+\s*/, "").trim().toLowerCase() === c.valor.toLowerCase(),
        );
    case "json_valido":
      try {
        JSON.parse(contenido);
        return true;
      } catch {
        return false;
      }
  }
}

export function verificar(contenido: string, criterios: readonly string[]): ResultadoQA {
  if (criterios.length === 0) return { ok: false, fallos: ["sin_criterios"] };
  if (!tieneCriterioSustantivo(criterios)) return { ok: false, fallos: ["criterios_triviales"] };
  if (contenido.trim() === "") return { ok: false, fallos: ["contenido_vacio"] };
  const fallos = criterios.filter((texto) => {
    const c = parsearCriterio(texto);
    return !c || !cumple(c, contenido);
  });
  return { ok: fallos.length === 0, fallos };
}
