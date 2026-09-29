import { describe, expect, it } from "vitest";
import type { ContextoAcceso } from "@/core/rbac";
import type { RolUsuario } from "@/core/rbac";
import {
  AprobacionesMemoriaRepoDashboards,
  crearManejadoresDashboards,
  EjecucionesMemoriaRepo,
  mensajesDashboards,
  OrganizacionesMemoriaRepo,
  PresupuestosMemoriaRepo,
  ServicioDashboards,
  TareasMemoriaRepo,
} from "@/modules/dashboards";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const ctx = (
  rol: RolUsuario | "sin_permiso",
  orgId = ORG_A,
  usuarioId = "u-" + rol,
): ContextoAcceso =>
  ({
    usuarioId,
    orgId,
    rol: rol as RolUsuario,
  }) as ContextoAcceso;

function crearEntorno() {
  const ejecuciones = new EjecucionesMemoriaRepo();
  const presupuestos = new PresupuestosMemoriaRepo();
  const tareas = new TareasMemoriaRepo();
  const aprobaciones = new AprobacionesMemoriaRepoDashboards();
  const organizaciones = new OrganizacionesMemoriaRepo();

  const fechaFija = new Date("2026-09-28T14:30:00.000Z");

  organizaciones.definir({
    id: ORG_A,
    nombre: "Corp Thunder A",
    moneda: "USD",
    huso: "America/Guayaquil",
    locale: "es",
  });

  organizaciones.definir({
    id: ORG_B,
    nombre: "Corp Thunder B",
    moneda: "EUR",
    huso: "Europe/Madrid",
    locale: "en",
  });

  const servicio = new ServicioDashboards({
    ejecuciones,
    presupuestos,
    tareas,
    aprobaciones,
    organizaciones,
    ahora: () => fechaFija,
  });

  return {
    servicio,
    ejecuciones,
    presupuestos,
    tareas,
    aprobaciones,
    organizaciones,
    fechaFija,
  };
}

