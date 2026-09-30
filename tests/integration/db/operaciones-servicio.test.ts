import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verificarCadena } from "@/core/audit";
import { AuditoriaDrizzleRepo } from "@/core/audit/repo-drizzle";
import { reiniciarUnicosParaPruebas } from "@/core/db/persistencia";
import { RepositorioEjecucionesDrizzle } from "@/modules/agentes-area/repo-drizzle";
import { crearServicioOperaciones, type ServicioOperaciones } from "@/modules/operaciones";
import type { EventoTraza } from "@/orchestration/traza/eventos";
import { PublicadorTrazaPostgres } from "@/orchestration/traza/postgres";
import { TIMEOUT_ARRANQUE, crearBdPrueba, type BdPrueba } from "./pglite";

// Una operacion completa sobre PGlite tarda ~5 s aislada y mas con toda la suite en paralelo:
// el limite por defecto de Vitest (5 s) la cortaba sin que hubiera ningun fallo real.
vi.setConfig({ testTimeout: 60_000 });

/**
 * La Sala de operaciones completa sobre Postgres (fabrica con PERSISTENCIA=drizzle y PGlite):
 * operacion, traza, tareas, ejecuciones, artefactos, presupuesto y auditoria persistidos, y la
 * misma instantanea ligera y detalle bajo demanda que en memoria.
 */
const ENCARGO = "Analiza la cartera vencida y propon como priorizar la cobranza";

let bd: BdPrueba;
let orgId: string;
let drizzle: ServicioOperaciones;
let memoria: ServicioOperaciones;

beforeAll(async () => {
  bd = await crearBdPrueba();
  orgId = (await bd.nuevaOrg()).orgId;
  reiniciarUnicosParaPruebas();
  drizzle = crearServicioOperaciones({ env: { PERSISTENCIA: "drizzle" }, db: () => bd.db });
  memoria = crearServicioOperaciones({ env: {} });
}, TIMEOUT_ARRANQUE);
afterAll(async () => {
  reiniciarUnicosParaPruebas();
  await bd.cerrar();
});

async function correr(servicio: ServicioOperaciones) {
  const ctx = { orgId, usuarioId: "usuario-a" };
  const { operacionId } = await servicio.encargar(ENCARGO, "es", ctx);
  await servicio.esperar(orgId, operacionId);
  return operacionId;
}

/** Forma comparable entre implementaciones (sin ids, tiempos ni duraciones). */
const forma = (eventos: readonly EventoTraza[]) =>
  eventos.map((e) => ({ secuencia: e.secuencia, tipo: e.tipo, agenteId: e.agenteId ?? null, estado: e.estado ?? null }));

describe("ServicioOperaciones sobre Postgres (fabrica drizzle)", () => {
  it("usa el publicador Postgres y persiste la operacion y su traza", async () => {
    expect(drizzle.publicador).toBeInstanceOf(PublicadorTrazaPostgres);
    const operacionId = await correr(drizzle);
    const registro = await drizzle.obtenerRegistro(orgId, operacionId);
    expect(registro?.estado).not.toBe("en_curso");
    const { rows } = await bd.comoPropietario(() =>
      bd.client.query<{ n: number; ultima: number }>(
        "select (select count(*)::int from evento_traza where operacion_id = $1) as n, (select ultima_secuencia from operacion where id = $1) as ultima",
        [operacionId],
      ),
    );
    expect(rows[0]?.n).toBeGreaterThan(3);
    expect(rows[0]?.ultima).toBe(rows[0]?.n);
    // Ejecuciones y auditoria encadenada tambien en Postgres.
    expect((await new RepositorioEjecucionesDrizzle(bd.db).listar(orgId)).length).toBeGreaterThan(0);
    const cadena = await new AuditoriaDrizzleRepo(bd.db).listar(orgId);
    expect(cadena.map((e) => e.accion)).toContain("operacion.creada");
    expect(verificarCadena(orgId, cadena).valida).toBe(true);
  });

  it("instantanea ligera, detalle bajo demanda y entregable: igual que en memoria", async () => {
    const opD = await correr(drizzle);
    const opM = await correr(memoria);

    const completaD = await drizzle.obtenerInstantanea(orgId, opD, true);
    const completaM = await memoria.obtenerInstantanea(orgId, opM, true);
    expect(completaD?.estado).toBe(completaM?.estado);
    expect(forma(completaD?.eventos ?? [])).toEqual(forma(completaM?.eventos ?? []));

    const ligeraD = await drizzle.obtenerInstantanea(orgId, opD, false);
    const ligeraM = await memoria.obtenerInstantanea(orgId, opM, false);
    expect(forma(ligeraD?.eventos ?? [])).toEqual(forma(ligeraM?.eventos ?? []));
    const tablaLigera = ligeraD?.eventos.find((e) => e.tipo === "tabla");
    expect(tablaLigera?.detalle).toMatchObject({
      ligero: true,
      referencia: `/api/operaciones/${opD}/eventos/${tablaLigera?.secuencia}`,
    });

    // Detalle bajo demanda: el evento persistido completo, igual al de la instantanea completa.
    const detalle = await drizzle.obtenerEvento(orgId, opD, tablaLigera?.secuencia as number);
    expect(detalle).toEqual(completaD?.eventos.find((e) => e.secuencia === tablaLigera?.secuencia));
    expect(Array.isArray(detalle?.detalle?.tablas)).toBe(true);

    const entregableD = await drizzle.obtenerEntregable(orgId, opD);
    const entregableM = await memoria.obtenerEntregable(orgId, opM);
    expect(typeof entregableD).toBe("string");
    expect(entregableD?.length).toBeGreaterThan(0);
    expect(entregableM === null).toBe(entregableD === null);
  });

  it("otra organizacion no ve la operacion ni sus eventos", async () => {
    const opD = await correr(drizzle);
    const otra = (await bd.nuevaOrg()).orgId;
    expect(await drizzle.obtenerInstantanea(otra, opD)).toBeNull();
    expect(await drizzle.obtenerEvento(otra, opD, 1)).toBeNull();
    expect(await drizzle.obtenerEntregable(otra, opD)).toBeNull();
  });

  it("una segunda instancia (otro proceso) lee la misma operacion desde Postgres", async () => {
    const opD = await correr(drizzle);
    reiniciarUnicosParaPruebas();
    const otraInstancia = crearServicioOperaciones({ env: { PERSISTENCIA: "drizzle" }, db: () => bd.db });
    const instantanea = await otraInstancia.obtenerInstantanea(orgId, opD);
    expect(forma(instantanea?.eventos ?? [])).toEqual(forma((await drizzle.obtenerInstantanea(orgId, opD))?.eventos ?? []));
  });
});
