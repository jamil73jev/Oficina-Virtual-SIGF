import { describe, expect, it } from "vitest";
import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import {
  AprobacionError,
  AprobacionesMemoriaRepo,
  ServicioAprobaciones,
  crearManejadoresAprobaciones,
  esRechazo,
  type ProveedorIdentidad,
} from "@/core/approvals";
import type { ContextoAcceso } from "@/core/rbac";
import { formatearRestante } from "@/modules/aprobaciones/tiempo";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const EJE = "33333333-3333-4333-8333-333333333333";

const ctx = (rol: ContextoAcceso["rol"], orgId = ORG_A, usuarioId = "u-" + rol): ContextoAcceso => ({
  usuarioId,
  orgId,
  rol,
});

function montar() {
  let ahora = Date.UTC(2026, 0, 1, 12, 0, 0);
  let n = 0;
  const auditoria = new AuditoriaMemoriaRepo();
  const auditor = new Auditor(auditoria, { ahora: () => new Date(ahora) });
  const servicio = new ServicioAprobaciones(new AprobacionesMemoriaRepo(), auditor, {
    ahora: () => new Date(ahora),
    nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  const avanzar = (ms: number) => (ahora += ms);
  const pedir = (orgId = ORG_A, ms = 60_000) =>
    servicio.solicitar(
      { orgId, ejecucionId: EJE, tipo: "borrar_datos", datos: { tabla: "x" } },
      "irreversible",
      new Date(ahora + ms),
    );
  return { servicio, auditor, avanzar, pedir };
}

const codigo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AprobacionError) return e.codigo;
    throw e;
  }
  return null;
};