describe("ServicioDashboards - Agregaciones con datos conocidos", () => {
  it("calcula consumos de tokens y costo por agente, proyecto y organizacion", async () => {
    const { servicio, ejecuciones, tareas } = crearEntorno();

    const PROY_1 = "33333333-3333-4333-8333-111111111111";
    const PROY_2 = "33333333-3333-4333-8333-222222222222";
    const TAREA_1 = "44444444-4444-4444-8444-111111111111";
    const TAREA_2 = "44444444-4444-4444-8444-222222222222";

    tareas.agregar({
      id: TAREA_1,
      orgId: ORG_A,
      proyectoId: PROY_1,
      agenteId: "agente-1",
      estado: "completada",
    });
    tareas.agregar({
      id: TAREA_2,
      orgId: ORG_A,
      proyectoId: PROY_2,
      agenteId: "agente-2",
      estado: "en_curso",
    });

    // 2 ejecuciones para Agente 1 (en Proyecto 1 via Tarea 1)
    ejecuciones.agregar({
      id: "e-1",
      orgId: ORG_A,
      tareaId: TAREA_1,
      agenteId: "agente-1",
      modelo: "gemini-1.5-pro",
      tokensIn: 100,
      tokensOut: 50,
      tokensCache: 25,
      costo: 10.0,
      estado: "completada",
      periodo: "2026-09",
    });
    ejecuciones.agregar({
      id: "e-2",
      orgId: ORG_A,
      tareaId: TAREA_1,
      agenteId: "agente-1",
      modelo: "gemini-1.5-pro",
      tokensIn: 200,
      tokensOut: 100,
      tokensCache: 50,
      costo: 20.0,
      estado: "completada",
      periodo: "2026-09",
    });

    // 1 ejecucion para Agente 2 (en Proyecto 2 via Tarea 2)
    ejecuciones.agregar({
      id: "e-3",
      orgId: ORG_A,
      tareaId: TAREA_2,
      agenteId: "agente-2",
      modelo: "claude-3-5-sonnet",
      tokensIn: 300,
      tokensOut: 150,
      tokensCache: 75,
      costo: 30.0,
      estado: "en_curso",
      periodo: "2026-09",
    });

    const resumen = await servicio.obtenerResumen(ctx("viewer", ORG_A));

    // Totales organizacion: tokens: (100+200+300)+(50+100+150)+(25+50+75) = 600 + 300 + 150 = 1050
    expect(resumen.consumoOrg.tokens.tokensIn).toBe(600);
    expect(resumen.consumoOrg.tokens.tokensOut).toBe(300);
    expect(resumen.consumoOrg.tokens.tokensCache).toBe(150);
    expect(resumen.consumoOrg.tokens.total).toBe(1050);
    expect(resumen.consumoOrg.costo).toBe(60.0);
    expect(resumen.consumoOrg.ejecucionesCount).toBe(3);

    // Por agente
    const agente1 = resumen.porAgente.find((a) => a.agenteId === "agente-1");
    expect(agente1).toBeDefined();
    expect(agente1?.tokens.total).toBe(525);
    expect(agente1?.costo).toBe(30.0);
    expect(agente1?.ejecucionesCount).toBe(2);

    const agente2 = resumen.porAgente.find((a) => a.agenteId === "agente-2");
    expect(agente2).toBeDefined();
    expect(agente2?.tokens.total).toBe(525);
    expect(agente2?.costo).toBe(30.0);
    expect(agente2?.ejecucionesCount).toBe(1);

    // Por proyecto
    const proy1 = resumen.porProyecto.find((p) => p.proyectoId === PROY_1);
    expect(proy1).toBeDefined();
    expect(proy1?.tokens.total).toBe(525);
    expect(proy1?.costo).toBe(30.0);
    expect(proy1?.ejecucionesCount).toBe(2);

    const proy2 = resumen.porProyecto.find((p) => p.proyectoId === PROY_2);
    expect(proy2).toBeDefined();
    expect(proy2?.tokens.total).toBe(525);
    expect(proy2?.costo).toBe(30.0);
    expect(proy2?.ejecucionesCount).toBe(1);
  });

  it("filtra por periodo correctamente", async () => {
    const { servicio, ejecuciones } = crearEntorno();

    ejecuciones.agregar({
      id: "e-sep",
      orgId: ORG_A,
      tareaId: "t-1",
      agenteId: "a-1",
      modelo: "m",
      tokensIn: 100,
      tokensOut: 50,
      tokensCache: 0,
      costo: 10.0,
      estado: "completada",
      periodo: "2026-09",
    });
    ejecuciones.agregar({
      id: "e-oct",
      orgId: ORG_A,
      tareaId: "t-1",
      agenteId: "a-1",
      modelo: "m",
      tokensIn: 200,
      tokensOut: 100,
      tokensCache: 0,
      costo: 25.0,
      estado: "completada",
      periodo: "2026-10",
    });

    const resumenSep = await servicio.obtenerResumen(ctx("viewer", ORG_A), {
      periodo: "2026-09",
    });
    expect(resumenSep.consumoOrg.costo).toBe(10.0);
    expect(resumenSep.consumoOrg.tokens.total).toBe(150);

    const resumenOct = await servicio.obtenerResumen(ctx("viewer", ORG_A), {
      periodo: "2026-10",
    });
    expect(resumenOct.consumoOrg.costo).toBe(25.0);
    expect(resumenOct.consumoOrg.tokens.total).toBe(300);
  });
});

