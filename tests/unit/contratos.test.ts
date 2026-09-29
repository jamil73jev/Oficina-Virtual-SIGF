import { describe, expect, it } from "vitest";
import { Agente, Membresia, Organizacion, Presupuesto, Rol } from "@/types";

const u = "123e4567-e89b-42d3-a456-426614174000";

describe("contratos Zod", () => {
  it("acepta una organizacion valida y rechaza moneda invalida", () => {
    const base = { id: u, nombre: "Acme", huso: "America/Guayaquil", moneda: "USD", locale: "es" };
    expect(Organizacion.safeParse(base).success).toBe(true);
    expect(Organizacion.safeParse({ ...base, moneda: "DOLAR" }).success).toBe(false);
  });

  it("restringe los roles de membresia", () => {
    expect(Rol.options).toEqual(["owner", "admin", "supervisor", "viewer"]);
    expect(Membresia.safeParse({ usuarioId: u, orgId: u, rol: "root" }).success).toBe(false);
  });

  it("exige orgId en agente", () => {
    const a = {
      id: u,
      rol: "qa",
      skills: [],
      herramientasPermitidas: [],
      modelo: "m",
      presupuestoId: null,
      estado: "activo",
      promptVersion: 1,
    };
    expect(Agente.safeParse(a).success).toBe(false);
    expect(Agente.safeParse({ ...a, orgId: u }).success).toBe(true);
  });

  it("rechaza consumo negativo en presupuesto", () => {
    const p = {
      id: u,
      orgId: u,
      ambito: "org",
      topeTokens: 1,
      topeCosto: 1,
      topeIteraciones: 1,
      consumido: { tokens: -1, costo: 0, iteraciones: 0 },
      periodo: "2026-09",
    };
    expect(Presupuesto.safeParse(p).success).toBe(false);
  });
});
