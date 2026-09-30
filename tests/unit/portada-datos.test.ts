import { describe, expect, it } from "vitest";
import { cargarPortada, type DepsPortada } from "@/modules/portada/datos";
import type { ResumenDashboard } from "@/modules/dashboards";

function resumen(total = 0, enCurso = 0): ResumenDashboard {
  return {
    periodo: "2026-09",
    consumoOrg: {
      orgId: "o",
      tokens: { tokensIn: 1, tokensOut: 1, tokensCache: 0, total: 820000 },
      costo: 82.5,
      costoFormateado: "$82,50",
      ejecucionesCount: 2,
    },
    presupuestos: [
      { ambito: "proyecto", porcentajeMaximo: 10, periodo: "2026-09", nivelAlerta: "ok" },
      { ambito: "org", porcentajeMaximo: 82.4, periodo: "2026-09", nivelAlerta: "alerta_80" },
    ],
    tareasPorEstado: { total, en_curso: enCurso, completada: 0 },
  } as unknown as ResumenDashboard;
}

const aprobacionesOk = {
  listarPendientes: async () => [{ tipo: "borrado_tabla", expiraEn: new Date("2026-09-29T10:00:00Z") }],
};
const dashboardsOk = (r: ResumenDashboard): DepsPortada["dashboards"] => ({ obtenerResumen: async () => r });
const falla = async () => {
  throw new Error("caído");
};

describe("datos de la portada", () => {
  it("resume aprobaciones, costos y operaciones", async () => {
    const d = await cargarPortada("es", { aprobaciones: aprobacionesOk, dashboards: dashboardsOk(resumen(3, 2)) });
    expect(d.aprobaciones).toEqual({
      ok: true,
      datos: { pendientes: 1, proxima: { tipo: "borrado_tabla", expiraEn: "2026-09-29T10:00:00.000Z" } },
    });
    expect(d.costos).toEqual({
      ok: true,
      datos: { periodo: "2026-09", costo: "$82,50", tokens: 820000, porcentajeTope: 82, nivel: "alerta_80" },
    });
    expect(d.operaciones).toEqual({ ok: true, datos: { total: 3, filas: [{ estado: "en_curso", cantidad: 2 }] } });
  });

  it("sin tareas devuelve operaciones vacías (la vista invita a encargar una)", async () => {
    const d = await cargarPortada("en", {
      aprobaciones: { listarPendientes: async () => [] },
      dashboards: dashboardsOk(resumen()),
    });
    expect(d.operaciones).toEqual({ ok: true, datos: { total: 0, filas: [] } });
    expect(d.aprobaciones).toEqual({ ok: true, datos: { pendientes: 0, proxima: null } });
  });

  it("un servicio caído solo marca su sección como error", async () => {
    const d = await cargarPortada("es", {
      aprobaciones: { listarPendientes: falla },
      dashboards: dashboardsOk(resumen(1, 1)),
    });
    expect(d.aprobaciones).toEqual({ ok: false });
    expect(d.costos.ok).toBe(true);
    expect(d.operaciones.ok).toBe(true);
  });

  it("si falla el resumen, costos y operaciones fallan y aprobaciones sigue", async () => {
    const d = await cargarPortada("es", { aprobaciones: aprobacionesOk, dashboards: { obtenerResumen: falla } });
    expect(d.costos).toEqual({ ok: false });
    expect(d.operaciones).toEqual({ ok: false });
    expect(d.aprobaciones.ok).toBe(true);
  });
});
