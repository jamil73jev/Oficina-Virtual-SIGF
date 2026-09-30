import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { aplicarMigraciones, descubrirMigraciones } from "../../../scripts/migrar.mjs";

describe("scripts/migrar.mjs", () => {
  it("aplica todas las migraciones dos veces de forma idempotente", async () => {
    const cliente = await PGlite.create();
    const ejecutor = {
      preparar: () => cliente.exec(`
        create table if not exists _oficina_migraciones (
          nombre text primary key,
          aplicada_en timestamptz not null default now()
        )`),
      aplicadas: async () => {
        const r = await cliente.query<{ nombre: string }>("select nombre from _oficina_migraciones order by nombre");
        return r.rows.map((fila) => fila.nombre);
      },
      transaccion: async (fn: (tx: { ejecutar(sql: string): Promise<unknown>; registrar(nombre: string): Promise<unknown> }) => Promise<void>) => {
        await cliente.exec("begin");
        try {
          await fn({
            ejecutar: (sql) => cliente.exec(sql),
            registrar: (nombre) => cliente.query("insert into _oficina_migraciones (nombre) values ($1)", [nombre]),
          });
          await cliente.exec("commit");
        } catch (error) {
          await cliente.exec("rollback");
          throw error;
        }
      },
    };
    try {
      const migraciones = await descubrirMigraciones();
      expect(await aplicarMigraciones(ejecutor, migraciones)).toHaveLength(migraciones.length);
      expect(await aplicarMigraciones(ejecutor, migraciones)).toEqual([]);
      expect(await ejecutor.aplicadas()).toHaveLength(migraciones.length);
    } finally {
      await cliente.close();
    }
  }, 60_000);
});
