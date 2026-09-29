import { describe, expect, it } from "vitest";
import {
  PresupuestoMemoriaRepo,
  ServicioPresupuesto,
  type PeticionReserva,
} from "@/core/budget";
import { AccesoDenegadoError, type ContextoAcceso } from "@/core/rbac";
import type { AmbitoGuard, EstadoPresupuesto } from "@/orchestration/runtime";

const ORG = "org-a";
const OTRA = "org-b";

const est = (
  ambito: AmbitoGuard,
  tokens: number,
  consumido = 0,
): EstadoPresupuesto => ({
  ambito,
  tope: { tokens, costo: 0, iteraciones: 0 },
  consumido: { tokens: consumido, costo: 0, iteraciones: 0 },
});
const uso = (tokens: number) => ({ tokens, costo: 0, iteraciones: 0 });
const topes = (tokens: number) => ({ tokens, costo: 10, iteraciones: 100 });

const pet = (over: Partial<PeticionReserva> = {}): PeticionReserva => ({
  orgId: ORG,
  agenteId: "ag1",
  proyectoId: "pr1",
  estimado: uso(10),
  profundidad: 1,
  iteracion: 1,
  ...over,
});

const setup = (agente = 100, proyecto = 1000, org = 10000) => {
  const repo = new PresupuestoMemoriaRepo();
  repo.definir(ORG, { ambito: "agente", refId: "ag1" }, est("agente", agente));
  repo.definir(
    ORG,
    { ambito: "proyecto", refId: "pr1" },
    est("proyecto", proyecto),
  );
  repo.definir(ORG, { ambito: "org", refId: ORG }, est("org", org));
  return { repo, svc: new ServicioPresupuesto(repo) };
};
const consumido = (
  repo: PresupuestoMemoriaRepo,
  a: AmbitoGuard,
  ref: string,
  org = ORG,
) => repo.leer(org, { ambito: a, refId: ref })?.consumido.tokens;

const owner: ContextoAcceso = { usuarioId: "u1", orgId: ORG, rol: "owner" };

describe("reservar", () => {
  it("consume en los tres ambitos", async () => {
    const { repo, svc } = setup();
    expect(await svc.reservar(pet())).toEqual({ estado: "ok", avisos: [] });
    expect(consumido(repo, "agente", "ag1")).toBe(10);
    expect(consumido(repo, "proyecto", "pr1")).toBe(10);
    expect(consumido(repo, "org", ORG)).toBe(10);
  });
  it("avisa al 80 % solo en el ambito afectado", async () => {
    const { svc } = setup();
    const r = await svc.reservar(pet({ estimado: uso(80) }));
    expect(r).toEqual({ estado: "ok", avisos: ["agente"] });
  });
  it("llegar exactamente al 100 % aun se permite", async () => {
    const { svc } = setup();
    expect((await svc.reservar(pet({ estimado: uso(100) }))).estado).toBe("ok");
  });
  it("al exceder pausa, no consume nada y crea solicitud de ampliacion", async () => {
    const { repo, svc } = setup();
    await svc.reservar(pet({ estimado: uso(95) }));
    const r = await svc.reservar(pet());
    expect(r.estado).toBe("pausado");
    if (r.estado !== "pausado") return;
    expect(r.excedidos).toEqual(["agente"]);
    expect(r.solicitud).toMatchObject({
      orgId: ORG,
      tipo: "ampliacion_presupuesto",
      estado: "pendiente",
      claves: [{ ambito: "agente", refId: "ag1" }],
    });
    expect(consumido(repo, "agente", "ag1")).toBe(95);
    expect(consumido(repo, "proyecto", "pr1")).toBe(95);
    expect(consumido(repo, "org", ORG)).toBe(95);
  });
  it("no duplica solicitudes pendientes para el mismo ambito", async () => {
    const { repo, svc } = setup(5);
    const a = await svc.reservar(pet());
    const b = await svc.reservar(pet());
    expect(
      a.estado === "pausado" &&
        b.estado === "pausado" &&
        a.solicitud.id === b.solicitud.id,
    ).toBe(true);
    expect(repo.solicitudesDe(ORG)).toHaveLength(1);
  });
  it("presupuesto inexistente falla cerrado (sin_presupuesto), sin consumir nada", async () => {
    const repo = new PresupuestoMemoriaRepo();
    const svc = new ServicioPresupuesto(repo);
    expect(await svc.reservar(pet({ proyectoId: null }))).toEqual({
      estado: "rechazado",
      motivo: "sin_presupuesto",
    });
    // Falta solo el ambito proyecto: tambien se rechaza.
    const { repo: r2 } = setup();
    const svc2 = new ServicioPresupuesto(r2);
    expect((await svc2.reservar(pet({ proyectoId: "otro-pr" }))).estado).toBe("rechazado");
    expect(consumido(r2, "agente", "ag1")).toBe(0);
  });
  it("tope 0 no es sin tope: pausa y pide ampliacion", async () => {
    const { svc } = setup(0);
    expect((await svc.reservar(pet())).estado).toBe("pausado");
  });
  it("reservas concurrentes no sobrepasan el tope", async () => {
    const { repo, svc } = setup(100);
    const rs = await Promise.all(
      Array.from({ length: 15 }, () => svc.reservar(pet())),
    );
    expect(rs.filter((r) => r.estado === "ok")).toHaveLength(10);
    expect(consumido(repo, "agente", "ag1")).toBe(100);
  });
  it("tope de iteraciones del presupuesto", async () => {
    const { repo } = setup(1000);
    repo.definir(
      ORG,
      { ambito: "agente", refId: "ag1" },
      {
        ambito: "agente",
        tope: { tokens: 1000, costo: 0, iteraciones: 2 },
        consumido: { tokens: 0, costo: 0, iteraciones: 0 },
      },
    );
    repo.definir(ORG, { ambito: "proyecto", refId: "pr1" }, { ...est("proyecto", 1000), tope: { tokens: 1000, costo: 0, iteraciones: 100 } });
    repo.definir(ORG, { ambito: "org", refId: ORG }, { ...est("org", 1000), tope: { tokens: 1000, costo: 0, iteraciones: 100 } });
    const svc = new ServicioPresupuesto(repo);
    const it1 = { tokens: 1, costo: 0, iteraciones: 1 };
    expect((await svc.reservar(pet({ estimado: it1 }))).estado).toBe("ok");
    expect((await svc.reservar(pet({ estimado: it1 }))).estado).toBe("ok");
    expect((await svc.reservar(pet({ estimado: it1 }))).estado).toBe("pausado");
  });
});

