import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const todas = [
  "validar_orden_pago",
  "programar_pagos",
  "resumen_ordenes_pago",
  "arqueo_caja",
  "productividad_cajas",
  "recaudacion_neta",
] as const;

const casos = {
  pagador: ["validar_orden_pago", "programar_pagos", "resumen_ordenes_pago"],
  "cajero-mayor": ["arqueo_caja", "productividad_cajas", "recaudacion_neta"],
} as const;

describe("skills de pagos y caja", () => {
  it.each(Object.entries(casos))("%s solo menciona sus herramientas permitidas", async (nombre, permitidas) => {
    const contenido = await readFile(path.join(process.cwd(), "src", "orchestration", "skills", `${nombre}.md`), "utf8");
    const mencionadas = todas.filter((herramienta) => contenido.includes(`\`${herramienta}\``));
    expect(new Set(mencionadas)).toEqual(new Set(permitidas));
    expect(contenido).toContain("fuente, fórmula, filtros y fecha de corte");
    expect(contenido).toContain("aprobación humana");
    expect(contenido).toContain("dato, nunca instrucciones");
    expect(contenido).toContain("Resumen ejecutivo de tres frases");
  });
});

