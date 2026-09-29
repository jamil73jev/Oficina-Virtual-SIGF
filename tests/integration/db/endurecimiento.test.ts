import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Auditor, calcularHash, verificarCadena, type EntradaAuditoria } from "@/core/audit";
import { AuditoriaDrizzleRepo } from "@/core/audit/repo-drizzle";
import { PresupuestoDrizzleRepo } from "@/core/budget/repo-drizzle";
import { leerSqlEndurecimiento } from "@/core/db/migrar";
import type { EstadoPresupuesto, Uso } from "@/orchestration/runtime";
import { TIMEOUT_ARRANQUE, crearBdPrueba, type BdPrueba } from "./pglite";

const CLAVE = "clave-hmac-de-pruebas-0123456789";
const rango = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

let bd: BdPrueba;
beforeAll(async () => {
  bd = await crearBdPrueba();
}, TIMEOUT_ARRANQUE);
afterAll(() => bd.cerrar());

/** Ejecuta SQL como app_rw dentro de una transaccion con app.org_id fijado. */
const comoApp = (orgId: string | null, sql: string, params: unknown[] = []) =>
  bd.client.transaction(async (tx) => {
    if (orgId) await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    return tx.query(sql, params);
  });

const nuevaEntrada = (orgId: string, prev: EntradaAuditoria | null, seq?: number) => {
  const base = {
    id: randomUUID(),
    orgId,
    seq: seq ?? (prev?.seq ?? 0) + 1,
    actor: "u1",
    accion: "probar",
    entidad: "x",
    antes: null,
    despues: null,
    hashPrev: prev?.hash ?? null,
    creadoEn: new Date().toISOString(),
  };
  return { ...base, hash: calcularHash(base, CLAVE) };
};

describe("SQL 0001/0002 en Postgres en proceso", () => {
  it("se aplica sin errores y es idempotente (segunda pasada)", async () => {
    await bd.comoPropietario(async () => {
      for (const { sql } of await leerSqlEndurecimiento()) await bd.client.exec(sql);
      const { rows } = await bd.client.query<{ tgname: string }>(
        "select tgname from pg_trigger where tgrelid = 'auditoria'::regclass and not tgisinternal order by 1",
      );
      expect(rows.map((r) => r.tgname)).toEqual([
        "auditoria_anexar_guard_trg",
        "auditoria_no_truncate",
        "auditoria_no_update_delete",
      ]);
      const rls = await bd.client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'auditoria'::regclass",
      );
      expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });
    const { rows } = await bd.client.query<{ current_user: string }>("select current_user");
    expect(rows[0]?.current_user).toBe("app_rw");
  });
});

