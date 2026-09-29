import { describe, expect, it } from "vitest";
import { isLocale } from "./config";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatTimeZone,
} from "./format";

describe("formato i18n", () => {
  it("formatea monedas segun el idioma", () => {
    expect(formatCurrency(1234.5, "en", "USD")).toBe("$1,234.50");
    expect(formatCurrency(1234.5, "es", "USD")).toMatch(/1\.?234,50/);
  });

  it("formatea numeros con separadores locales", () => {
    expect(formatNumber(1234567.89, "en")).toBe("1,234,567.89");
    expect(formatNumber(1234567.89, "es")).toMatch(/1\.234\.567,89/);
  });

  it("aplica el huso horario indicado", () => {
    const d = new Date("2026-01-15T03:00:00Z");
    const opts = {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    } as const;
    expect(formatDate(d, "en", "UTC", opts)).toBe("03:00");
    expect(formatDate(d, "en", "America/Guayaquil", opts)).toBe("22:00");
  });

  it("nombra el huso horario", () => {
    expect(
      formatTimeZone(
        "America/Guayaquil",
        "en",
        new Date("2026-01-15T00:00:00Z"),
      ),
    ).toBe("GMT-5");
  });

  it("valida idiomas", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
