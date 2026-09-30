import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RepositorioOperacionesDrizzle } from "@/modules/operaciones/repo-drizzle";
import { DIAS_RETENCION_TRAZA, PublicadorTrazaPostgres, purgarEventosAntiguos } from "@/orchestration/traza/postgres";
import { TIMEOUT_ARRANQUE, crearBdPrueba, type BdPrueba } from "./pglite";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date(Date.UTC(2026, 8, 30, 12, 0, 0));

let bd: BdPrueba;
beforeAll(async () => {
  bd = await crearBdPrueba();
}, TIMEOUT_ARRANQUE);
afterAll(() => bd.cerrar());

/** Publica un evento con `ts` = AHORA - diasAtras. */
async function publicarHace(orgId: string, operacionId: string, diasAtras: number) {
  const p = new PublicadorTrazaPostgres(bd.db, { ahora: () => new Date(AHORA.getTime() - diasAtras * DIA) });
  return p.publicar({ orgId, operacionId, tipo: "comentario", titulo: `hace ${diasAtras} dias` });
}

async function operacionCon(orgId: string, dias: number[]) {
  const operacionId = randomUUID();
  await new RepositorioOperacionesDrizzle(bd.db).crear({
    operacionId,
    orgId,
    usuarioId: "u",
    texto: "t",
    idioma: "es",
    estado: "completada",
    creadaEn: AHORA.toISOString(),
  });
  for (const d of dias) await publicarHace(orgId, operacionId, d);
  return operacionId;
}

describe("retencion de la traza: purgarEventosAntiguos", () => {
  it("por defecto conserva 30 dias y borra lo anterior de TODAS las organizaciones", async () => {
    expect(DIAS_RETENCION_TRAZA).toBe(30);
    const a = await bd.nuevaOrg();
    const b = await bd.nuevaOrg();
    const opA = await operacionCon(a.orgId, [45, 31, 29, 1]);
    const opB = await operacionCon(b.orgId, [90, 0]);
    // Mantenimiento: corre con la cuenta de conexion (propietaria), no con app_rw.
    const borrados = await bd.comoPropietario(() => purgarEventosAntiguos(bd.db, undefined, AHORA));
    expect(borrados).toBeGreaterThanOrEqual(3);
    const lector = new PublicadorTrazaPostgres(bd.db);
    expect((await lector.listar(a.orgId, opA)).map((e) => e.titulo)).toEqual(["hace 29 dias", "hace 1 dias"]);
    expect((await lector.listar(b.orgId, opB)).map((e) => e.titulo)).toEqual(["hace 0 dias"]);
    // Tras purgar, la numeracion sigue siendo creciente (no reutiliza secuencias).
    expect((await publicarHace(a.orgId, opA, 0)).secuencia).toBe(5);
  });

  it("respeta dias y ahora explicitos, y es idempotente", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await operacionCon(orgId, [10, 5, 2]);
    await bd.comoPropietario(() => purgarEventosAntiguos(bd.db, 30, AHORA));
    // La purga es global: tambien borra lo que otras pruebas dejaron con mas de 7 dias.
    expect(await bd.comoPropietario(() => purgarEventosAntiguos(bd.db, 7, AHORA))).toBeGreaterThanOrEqual(1);
    expect(await bd.comoPropietario(() => purgarEventosAntiguos(bd.db, 7, AHORA))).toBe(0);
    expect((await new PublicadorTrazaPostgres(bd.db).listar(orgId, op)).map((e) => e.titulo)).toEqual([
      "hace 5 dias",
      "hace 2 dias",
    ]);
  });

  it("rechaza dias no validos (nunca purga todo por error)", async () => {
    await expect(purgarEventosAntiguos(bd.db, 0, AHORA)).rejects.toThrow(/dias/);
    await expect(purgarEventosAntiguos(bd.db, 1.5, AHORA)).rejects.toThrow(/dias/);
  });

  it("el rol de aplicacion no puede borrar la traza", async () => {
    const error = await purgarEventosAntiguos(bd.db, 1, AHORA).then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error },
    );
    expect(String(error?.cause?.message ?? error?.message)).toMatch(/permission denied/);
  });
});
