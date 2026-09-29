import { describe, expect, it } from "vitest";
import { crearSolicitarAprobacion } from "@/core/approvals/adaptador";
import { AprobacionesMemoriaRepo } from "@/core/approvals/repo";
import { ServicioAprobaciones } from "@/core/approvals/service";
import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import type { PedidoAprobacion } from "@/orchestration/ports";

const ORG = "org-1";
const pedido: PedidoAprobacion = {
  orgId: ORG,
  ejecucionId: "ej-1",
  tareaId: "t-1",
  tipo: "herramienta:borrar",
  riesgo: "irreversible",
  payload: { objetivo: "x" },
};

function montar() {
  let t = 1_700_000_000_000;
  const ahora = () => new Date(t);
  const servicio = new ServicioAprobaciones(
    new AprobacionesMemoriaRepo(),
    new Auditor(new AuditoriaMemoriaRepo()),
    { ahora },
  );
  return { servicio, ahora, avanzar: (ms: number) => (t += ms) };
}

describe("adaptador SolicitarAprobacion", () => {
  it("devuelve aprobada cuando un supervisor aprueba", async () => {
    const { servicio, ahora } = montar();
    const solicitar = crearSolicitarAprobacion(servicio, {
      ahora,
      dormir: async () => {
        const [p] = await servicio.listarPendientes(ORG);
        if (p)
          await servicio.decidir(p.id, "aprobada", {
            usuarioId: "u1",
            orgId: ORG,
            rol: "supervisor",
          });
      },
    });
    expect(await solicitar(pedido)).toBe("aprobada");
  });

  it("devuelve rechazada cuando se rechaza", async () => {
    const { servicio, ahora } = montar();
    const solicitar = crearSolicitarAprobacion(servicio, {
      ahora,
      dormir: async () => {
        const [p] = await servicio.listarPendientes(ORG);
        if (p)
          await servicio.decidir(p.id, "rechazada", {
            usuarioId: "u1",
            orgId: ORG,
            rol: "admin",
          });
      },
    });
    expect(await solicitar(pedido)).toBe("rechazada");
  });

  it("expira a rechazo si nadie decide", async () => {
    const { servicio, ahora, avanzar } = montar();
    const solicitar = crearSolicitarAprobacion(servicio, {
      ahora,
      vigenciaMs: 1_000,
      dormir: async () => {
        avanzar(2_000);
      },
    });
    expect(await solicitar(pedido)).toBe("expirada");
  });

  it("registra tareaId en los datos de la solicitud", async () => {
    const { servicio, ahora, avanzar } = montar();
    let visto: Record<string, unknown> | undefined;
    const solicitar = crearSolicitarAprobacion(servicio, {
      ahora,
      vigenciaMs: 1_000,
      dormir: async () => {
        const [p] = await servicio.listarPendientes(ORG);
        if (p) visto = p.payload;
        avanzar(2_000);
      },
    });
    await solicitar(pedido);
    expect(visto).toMatchObject({ objetivo: "x", tareaId: "t-1" });
  });
});