describe("ServicioDashboards - Aislamiento entre organizaciones", () => {
  it("aisla completamente los datos entre Org A y Org B", async () => {
    const { servicio, ejecuciones, presupuestos, tareas, aprobaciones } = crearEntorno();

    // Datos Org A
    ejecuciones.agregar({
      id: "e-org-a",
      orgId: ORG_A,
      tareaId: "t-a",
      agenteId: "agente-a",
      modelo: "m-a",
      tokensIn: 1000,
      tokensOut: 500,
      tokensCache: 100,
      costo: 50,
      estado: "completada",
    });
    presupuestos.agregar({
      id: "p-a",
      orgId: ORG_A,
      ambito: "org",
      refId: ORG_A,
      topeTokens: 10000,
      topeCosto: 100,
      topeIteraciones: 50,
      consumido: { tokens: 5000, costo: 50, iteraciones: 25 },
      periodo: "2026-09",
    });
    tareas.agregar({
      id: "t-a",
      orgId: ORG_A,
      proyectoId: "p-1",
      agenteId: "agente-a",
      estado: "completada",
    });
    aprobaciones.agregar({
      id: "ap-a",
      orgId: ORG_A,
      ejecucionId: "e-org-a",
      tipo: "deploy",
      riesgo: "irreversible",
      estado: "aprobada",
    });

    // Datos Org B
    ejecuciones.agregar({
      id: "e-org-b",
      orgId: ORG_B,
      tareaId: "t-b",
      agenteId: "agente-b",
      modelo: "m-b",
      tokensIn: 8000,
      tokensOut: 4000,
      tokensCache: 200,
      costo: 300,
      estado: "completada",
    });
    presupuestos.agregar({
      id: "p-b",
      orgId: ORG_B,
      ambito: "org",
      refId: ORG_B,
      topeTokens: 50000,
      topeCosto: 1000,
      topeIteraciones: 200,
      consumido: { tokens: 10000, costo: 200, iteraciones: 50 },
      periodo: "2026-09",
    });
    tareas.agregar({
      id: "t-b",
      orgId: ORG_B,
      proyectoId: "p-2",
      agenteId: "agente-b",
      estado: "pendiente",
    });
    aprobaciones.agregar({
      id: "ap-b",
      orgId: ORG_B,
      ejecucionId: "e-org-b",
      tipo: "borrado",
      riesgo: "irreversible",
      estado: "rechazada",
    });

    // Consulta como Org A
    const resA = await servicio.obtenerResumen(ctx("viewer", ORG_A));
    expect(resA.organizacion.id).toBe(ORG_A);
    expect(resA.consumoOrg.costo).toBe(50);
    expect(resA.porAgente.map((a) => a.agenteId)).toEqual(["agente-a"]);
    expect(resA.presupuestos.map((p) => p.id)).toEqual(["p-a"]);
    expect(resA.tareasPorEstado.completada).toBe(1);
    expect(resA.tareasPorEstado.pendiente).toBe(0);
    expect(resA.aprobaciones.aprobadas).toBe(1);
    expect(resA.aprobaciones.rechazadas).toBe(0);

    // Consulta como Org B
    const resB = await servicio.obtenerResumen(ctx("viewer", ORG_B));
    expect(resB.organizacion.id).toBe(ORG_B);
    expect(resB.consumoOrg.costo).toBe(300);
    expect(resB.porAgente.map((a) => a.agenteId)).toEqual(["agente-b"]);
    expect(resB.presupuestos.map((p) => p.id)).toEqual(["p-b"]);
    expect(resB.tareasPorEstado.completada).toBe(0);
    expect(resB.tareasPorEstado.pendiente).toBe(1);
    expect(resB.aprobaciones.aprobadas).toBe(0);
    expect(resB.aprobaciones.rechazadas).toBe(1);
  });
});

describe("ServicioDashboards - Control de acceso RBAC", () => {
  it("permite lectura a viewer, supervisor, admin y owner", async () => {
    const { servicio } = crearEntorno();

    for (const rol of ["viewer", "supervisor", "admin", "owner"] as const) {
      const res = await servicio.obtenerResumen(ctx(rol, ORG_A));
      expect(res.organizacion.id).toBe(ORG_A);
    }
  });

  it("deniega acceso si el rol no tiene permiso presupuesto:leer", async () => {
    const { servicio } = crearEntorno();

    await expect(servicio.obtenerResumen(ctx("sin_permiso", ORG_A))).rejects.toThrow(
      /Acceso denegado/,
    );
  });
});

describe("ServicioDashboards - Formato de moneda y huso horario", () => {
  it("respeta la moneda y huso de la organizacion en espanol e ingles", async () => {
    const { servicio, ejecuciones } = crearEntorno();

    // En Org A (USD, America/Guayaquil, es)
    ejecuciones.agregar({
      id: "e-a",
      orgId: ORG_A,
      tareaId: "t-1",
      agenteId: "a-1",
      modelo: "m",
      tokensIn: 100,
      tokensOut: 50,
      tokensCache: 0,
      costo: 1250.5,
      estado: "completada",
    });

    const resA = await servicio.obtenerResumen(ctx("viewer", ORG_A), undefined, { locale: "es" });
    expect(resA.consumoOrg.costoFormateado).toMatch(/1\.?250,50/);
    expect(resA.generadoEnFormateado).toBeDefined();

    // En Org B (EUR, Europe/Madrid, en)
    ejecuciones.agregar({
      id: "e-b",
      orgId: ORG_B,
      tareaId: "t-2",
      agenteId: "a-2",
      modelo: "m",
      tokensIn: 100,
      tokensOut: 50,
      tokensCache: 0,
      costo: 2500.75,
      estado: "completada",
    });

    const resB = await servicio.obtenerResumen(ctx("viewer", ORG_B), undefined, { locale: "en" });
    expect(resB.consumoOrg.costoFormateado).toMatch(/€\s?2,500\.75|2,500\.75\s?€/);
    expect(resB.generadoEnFormateado).toBeDefined();
  });
});