describe("limites de profundidad e iteracion", () => {
  it("rechaza profundidad excedida sin tocar presupuesto", async () => {
    const { repo, svc } = setup();
    expect(await svc.reservar(pet({ profundidad: 4 }))).toEqual({
      estado: "rechazado",
      motivo: "max_profundidad",
    });
    expect((await svc.reservar(pet({ profundidad: 3 }))).estado).toBe("ok");
    expect(consumido(repo, "org", ORG)).toBe(10);
  });
  it("rechaza iteracion excedida y respeta limites personalizados", async () => {
    const { repo } = setup();
    const svc = new ServicioPresupuesto(repo, {
      maxIteraciones: 2,
      maxProfundidad: 1,
    });
    expect((await svc.reservar(pet({ iteracion: 2 }))).estado).toBe("ok");
    expect(await svc.reservar(pet({ iteracion: 3 }))).toEqual({
      estado: "rechazado",
      motivo: "max_iteraciones",
    });
    expect(await svc.reservar(pet({ profundidad: 2 }))).toEqual({
      estado: "rechazado",
      motivo: "max_profundidad",
    });
  });
});

describe("aislamiento por org", () => {
  it("el presupuesto de otra org no se ve ni se consume", async () => {
    const { repo, svc } = setup();
    repo.definir(OTRA, { ambito: "agente", refId: "ag1" }, est("agente", 5));
    // La org A usa el mismo id de agente: solo cuenta su propio presupuesto.
    expect((await svc.reservar(pet())).estado).toBe("ok");
    expect(consumido(repo, "agente", "ag1", OTRA)).toBe(0);
    // Una org sin presupuestos definidos no hereda los de otra (y falla cerrado).
    const r = await svc.reservar(pet({ orgId: "org-c", estimado: uso(1e9) }));
    expect(r).toEqual({ estado: "rechazado", motivo: "sin_presupuesto" });
  });
  it("no se puede decidir una solicitud de otra org", async () => {
    const { svc } = setup(5);
    const r = await svc.reservar(pet());
    if (r.estado !== "pausado") throw new Error("esperado pausa");
    const intruso: ContextoAcceso = {
      usuarioId: "x",
      orgId: OTRA,
      rol: "owner",
    };
    await expect(
      svc.decidirAmpliacion(intruso, r.solicitud.id, {
        aprobar: true,
        nuevosTopes: topes(1e9),
      }),
    ).rejects.toThrow("Solicitud no encontrada");
  });
});

describe("decidirAmpliacion", () => {
  const pausado = async () => {
    const s = setup(5);
    const r = await s.svc.reservar(pet());
    if (r.estado !== "pausado") throw new Error("esperado pausa");
    return { ...s, id: r.solicitud.id };
  };

  it("aprobar sube el tope y permite reanudar", async () => {
    const { repo, svc, id } = await pausado();
    const d = await svc.decidirAmpliacion(owner, id, {
      aprobar: true,
      nuevosTopes: topes(500),
    });
    expect(d).toMatchObject({ estado: "aprobada", decididoPor: "u1" });
    expect(
      repo.leer(ORG, { ambito: "agente", refId: "ag1" })?.tope.tokens,
    ).toBe(500);
    expect((await svc.reservar(pet())).estado).toBe("ok");
  });
  it("rechazar no cambia topes y una nueva pausa crea otra solicitud", async () => {
    const { repo, svc, id } = await pausado();
    await svc.decidirAmpliacion(owner, id, { aprobar: false });
    expect(
      repo.leer(ORG, { ambito: "agente", refId: "ag1" })?.tope.tokens,
    ).toBe(5);
    const r = await svc.reservar(pet());
    expect(r.estado === "pausado" && r.solicitud.id !== id).toBe(true);
  });
  it("no se decide dos veces", async () => {
    const { svc, id } = await pausado();
    await svc.decidirAmpliacion(owner, id, { aprobar: false });
    await expect(
      svc.decidirAmpliacion(owner, id, { aprobar: false }),
    ).rejects.toThrow("ya decidida");
  });
  it("solo owner puede ampliar", async () => {
    const { svc, id } = await pausado();
    for (const rol of ["admin", "supervisor", "viewer"] as const) {
      await expect(
        svc.decidirAmpliacion({ ...owner, rol }, id, {
          aprobar: true,
          nuevosTopes: topes(500),
        }),
      ).rejects.toThrow(AccesoDenegadoError);
    }
  });
});