describe("servicio de aprobaciones", () => {
  it("solicita en estado pendiente y la lista", async () => {
    const { servicio, pedir } = montar();
    const a = await pedir();
    expect(a.estado).toBe("pendiente");
    expect((await servicio.listarPendientes(ORG_A)).map((x) => x.id)).toEqual([a.id]);
  });

  it("aisla estrictamente por org", async () => {
    const { servicio, pedir } = montar();
    const a = await pedir(ORG_A);
    expect(await servicio.listarPendientes(ORG_B)).toEqual([]);
    // Un owner de otra org no puede decidir ni ver que existe.
    expect(await codigo(servicio.decidir(a.id, "aprobada", ctx("owner", ORG_B)))).toBe(
      "no_encontrada",
    );
    expect(await servicio.obtener(ORG_B, a.id)).toBeNull();
    expect((await servicio.obtener(ORG_A, a.id))?.estado).toBe("pendiente");
  });

  it("rechaza al viewer y lo audita sin cambiar el estado", async () => {
    const { servicio, auditor, pedir } = montar();
    const a = await pedir();
    expect(await codigo(servicio.decidir(a.id, "aprobada", ctx("viewer")))).toBe(
      "rol_insuficiente",
    );
    expect((await servicio.obtener(ORG_A, a.id))?.estado).toBe("pendiente");
    const acciones = (await auditor.listar(ORG_A)).map((e) => e.accion);
    expect(acciones).toContain("aprobacion:decision_denegada");
  });

  it("permite decidir a supervisor, admin y owner", async () => {
    for (const rol of ["supervisor", "admin", "owner"] as const) {
      const { servicio, pedir } = montar();
      const a = await pedir();
      const r = await servicio.decidir(a.id, "aprobada", ctx(rol));
      expect(r).toMatchObject({ estado: "aprobada", decididoPor: `u-${rol}` });
      expect(r.decididoEn).toBeInstanceOf(Date);
    }
  });

  it("expira a rechazo y no admite decision posterior", async () => {
    const { servicio, avanzar, pedir } = montar();
    const a = await pedir(ORG_A, 1000);
    avanzar(1001);
    expect(await servicio.listarPendientes(ORG_A)).toEqual([]);
    const e = await servicio.obtener(ORG_A, a.id);
    expect(e?.estado).toBe("expirada");
    expect(esRechazo(e!)).toBe(true);
    expect(await codigo(servicio.decidir(a.id, "aprobada", ctx("admin")))).toBe("expirada");
  });

  it("expira al decidir tarde aunque nadie haya listado", async () => {
    const { servicio, avanzar, pedir } = montar();
    const a = await pedir(ORG_A, 1000);
    avanzar(5000);
    expect(await codigo(servicio.decidir(a.id, "aprobada", ctx("admin")))).toBe("expirada");
    expect((await servicio.obtener(ORG_A, a.id))?.estado).toBe("expirada");
  });

  it("rechaza la doble decision, incluso concurrente", async () => {
    const { servicio, pedir } = montar();
    const a = await pedir();
    await servicio.decidir(a.id, "aprobada", ctx("admin"));
    expect(await codigo(servicio.decidir(a.id, "rechazada", ctx("owner")))).toBe("ya_decidida");
    expect((await servicio.obtener(ORG_A, a.id))?.estado).toBe("aprobada");

    const b = await pedir();
    const res = await Promise.allSettled([
      servicio.decidir(b.id, "aprobada", ctx("admin")),
      servicio.decidir(b.id, "rechazada", ctx("owner")),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("valida la solicitud", async () => {
    const { servicio, pedir } = montar();
    expect(await codigo(pedir(ORG_A, -5))).toBe("solicitud_invalida");
    expect(
      await codigo(
        servicio.solicitar({ orgId: "", ejecucionId: EJE, tipo: "t", datos: {} }, "lectura", new Date(Date.now() + 1e6)),
      ),
    ).toBe("solicitud_invalida");
  });

  it("registra solicitud, decision y expiracion en la auditoria encadenada", async () => {
    const { servicio, auditor, avanzar, pedir } = montar();
    const a = await pedir();
    await servicio.decidir(a.id, "rechazada", ctx("supervisor"));
    const b = await pedir(ORG_A, 1000);
    avanzar(2000);
    await servicio.listarPendientes(ORG_A);

    const log = await auditor.listar(ORG_A);
    expect(log.map((e) => e.accion)).toEqual([
      "aprobacion:solicitar",
      "aprobacion:decision_iniciada",
      "aprobacion:rechazar",
      "aprobacion:solicitar",
      "aprobacion:expirar",
    ]);
    expect(log[2]).toMatchObject({ actor: "u-supervisor", entidad: `aprobacion:${a.id}` });
    expect(log[4]?.entidad).toBe(`aprobacion:${b.id}`);
    expect(await auditor.verificar(ORG_A)).toEqual({ valida: true, total: 5 });
    expect(await auditor.listar(ORG_B)).toEqual([]);
  });
});

describe("route handlers", () => {
  const montarHttp = (identidad: ProveedorIdentidad) => {
    const m = montar();
    const h = crearManejadoresAprobaciones({ servicio: m.servicio, identidad });
    return { ...m, h };
  };
  const post = (decision: unknown) =>
    new Request("http://x/api/approvals/id/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });

  it("401 sin identidad", async () => {
    const { h } = montarHttp(() => null);
    expect((await h.listar(new Request("http://x"))).status).toBe(401);
    expect((await h.decidir(post("aprobada"), "x")).status).toBe(401);
  });

  it("lista solo la org de la identidad y viewer puede leer pero no decidir", async () => {
    const { h, pedir } = montarHttp(() => ctx("viewer", ORG_A));
    await pedir(ORG_A);
    await pedir(ORG_B);
    const r = await h.listar(new Request("http://x/api/approvals?orgId=" + ORG_B));
    const cuerpo = (await r.json()) as { aprobaciones: { orgId: string }[] };
    expect(cuerpo.aprobaciones).toHaveLength(1);
    expect(cuerpo.aprobaciones[0]?.orgId).toBe(ORG_A);
    const d = await h.decidir(post("aprobada"), "00000000-0000-4000-8000-000000000001");
    expect(d.status).toBe(403);
  });

  it("valida id y cuerpo con Zod, y mapea errores del servicio", async () => {
    const { h, pedir } = montarHttp(() => ctx("admin"));
    const a = await pedir();
    expect((await h.decidir(post("aprobada"), "no-uuid")).status).toBe(400);
    expect((await h.decidir(post("quizas"), a.id)).status).toBe(400);
    expect((await h.decidir(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), a.id)).status).toBe(400);
    expect((await h.decidir(post("aprobada"), a.id)).status).toBe(200);
    expect((await h.decidir(post("rechazada"), a.id)).status).toBe(409);
    expect((await h.decidir(post("aprobada"), "99999999-9999-4999-8999-999999999999")).status).toBe(404);
  });
});

describe("formatearRestante", () => {
  it("elige la unidad y detecta vencida", () => {
    const t0 = 0;
    expect(formatearRestante(new Date(90_000), t0, "en-US").texto).toBe("1 minute");
    expect(formatearRestante(new Date(7_300_000), t0, "en-US").texto).toBe("2 hours");
    expect(formatearRestante(new Date(1000), 1000, "en-US").vencida).toBe(true);
  });
});