describe("ServicioDashboards - Porcentaje de tope consumido y alertas al 80% y 100%", () => {
  it("clasifica correctamente alertas normales, al 80% y al 100%", async () => {
    const { servicio, presupuestos } = crearEntorno();

    // 1. Presupuesto normal (< 80%)
    presupuestos.agregar({
      id: "p-normal",
      orgId: ORG_A,
      ambito: "agente",
      refId: "agente-normal",
      topeTokens: 1000,
      topeCosto: 100,
      topeIteraciones: 50,
      consumido: { tokens: 500, costo: 75.0, iteraciones: 30 }, // 75%
      periodo: "2026-09",
    });

    // 2. Presupuesto con aviso 80% (>= 80% y < 100%)
    presupuestos.agregar({
      id: "p-alerta80",
      orgId: ORG_A,
      ambito: "proyecto",
      refId: "proy-alerta",
      topeTokens: 1000,
      topeCosto: 100,
      topeIteraciones: 50,
      consumido: { tokens: 850, costo: 85.0, iteraciones: 40 }, // 85%
      periodo: "2026-09",
    });

    // 3. Presupuesto crítico 100% (>= 100%)
    presupuestos.agregar({
      id: "p-alerta100",
      orgId: ORG_A,
      ambito: "org",
      refId: ORG_A,
      topeTokens: 1000,
      topeCosto: 100,
      topeIteraciones: 50,
      consumido: { tokens: 1050, costo: 102.5, iteraciones: 52 }, // 105% tokens, 102.5% costo
      periodo: "2026-09",
    });

    const res = await servicio.obtenerResumen(ctx("viewer", ORG_A));

    const pNormal = res.presupuestos.find((p) => p.id === "p-normal");
    expect(pNormal?.porcentajeCosto).toBe(75.0);
    expect(pNormal?.alerta80).toBe(false);
    expect(pNormal?.alerta100).toBe(false);
    expect(pNormal?.nivelAlerta).toBe("ok");

    const p80 = res.presupuestos.find((p) => p.id === "p-alerta80");
    expect(p80?.porcentajeCosto).toBe(85.0);
    expect(p80?.alerta80).toBe(true);
    expect(p80?.alerta100).toBe(false);
    expect(p80?.nivelAlerta).toBe("alerta_80");

    const p100 = res.presupuestos.find((p) => p.id === "p-alerta100");
    expect(p100?.porcentajeMaximo).toBe(105.0);
    expect(p100?.alerta80).toBe(false);
    expect(p100?.alerta100).toBe(true);
    expect(p100?.nivelAlerta).toBe("alerta_100");

    expect(res.alertas.tieneAlerta80).toBe(true);
    expect(res.alertas.tieneAlerta100).toBe(true);
    expect(res.alertas.alertas80.map((p) => p.id)).toEqual(["p-alerta80"]);
    expect(res.alertas.alertas100.map((p) => p.id)).toEqual(["p-alerta100"]);
  });
});

