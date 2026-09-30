import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function bloque(selector: string): Record<string, string> {
  const i = css.indexOf(selector + " {");
  const fin = css.indexOf("\n}", i);
  const cuerpo = css.slice(i, fin);
  const out: Record<string, string> = {};
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) out[m[1]!] = m[2]!;
  return out;
}

const luz = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const claro = bloque(":root");
const oscuro = { ...claro, ...bloque(':root[data-theme="dark"]') };
const sinAtributo = { ...claro, ...bloque(":root:not([data-theme])") };

// [texto, fondo] con al menos 4,5:1 (texto normal, WCAG 1.4.3)
const paresTexto: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "surface-raised"],
  ["foreground", "sidebar"],
  ["muted", "background"],
  ["muted", "surface"],
  ["muted", "surface-raised"],
  ["muted", "sidebar"],
  ["primary", "background"],
  ["primary", "surface-raised"],
  ["primary", "primary-soft"],
  ["primary", "sidebar"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["danger", "surface-raised"],
  ["danger", "danger-soft"],
  ["danger", "background"],
  ["success", "surface-raised"],
  ["success", "success-soft"],
  ["success", "background"],
  ["warning", "surface-raised"],
  ["warning", "warning-soft"],
  ["warning", "background"],
  ["info", "surface-raised"],
  ["info", "info-soft"],
  ["info", "background"],
  ["background", "foreground"], // texto del tooltip
];

// [borde, fondo] con al menos 3:1 (componentes de interfaz, WCAG 1.4.11)
const paresNoTexto: Array<[string, string]> = [
  ["border", "surface-raised"],
  ["border", "background"],
  ["focus", "background"],
  ["focus", "surface-raised"],
  ["primary", "surface-raised"],
];

const TOKENS_ANTIGUOS = [
  "background",
  "foreground",
  "surface",
  "surface-raised",
  "muted",
  "border",
  "border-subtle",
  "primary",
  "primary-foreground",
  "primary-hover",
  "danger",
  "success",
  "success-soft",
  "warning-soft",
  "warning",
  "focus",
];

describe("contraste WCAG 2.2 AA de los tokens", () => {
  for (const [nombre, t] of Object.entries({ claro, oscuro, "oscuro sin JS": sinAtributo === claro ? claro : { ...oscuro, ...sinAtributo } })) {
    it(`${nombre}: texto >= 4,5:1`, () => {
      for (const [a, b] of paresTexto) expect(ratio(t[a]!, t[b]!), `${a} sobre ${b}`).toBeGreaterThanOrEqual(4.5);
    });
    it(`${nombre}: bordes y foco >= 3:1`, () => {
      for (const [a, b] of paresNoTexto) expect(ratio(t[a]!, t[b]!), `${a} sobre ${b}`).toBeGreaterThanOrEqual(3);
    });
  }

  it("el bloque de sistema oscuro coincide con el de data-theme=dark", () => {
    const explicito = bloque(':root[data-theme="dark"]');
    const auto = bloque(":root:not([data-theme])");
    expect(auto).toEqual(explicito);
  });

  it("conserva los nombres de tokens anteriores en ambos temas", () => {
    const explicito = bloque(':root[data-theme="dark"]');
    for (const k of TOKENS_ANTIGUOS) {
      expect(claro[k], k).toBeDefined();
      expect(explicito[k], k).toBeDefined();
    }
  });
});
