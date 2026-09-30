import { describe, expect, it } from "vitest";
import { EventoTraza, type PublicadorTraza } from "@/orchestration/traza/eventos";
import { PublicadorTrazaMemoria, obtenerPublicadorTraza } from "@/orchestration/traza/memoria";

const ORG_A = "org-a";
const ORG_B = "org-b";
const OP = "11111111-1111-4111-8111-111111111111";
const OP2 = "22222222-2222-4222-8222-222222222222";

const evento = (orgId: string, operacionId = OP, titulo = "paso") =>
  ({ orgId, operacionId, tipo: "agente_inicia", titulo, agenteId: "cartera" }) as const;

async function publicarN(p: PublicadorTraza, n: number, orgId = ORG_A, operacionId = OP) {
  for (let i = 0; i < n; i++) await p.publicar(evento(orgId, operacionId, `paso ${i + 1}`));
}

describe("PublicadorTrazaMemoria", () => {
  it("asigna id, ts y secuencia contigua por operacion, y cumple el contrato", async () => {
    const p = new PublicadorTrazaMemoria();
    await publicarN(p, 3);
    await publicarN(p, 2, ORG_A, OP2);
    const eventos = await p.listar(ORG_A, OP);
    expect(eventos.map((e) => e.secuencia)).toEqual([1, 2, 3]);
    expect((await p.listar(ORG_A, OP2)).map((e) => e.secuencia)).toEqual([1, 2]);
    for (const e of eventos) expect(EventoTraza.safeParse(e).success).toBe(true);
    expect(new Set(eventos.map((e) => e.id)).size).toBe(3);
  });

  it("publicaciones concurrentes no dejan huecos ni repeticiones", async () => {
    const p = new PublicadorTrazaMemoria();
    await Promise.all(Array.from({ length: 50 }, (_, i) => p.publicar(evento(ORG_A, OP, `e${i}`))));
    expect((await p.listar(ORG_A, OP)).map((e) => e.secuencia)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("un evento invalido se rechaza sin ocupar secuencia", async () => {
    const p = new PublicadorTrazaMemoria();
    await p.publicar(evento(ORG_A));
    await expect(p.publicar({ ...evento(ORG_A), titulo: "" })).rejects.toThrow();
    await expect(p.publicar({ ...evento(ORG_A), operacionId: "no-uuid" })).rejects.toThrow();
    const e = await p.publicar(evento(ORG_A));
    expect(e.secuencia).toBe(2);
  });

  it("listar filtra por secuencia (Last-Event-ID) y devuelve copias", async () => {
    const p = new PublicadorTrazaMemoria();
    await publicarN(p, 5);
    const desde3 = await p.listar(ORG_A, OP, 3);
    expect(desde3.map((e) => e.secuencia)).toEqual([4, 5]);
    (desde3[0] as { titulo: string }).titulo = "alterado";
    expect((await p.listar(ORG_A, OP, 3))[0]?.titulo).toBe("paso 4");
  });

  it("aislamiento estricto por orgId en listar y suscribir", async () => {
    const p = new PublicadorTrazaMemoria();
    const recibidosB: unknown[] = [];
    const cancelarB = p.suscribir(ORG_B, OP, (e) => recibidosB.push(e));
    await publicarN(p, 3, ORG_A);
    expect(await p.listar(ORG_B, OP)).toEqual([]);
    expect(recibidosB).toEqual([]);
    // La misma operacionId en otra org es otra traza, con su propia secuencia.
    const deB = await p.publicar(evento(ORG_B));
    expect(deB.secuencia).toBe(1);
    expect(recibidosB).toHaveLength(1);
    expect((await p.listar(ORG_A, OP)).every((e) => e.orgId === ORG_A)).toBe(true);
    cancelarB();
  });

  it("suscripcion en vivo; un oyente que falla no impide notificar a los demas", async () => {
    const p = new PublicadorTrazaMemoria();
    const recibidos: number[] = [];
    const c1 = p.suscribir(ORG_A, OP, () => {
      throw new Error("oyente roto");
    });
    const c2 = p.suscribir(ORG_A, OP, (e) => recibidos.push(e.secuencia));
    await publicarN(p, 2);
    expect(recibidos).toEqual([1, 2]);
    c1();
    c2();
  });

  it("cancelar libera oyentes y entradas vacias: sin fugas de memoria", async () => {
    const p = new PublicadorTrazaMemoria();
    const cancelaciones = Array.from({ length: 100 }, (_, i) =>
      p.suscribir(ORG_A, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, () => {}),
    );
    expect(p.suscriptoresActivos()).toBe(100);
    expect(p.operacionesRetenidas).toBe(100);
    for (const c of cancelaciones) c();
    expect(p.suscriptoresActivos()).toBe(0);
    expect(p.operacionesRetenidas).toBe(0);

    // Con eventos la traza se conserva, pero el oyente se libera; cancelar dos veces es inocuo.
    const recibidos: unknown[] = [];
    const cancelar = p.suscribir(ORG_A, OP, (e) => recibidos.push(e));
    await publicarN(p, 1);
    expect(p.suscriptoresActivos(ORG_A, OP)).toBe(1);
    cancelar();
    cancelar();
    expect(p.suscriptoresActivos(ORG_A, OP)).toBe(0);
    await publicarN(p, 1);
    expect(recibidos).toHaveLength(1);
    expect(await p.listar(ORG_A, OP)).toHaveLength(2);
  });

  it("retencion acotada: descarta las operaciones antiguas sin suscriptores", async () => {
    const p = new PublicadorTrazaMemoria({ maxOperaciones: 2 });
    const cancelar = p.suscribir(ORG_A, OP, () => {});
    await publicarN(p, 1, ORG_A, OP);
    await publicarN(p, 1, ORG_A, OP2);
    await publicarN(p, 1, ORG_A, "33333333-3333-4333-8333-333333333333");
    expect(p.operacionesRetenidas).toBe(2);
    expect(await p.listar(ORG_A, OP)).toHaveLength(1);
    expect(await p.listar(ORG_A, OP2)).toEqual([]);
    cancelar();
  });

  it("obtenerPublicadorTraza es un singleton por proceso", () => {
    expect(obtenerPublicadorTraza()).toBe(obtenerPublicadorTraza());
    expect(obtenerPublicadorTraza()).toBeInstanceOf(PublicadorTrazaMemoria);
  });
});