describe("ServicioDashboards - Tareas por estado y tasas de aprobacion/rechazo", () => {
  it("cuenta correctamente las tareas por estado y calcula tasa de aprobacion", async () => {
    const { servicio, tareas, aprobaciones } = crearEntorno();

    // 6 tareas con varios estados
    tareas.agregar({ id: "t-1", orgId: ORG_A, proyectoId: "p-1", agenteId: "a", estado: "completada" });
    tareas.agregar({ id: "t-2", orgId: ORG_A, proyectoId: "p-1", agenteId: "a", estado: "completada" });
    tareas.agregar({ id: "t-3", orgId: ORG_A, proyectoId: "p-1", agenteId: "a", estado: "en_curso" });
    tareas.agregar({ id: "t-4", orgId: ORG_A, proyectoId: "p-1", agenteId: "a", estado: "en_verificacion" });
    tareas.agregar({ id: "t-5", orgId: ORG_A, proyectoId: "p-1", agenteId: "a", estado: "pendiente" });
    tareas.agregar({ id: "t-6", orgId: ORG_A, proyectoId: "p-1", agenteId: "a", estado: "fallida" });

    // Aprobaciones: 3 aprobadas, 1 rechazada, 1 expirada, 1 pendiente
    // total = 6, totalDecididas = 5 (3 + 1 + 1)
    // tasaAprobacion = 3 / 5 = 0.6 (60%)
    // tasaRechazo = (1 + 1) / 5 = 0.4 (40%)
    aprobaciones.agregar({ id: "ap-1", orgId: ORG_A, ejecucionId: "e-1", tipo: "t", riesgo: "lectura", estado: "aprobada" });
    aprobaciones.agregar({ id: "ap-2", orgId: ORG_A, ejecucionId: "e-2", tipo: "t", riesgo: "lectura", estado: "aprobada" });
    aprobaciones.agregar({ id: "ap-3", orgId: ORG_A, ejecucionId: "e-3", tipo: "t", riesgo: "lectura", estado: "aprobada" });
    aprobaciones.agregar({ id: "ap-4", orgId: ORG_A, ejecucionId: "e-4", tipo: "t", riesgo: "lectura", estado: "rechazada" });
    aprobaciones.agregar({ id: "ap-5", orgId: ORG_A, ejecucionId: "e-5", tipo: "t", riesgo: "lectura", estado: "expirada" });
    aprobaciones.agregar({ id: "ap-6", orgId: ORG_A, ejecucionId: "e-6", tipo: "t", riesgo: "lectura", estado: "pendiente" });

    const res = await servicio.obtenerResumen(ctx("viewer", ORG_A));

    expect(res.tareasPorEstado.total).toBe(6);
    expect(res.tareasPorEstado.completada).toBe(2);
    expect(res.tareasPorEstado.en_curso).toBe(1);
    expect(res.tareasPorEstado.en_verificacion).toBe(1);
    expect(res.tareasPorEstado.pendiente).toBe(1);
    expect(res.tareasPorEstado.fallida).toBe(1);
    expect(res.tareasPorEstado.bloqueada).toBe(0);

    expect(res.aprobaciones.total).toBe(6);
    expect(res.aprobaciones.aprobadas).toBe(3);
    expect(res.aprobaciones.rechazadas).toBe(1);
    expect(res.aprobaciones.expiradas).toBe(1);
    expect(res.aprobaciones.pendientes).toBe(1);
    expect(res.aprobaciones.totalDecididas).toBe(5);
    expect(res.aprobaciones.tasaAprobacion).toBe(0.6);
    expect(res.aprobaciones.porcentajeAprobacion).toBe(60.0);
    expect(res.aprobaciones.tasaRechazo).toBe(0.4);
    expect(res.aprobaciones.porcentajeRechazo).toBe(40.0);
  });
});

describe("Route Handlers /api/dashboards", () => {
  it("401 sin identidad autenticada", async () => {
    const { servicio } = crearEntorno();
    const handlers = crearManejadoresDashboards({
      servicio,
      identidad: () => null,
    });

    const res = await handlers.resumen(new Request("http://localhost/api/dashboards"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_autenticado");
  });

  it("403 si el rol no tiene permiso presupuesto:leer", async () => {
    const { servicio } = crearEntorno();
    const handlers = crearManejadoresDashboards({
      servicio,
      identidad: () => ctx("sin_permiso", ORG_A),
    });

    const res = await handlers.resumen(new Request("http://localhost/api/dashboards"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("rol_insuficiente");
  });

  it("200 con viewer y asegura aislamiento estricto de org", async () => {
    const { servicio, ejecuciones } = crearEntorno();
    ejecuciones.agregar({
      id: "e-org-a",
      orgId: ORG_A,
      tareaId: "t-1",
      agenteId: "agente-a",
      modelo: "m",
      tokensIn: 50,
      tokensOut: 20,
      tokensCache: 0,
      costo: 5.0,
      estado: "completada",
    });

    const handlers = crearManejadoresDashboards({
      servicio,
      identidad: () => ctx("viewer", ORG_A),
    });

    // Aunque se intente pasar ?orgId=ORG_B en la query, la identidad manda
    const res = await handlers.resumen(
      new Request(`http://localhost/api/dashboards?orgId=${ORG_B}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dashboard: { organizacion: { id: string } } };
    expect(body.dashboard.organizacion.id).toBe(ORG_A);
  });

  it("valida parametros con Zod y devuelve 400 si son invalidos", async () => {
    const { servicio } = crearEntorno();
    const handlers = crearManejadoresDashboards({
      servicio,
      identidad: () => ctx("viewer", ORG_A),
    });

    const res = await handlers.resumen(
      new Request("http://localhost/api/dashboards?proyectoId=no-es-un-uuid"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("parametros_invalidos");
  });
});

describe("Diccionario bilingüe mensajesDashboards", () => {
  it("posee todas las claves coincidentes entre ES y EN", () => {
    const keysEs = Object.keys(mensajesDashboards.es).sort();
    const keysEn = Object.keys(mensajesDashboards.en).sort();
    expect(keysEs).toEqual(keysEn);
  });
});
