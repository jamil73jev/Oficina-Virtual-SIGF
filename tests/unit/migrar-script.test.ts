import { describe, expect, it } from "vitest";
import { descubrirMigraciones } from "../../scripts/migrar.mjs";

describe("inventario del migrador", () => {
  it("ordena primero migrations y después sql sin colisiones de nombre", async () => {
    const nombres = (await descubrirMigraciones()).map((m) => m.nombre);
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres).toEqual([...nombres].sort((a, b) => {
      const grupoA = a.startsWith("migrations/") ? 0 : 1;
      const grupoB = b.startsWith("migrations/") ? 0 : 1;
      return grupoA - grupoB || a.localeCompare(b);
    }));
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
