import { describe, expect, it } from "vitest";
import { reservar } from "./guard";
import type { AmbitoGuard, EstadoPresupuesto } from "./types";

const mk = (ambito: AmbitoGuard, tope: number, tokens = 0): EstadoPresupuesto => ({
  ambito,
  tope: { tokens: tope, costo: 0, iteraciones: 0 },
  consumido: { tokens, costo: 0, iteraciones: 0 },
});
const est = { tokens: 10, costo: 0, iteraciones: 0 };

describe("reservar", () => {
  it("reserva en todos los ambitos sin mutar la entrada", () => {
    const entrada = [mk("agente", 100), mk("org", 1000)];
    const r = reservar(entrada, est);
    expect(r.ok && r.siguiente.map((s) => s.consumido.tokens)).toEqual([10, 10]);
    expect(entrada[0]?.consumido.tokens).toBe(0);
  });
  it("permite llegar exactamente al tope", () => {
    expect(reservar([mk("agente", 10)], est).ok).toBe(true);
  });
  it("es atomico: si un ambito excede, no reserva ninguno", () => {
    const r = reservar([mk("agente", 100), mk("proyecto", 15, 10)], est);
    expect(r).toEqual({ ok: false, excedidos: ["proyecto"] });
  });
  it("avisa al 80 %", () => {
    const r = reservar([mk("agente", 100, 70)], est);
    expect(r.ok && r.avisos).toEqual(["agente"]);
  });
  it("tope 0 NO significa sin tope: bloquea consumo positivo (fail-closed)", () => {
    expect(reservar([mk("org", 0, 0)], est)).toEqual({ ok: false, excedidos: ["org"] });
    expect(reservar([mk("org", 0, 999)], est).ok).toBe(false);
  });
  it("tope 0 admite un consumo estimado 0 y topes invalidos bloquean", () => {
    expect(reservar([mk("org", 0)], { tokens: 0, costo: 0, iteraciones: 0 }).ok).toBe(true);
    expect(reservar([mk("org", -5)], est).ok).toBe(false);
    expect(reservar([mk("org", Number.NaN)], est).ok).toBe(false);
  });
});
