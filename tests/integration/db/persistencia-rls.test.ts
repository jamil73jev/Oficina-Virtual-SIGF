import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enTransaccionOrg } from "@/core/db";
import { leerSqlEndurecimiento } from "@/core/db/migrar";
import { DocumentosDrizzleRepo } from "@/modules/documentos/repo-drizzle";
import { RepositorioOperacionesDrizzle } from "@/modules/operaciones/repo-drizzle";
import { ProyectosDrizzleRepo } from "@/modules/proyectos/repo-drizzle";
import { PublicadorTrazaPostgres } from "@/orchestration/traza/postgres";
import { TIMEOUT_ARRANQUE, aplicarEsquema } from "./pglite";

/**
 * Simula Supabase: la cuenta de conexion ("cuenta_conexion", como "postgres" en el pooler)
 * NO es superusuario, es propietaria de las tablas (aplica las migraciones) y tiene BYPASSRLS.
 * Sin SET LOCAL ROLE app_rw veria todas las organizaciones; con enTransaccionOrg, RLS aplica.
 */
const TABLAS_RLS = [
  "artefacto",
  "documento",
  "documento_version",
  "ejecucion",
  "evento_traza",
  "mensaje",
  "operacion",
  "proyecto",
  "tarea",
];

let client: PGlite;
let db: PgliteDatabase;

interface Org {
  orgId: string;
  usuarioId: string;
  proyectoId: string;
}

async function sembrarOrg(): Promise<Org> {
  const o = { orgId: randomUUID(), usuarioId: randomUUID(), proyectoId: randomUUID() };
  await client.query("insert into organizacion (id, nombre, huso, moneda, locale) values ($1, 'o', 'UTC', 'USD', 'es')", [o.orgId]);
  await client.query("insert into usuario (id, email) values ($1, $2)", [o.usuarioId, `${o.usuarioId}@prueba.test`]);
  await client.query("insert into proyecto (id, org_id, objetivo, owner_id) values ($1, $2, 'objetivo', $3)", [
    o.proyectoId,
    o.orgId,
    o.usuarioId,
  ]);
  return o;
}

beforeAll(async () => {
  client = await PGlite.create();
  const { rows } = await client.query<{ db: string }>("select current_database() as db");
  const baseDatos = rows[0]?.db as string;
  await client.exec(`
    CREATE ROLE cuenta_conexion NOLOGIN CREATEROLE BYPASSRLS;
    GRANT CREATE ON DATABASE "${baseDatos}" TO cuenta_conexion;
    GRANT CREATE, USAGE ON SCHEMA public TO cuenta_conexion;
    SET SESSION AUTHORIZATION cuenta_conexion;
  `);
  // La cuenta de conexion aplica TODO el esquema (drizzle-kit + sql/) y queda como propietaria.
  await aplicarEsquema(client);
  db = drizzle(client);
}, TIMEOUT_ARRANQUE);
afterAll(() => client.close());