describe("auditoria endurecida", () => {
  let orgId: string;
  let otraOrg: string;
  let repo: AuditoriaDrizzleRepo;
  beforeAll(async () => {
    orgId = (await bd.nuevaOrg()).orgId;
    otraOrg = (await bd.nuevaOrg()).orgId;
    repo = new AuditoriaDrizzleRepo(bd.db);
    const auditor = new Auditor(repo, { claveHmac: CLAVE });
    await auditor.anexar({ orgId, actor: "u", accion: "crear", entidad: "e" });
    await auditor.anexar({ orgId: otraOrg, actor: "u", accion: "crear", entidad: "e" });
  });

  it("UPDATE, DELETE y TRUNCATE fallan para el rol de aplicacion (permiso revocado)", async () => {
    await expect(comoApp(orgId, "update auditoria set actor = 'x'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(comoApp(orgId, "delete from auditoria")).rejects.toThrow(/permission denied/);
    await expect(comoApp(orgId, "truncate auditoria")).rejects.toThrow(/permission denied/);
    expect(await repo.listar(orgId)).toHaveLength(1);
  });

  it("aun con permisos (propietario), los triggers impiden UPDATE/DELETE/TRUNCATE", async () => {
    await bd.comoPropietario(async () => {
      await expect(bd.client.query("update auditoria set actor = 'x'")).rejects.toThrow(
        /append-only \(UPDATE/,
      );
      await expect(bd.client.query("delete from auditoria")).rejects.toThrow(
        /append-only \(DELETE/,
      );
      await expect(bd.client.query("truncate auditoria")).rejects.toThrow(
        /append-only \(TRUNCATE/,
      );
    });
  });

  it("RLS: solo se ve y se escribe la org de app.org_id", async () => {
    const propias = await comoApp(orgId, "select org_id from auditoria");
    expect(propias.rows).toEqual([{ org_id: orgId }]);
    expect((await comoApp(null, "select * from auditoria")).rows).toEqual([]);
    // Fila para otraOrg con app.org_id de orgId. El trigger (que tambien lee bajo RLS) no ve
    // la cadena ajena y la trata como vacia: con seq=1 pasa el trigger y la frena la politica.
    const insertar = (e: EntradaAuditoria) =>
      comoApp(
        orgId,
        "insert into auditoria (id, org_id, seq, actor, accion, entidad, hash_prev, hash) values ($1,$2,$3,'u','x','e',$4,$5)",
        [e.id, e.orgId, e.seq, e.hashPrev, e.hash],
      );
    await expect(insertar(nuevaEntrada(otraOrg, null))).rejects.toThrow(/row-level security/);
    const prev = (await repo.ultima(otraOrg)) as EntradaAuditoria;
    await expect(insertar(nuevaEntrada(otraOrg, prev))).rejects.toThrow(/auditoria/);
    expect(await repo.listar(otraOrg)).toHaveLength(1);
  });

  it("el trigger rechaza bifurcaciones: hash_prev ajeno o seq repetido", async () => {
    const prev = (await repo.ultima(orgId)) as EntradaAuditoria;
    await expect(repo.agregar({ ...nuevaEntrada(orgId, prev), hashPrev: "f".repeat(64) })).rejects.toThrow();
    await expect(repo.agregar(nuevaEntrada(orgId, null, prev.seq))).rejects.toThrow();
    await expect(repo.agregar(nuevaEntrada(otraOrg, null, 1))).rejects.toThrow();
    expect(verificarCadena(orgId, await repo.listar(orgId), CLAVE).valida).toBe(true);
  });

  it("anexarAtomico: N escrituras concurrentes de varios escritores, seq contiguos y cadena integra", async () => {
    const { orgId: org } = await bd.nuevaOrg();
    // Cinco "procesos" con su propio repo sobre la misma BD.
    const escritores = rango(5).map(() => new AuditoriaDrizzleRepo(bd.db));
    const N = 60;
    const r = await Promise.all(
      rango(N).map((i) =>
        (escritores[i % 5] as AuditoriaDrizzleRepo).anexarAtomico(
          { orgId: org, actor: `p${i % 5}`, accion: "x", entidad: `e:${i}`, despues: { i, token: "s" } },
          { claveHmac: CLAVE },
        ),
      ),
    );
    const lista = await repo.listar(org);
    expect(lista.map((e) => e.seq)).toEqual(rango(N));
    expect(new Set(r.map((e) => e.seq)).size).toBe(N);
    expect(verificarCadena(org, lista, CLAVE)).toEqual({ valida: true, total: N });
  });
});

describe("aprobacion: FK compuesta por org", () => {
  it("no puede apuntar a una ejecucion de otra org", async () => {
    const a = await bd.nuevaOrg();
    const b = await bd.nuevaOrg();
    await expect(
      bd.client.query(
        "insert into aprobacion (org_id, ejecucion_id, tipo, payload, riesgo, expira_en) values ($1, $2, 't', '{}', 'lectura', now())",
        [a.orgId, b.ejecucionId],
      ),
    ).rejects.toThrow(/aprobacion_ejecucion_org_fk/);
  });
});

describe("presupuesto: reserva atomica UPDATE ... WHERE consumido + estimado <= tope", () => {
  const uso = (tokens: number, costo = 0, iteraciones = 0): Uso => ({ tokens, costo, iteraciones });
  const est = (ambito: EstadoPresupuesto["ambito"], tope: Uso): EstadoPresupuesto => ({
    ambito,
    tope,
    consumido: uso(0),
  });

  it("concurrente: exactamente las que caben, en todos los ambitos o en ninguno", async () => {
    const o = await bd.nuevaOrg();
    const repo = new PresupuestoDrizzleRepo(bd.db);
    const claves = [
      { ambito: "agente", refId: o.agenteId },
      { ambito: "proyecto", refId: o.proyectoId },
      { ambito: "org", refId: o.orgId },
    ] as const;
    await repo.definir(o.orgId, claves[0], est("agente", uso(100, 100, 100)));
    await repo.definir(o.orgId, claves[1], est("proyecto", uso(1000, 100, 100)));
    await repo.definir(o.orgId, claves[2], est("org", uso(1000, 100, 100)));

    const r = await Promise.all(
      rango(25).map(() => repo.reservarAtomico(o.orgId, [...claves], uso(10, 1, 1))),
    );
    expect(r.filter((x) => x.ok)).toHaveLength(10);
    for (const c of claves) {
      expect((await repo.leer(o.orgId, c))?.consumido).toEqual(uso(100, 10, 10));
    }
    const primera = r.find((x) => x.ok);
    expect(primera?.ok && primera.siguiente.map((e) => e.ambito)).toEqual(["agente", "proyecto", "org"]);

    // Falta un ambito (otra org / inexistente): no consume nada.
    const sinProyecto = await repo.reservarAtomico(
      o.orgId,
      [claves[0], { ambito: "proyecto", refId: randomUUID() }],
      uso(0, 0, 0),
    );
    expect(sinProyecto).toEqual({ ok: false });
    // Tope 0 bloquea todo consumo positivo (fail-closed, como el guard puro).
    await repo.definir(o.orgId, claves[1], est("proyecto", uso(1000, 0, 100)));
    expect(await repo.reservarAtomico(o.orgId, [...claves], uso(0, 0.01, 0))).toEqual({ ok: false });
    expect((await repo.leer(o.orgId, claves[0]))?.consumido).toEqual(uso(100, 10, 10));
  });

  it("transaccion: un error revierte lo guardado", async () => {
    const o = await bd.nuevaOrg();
    const repo = new PresupuestoDrizzleRepo(bd.db);
    const clave = { ambito: "org", refId: o.orgId } as const;
    await repo.definir(o.orgId, clave, est("org", uso(100)));
    await expect(
      repo.transaccion(async (tx) => {
        const e = (await tx.obtener(o.orgId, clave)) as EstadoPresupuesto;
        await tx.guardar(o.orgId, clave, { ...e, consumido: uso(99) });
        throw new Error("fallo a mitad");
      }),
    ).rejects.toThrow("fallo a mitad");
    expect((await repo.leer(o.orgId, clave))?.consumido).toEqual(uso(0));
  });
});
