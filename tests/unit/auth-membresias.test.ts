import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BaseDatos } from "@/core/db";
import { MembresiasMemoriaRepo, type MembresiasRepo } from "@/core/auth/membresias";
import { MembresiasDrizzleRepo } from "@/core/auth/membresias-drizzle";
import { crearBdPrueba, TIMEOUT_ARRANQUE, type BdPrueba, type OrgSembrada } from "../integration/db/pglite";

/** Contrato del puerto de membresias: memoria y Drizzle (PGlite en proceso, sin red). */
describe("MembresiasDrizzleRepo contra PGlite (rol app_rw)", () => {
  let bd: BdPrueba;
  let a: OrgSembrada;
  let b: OrgSembrada;
  let repo: MembresiasRepo;

  beforeAll(async () => {
    bd = await crearBdPrueba();
    a = await bd.nuevaOrg();
    b = await bd.nuevaOrg();
    await bd.comoPropietario(async () => {
      await bd.client.query("INSERT INTO membresia (usuario_id, org_id, rol) VALUES ($1, $2, 'owner'), ($3, $4, 'viewer')", [
        a.usuarios[0],
        a.orgId,
        b.usuarios[0],
        b.orgId,
      ]);
    });
    repo = new MembresiasDrizzleRepo(bd.db as unknown as BaseDatos);
  }, TIMEOUT_ARRANQUE);

  afterAll(async () => {
    await bd?.cerrar();
  });

  it("devuelve solo las membresias del usuario, con su rol", async () => {
    expect(await repo.listarPorUsuario(a.usuarios[0])).toEqual([
      { usuarioId: a.usuarios[0], orgId: a.orgId, rol: "owner" },
    ]);
    expect(await repo.listarPorUsuario(b.usuarios[0])).toEqual([
      { usuarioId: b.usuarios[0], orgId: b.orgId, rol: "viewer" },
    ]);
  });

  it("usuario sin membresia o inexistente: lista vacia", async () => {
    expect(await repo.listarPorUsuario(a.usuarios[1])).toEqual([]);
    expect(await repo.listarPorUsuario("00000000-0000-4000-8000-00000000dead")).toEqual([]);
  });

  it("varias organizaciones: ordenadas por orgId", async () => {
    await bd.comoPropietario(async () => {
      await bd.client.query("INSERT INTO membresia (usuario_id, org_id, rol) VALUES ($1, $2, 'admin')", [
        a.usuarios[0],
        b.orgId,
      ]);
    });
    const orgs = (await repo.listarPorUsuario(a.usuarios[0])).map((m) => m.orgId);
    expect(orgs).toEqual([a.orgId, b.orgId].sort());
  });
});

describe("MembresiasMemoriaRepo", () => {
  it("filtra por usuario y no comparte referencias", async () => {
    const repo = new MembresiasMemoriaRepo([
      { usuarioId: "u", orgId: "o2", rol: "viewer" },
      { usuarioId: "u", orgId: "o1", rol: "admin" },
      { usuarioId: "v", orgId: "o1", rol: "owner" },
    ]);
    const lista = await repo.listarPorUsuario("u");
    expect(lista.map((m) => m.orgId)).toEqual(["o1", "o2"]);
    lista[0]!.rol = "owner";
    expect((await repo.listarPorUsuario("u"))[0]!.rol).toBe("admin");
  });
});