describe("RLS con una cuenta de conexion que se salta RLS (como postgres en Supabase)", () => {
  it("el esquema se aplica como no superusuario, es idempotente y concede app_rw a la cuenta", async () => {
    const quien = await client.query<{ session_user: string; current_user: string; es_super: boolean }>(
      "select session_user, current_user, (select rolsuper from pg_roles where rolname = current_user) as es_super",
    );
    expect(quien.rows[0]).toEqual({ session_user: "cuenta_conexion", current_user: "cuenta_conexion", es_super: false });
    for (const { sql: texto } of await leerSqlEndurecimiento()) await client.exec(texto);
    const miembro = await client.query<{ m: boolean }>("select pg_has_role('cuenta_conexion', 'app_rw', 'MEMBER') as m");
    expect(miembro.rows[0]?.m).toBe(true);
    const rls = await client.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_policies p on p.tablename = c.relname
        where c.relrowsecurity and p.policyname = c.relname || '_org' and 'app_rw' = any(p.roles)
        order by 1`,
    );
    expect(rls.rows.map((r) => r.relname)).toEqual(TABLAS_RLS);
  });

  it("sin cambiar de rol la cuenta ve todo (por eso la aplicacion nunca consulta asi)", async () => {
    const a = await sembrarOrg();
    const b = await sembrarOrg();
    const { rows } = await client.query<{ n: number }>(
      "select count(*)::int as n from proyecto where org_id in ($1, $2)",
      [a.orgId, b.orgId],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it("enTransaccionOrg cambia a app_rw dentro de la transaccion y vuelve al terminar", async () => {
    const { orgId } = await sembrarOrg();
    const dentro = await enTransaccionOrg(db, orgId, async (tx) => {
      const r = (await tx.execute(
        sql`select current_user as usuario, current_setting('app.org_id', true) as org`,
      )) as unknown as { rows: { usuario: string; org: string }[] };
      return r.rows[0];
    });
    expect(dentro).toEqual({ usuario: "app_rw", org: orgId });
    const fuera = await client.query<{ usuario: string; org: string | null }>(
      "select current_user as usuario, nullif(current_setting('app.org_id', true), '') as org",
    );
    expect(fuera.rows[0]).toEqual({ usuario: "cuenta_conexion", org: null });
  });

  it("un usuario de otra organizacion no ve ni toca filas ajenas, aun sin WHERE", async () => {
    const a = await sembrarOrg();
    const b = await sembrarOrg();
    const proyectos = new ProyectosDrizzleRepo(db);
    const tareaA = {
      id: randomUUID(),
      orgId: a.orgId,
      proyectoId: a.proyectoId,
      padreId: null,
      agenteId: null,
      estado: "pendiente" as const,
      criteriosVerificacion: [],
      deps: [],
    };
    await proyectos.crearTarea(tareaA);
    const operaciones = new RepositorioOperacionesDrizzle(db);
    const opA = randomUUID();
    await operaciones.crear({
      operacionId: opA,
      orgId: a.orgId,
      usuarioId: a.usuarioId,
      texto: "t",
      idioma: "es",
      estado: "en_curso",
      creadaEn: new Date().toISOString(),
    });
    await new PublicadorTrazaPostgres(db).publicar({ orgId: a.orgId, operacionId: opA, tipo: "comentario", titulo: "privado" });

    // Por los repos: la org B no ve nada de A.
    expect(await proyectos.obtenerProyecto(b.orgId, a.proyectoId)).toBeNull();
    expect(await proyectos.listarTareas(b.orgId, a.proyectoId)).toEqual([]);
    expect(await operaciones.obtener(b.orgId, opA)).toBeNull();
    expect(await new PublicadorTrazaPostgres(db).listar(b.orgId, opA)).toEqual([]);

    // Consultas crudas SIN filtro por org dentro de la transaccion de B: RLS filtra igual.
    const visto = await enTransaccionOrg(db, b.orgId, async (tx) => {
      const cuenta = async (tabla: string) =>
        (
          (await tx.execute(sql.raw(`select count(*)::int as n from ${tabla} where org_id <> '${b.orgId}'`))) as unknown as {
            rows: { n: number }[];
          }
        ).rows[0]?.n;
      return {
        proyecto: await cuenta("proyecto"),
        tarea: await cuenta("tarea"),
        operacion: await cuenta("operacion"),
        evento_traza: await cuenta("evento_traza"),
      };
    });
    expect(visto).toEqual({ proyecto: 0, tarea: 0, operacion: 0, evento_traza: 0 });

    // UPDATE ajeno: 0 filas. INSERT con org ajena: lo rechaza la politica (WITH CHECK).
    const tocadas = await enTransaccionOrg(db, b.orgId, (tx) =>
      tx.execute(sql`update tarea set estado = 'fallida' where id = ${tareaA.id}`),
    );
    expect((tocadas as unknown as { affectedRows?: number }).affectedRows ?? 0).toBe(0);
    expect((await proyectos.obtenerTarea(a.orgId, tareaA.id))?.estado).toBe("pendiente");
    await expect(
      enTransaccionOrg(db, b.orgId, (tx) =>
        tx.execute(sql`insert into tarea (org_id, proyecto_id) values (${a.orgId}, ${a.proyectoId})`),
      ),
    ).rejects.toSatisfy((e: Error & { cause?: Error }) => /row-level security/.test(String(e.cause?.message ?? e.message)));
  });

  it("sin app.org_id no se ve nada (fail-closed)", async () => {
    await sembrarOrg();
    const n = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_rw`);
      return (await tx.execute<{ n: number }>(sql`select count(*)::int as n from proyecto`)).rows[0]?.n;
    });
    expect(n).toBe(0);
  });

  it("documentos: la FK compuesta impide colgar un documento de un proyecto de otra org", async () => {
    const a = await sembrarOrg();
    const b = await sembrarOrg();
    const repo = new DocumentosDrizzleRepo(db);
    const version = {
      id: randomUUID(),
      orgId: b.orgId,
      proyectoId: a.proyectoId,
      tareaId: null,
      blobUrl: "memory://x",
      hash: "a".repeat(64),
      version: 1,
      tipo: "text/plain",
      nombre: "x.txt",
      tamano: 1,
      creadoEn: new Date().toISOString(),
      creadoPor: b.usuarioId,
    };
    const error = await repo.crear(version).then(
      () => null,
      (e: unknown) => e as Error & { cause?: Error },
    );
    expect(String(error?.cause?.message ?? error?.message)).toMatch(/documento_proyecto_org_fk/);
    await repo.crear({ ...version, proyectoId: b.proyectoId });
    expect(await repo.obtener(a.orgId, version.id)).toBeNull();
    // El historial de versiones es inmutable incluso para la cuenta propietaria.
    await expect(
      client.query("update documento_version set nombre = 'x' where documento_id = $1", [version.id]),
    ).rejects.toThrow(/inmutable/);
  });
});
