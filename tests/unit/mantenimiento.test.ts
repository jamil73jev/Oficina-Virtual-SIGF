import { describe, expect, it, vi } from "vitest";
import type { BaseDatos } from "@/core/db";
import { crearManejadorMantenimiento, secretoValido } from "@/modules/mantenimiento";

const SECRETO = "secreto-de-prueba-0123456789";
const peticion = (auth?: string) =>
  new Request("http://localhost/api/mantenimiento", { headers: auth ? { authorization: auth } : {} });

function dbFalsa() {
  const execute = vi.fn().mockResolvedValue([]);
  return { db: { execute } as unknown as BaseDatos, execute };
}

describe("mantenimiento diario", () => {
  it("secretoValido exige el secreto exacto y una longitud minima", () => {
    expect(secretoValido(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
    expect(secretoValido(`Bearer ${SECRETO}x`, SECRETO)).toBe(false);
    expect(secretoValido(SECRETO, SECRETO)).toBe(false); // sin el prefijo Bearer
    expect(secretoValido(null, SECRETO)).toBe(false);
    expect(secretoValido("Bearer corto", "corto")).toBe(false); // secreto demasiado corto
    expect(secretoValido(`Bearer ${SECRETO}`, undefined)).toBe(false);
  });

  it("sin CRON_SECRET configurado rechaza todo, incluso una cabecera vacia", async () => {
    const { db, execute } = dbFalsa();
    const manejar = crearManejadorMantenimiento({ env: {}, db: () => db });
    expect((await manejar(peticion("Bearer "))).status).toBe(401);
    expect((await manejar(peticion())).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it("con un secreto incorrecto responde 401 y no toca la base", async () => {
    const { db, execute } = dbFalsa();
    const purgar = vi.fn();
    const manejar = crearManejadorMantenimiento({ env: { CRON_SECRET: SECRETO }, db: () => db, purgar });
    const r = await manejar(peticion("Bearer otro-secreto-distinto-123"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "no_autorizado" });
    expect(execute).not.toHaveBeenCalled();
    expect(purgar).not.toHaveBeenCalled();
  });

  it("con el secreto correcto hace la consulta de actividad y la purga", async () => {
    const { db, execute } = dbFalsa();
    const purgar = vi.fn().mockResolvedValue(7);
    const manejar = crearManejadorMantenimiento({ env: { CRON_SECRET: SECRETO }, db: () => db, purgar });
    const r = await manejar(peticion(`Bearer ${SECRETO}`));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, eventosPurgados: 7 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(purgar).toHaveBeenCalledWith(db);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("un fallo interno responde 503 sin filtrar el mensaje del error", async () => {
    const manejar = crearManejadorMantenimiento({
      env: { CRON_SECRET: SECRETO },
      db: () => {
        throw new Error("password authentication failed for user postgres.abcdef");
      },
    });
    const r = await manejar(peticion(`Bearer ${SECRETO}`));
    expect(r.status).toBe(503);
    const cuerpo = JSON.stringify(await r.json());
    expect(cuerpo).toBe('{"error":"mantenimiento_fallido"}');
    expect(cuerpo).not.toMatch(/password|postgres/i);
  });
});
