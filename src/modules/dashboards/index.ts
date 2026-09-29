import {
  AprobacionesMemoriaRepoDashboards,
  EjecucionesMemoriaRepo,
  OrganizacionesMemoriaRepo,
  PresupuestosMemoriaRepo,
  TareasMemoriaRepo,
} from "./ports";
import { ServicioDashboards } from "./service";

export * from "./domain";
export * from "./ports";
export * from "./service";
export * from "./http";
export * from "./mensajes";

const CLAVE = Symbol.for("oficina-virtual.servicioDashboards");

export function obtenerServicioDashboards(): ServicioDashboards {
  const g = globalThis as unknown as Record<symbol, ServicioDashboards>;
  if (!g[CLAVE]) {
    const ejecuciones = new EjecucionesMemoriaRepo();
    const presupuestos = new PresupuestosMemoriaRepo();
    const tareas = new TareasMemoriaRepo();
    const aprobaciones = new AprobacionesMemoriaRepoDashboards();
    const organizaciones = new OrganizacionesMemoriaRepo();

    // Semilla inicial por defecto para demostración y compilación estática
    const DEMO_ORG = "00000000-0000-4000-8000-000000000001";
    organizaciones.definir({
      id: DEMO_ORG,
      nombre: "Oficina Virtual IA",
      moneda: "USD",
      huso: "America/Guayaquil",
      locale: "es",
    });

    presupuestos.definir(DEMO_ORG, [
      {
        id: "10000000-0000-4000-8000-000000000001",
        orgId: DEMO_ORG,
        ambito: "org",
        refId: DEMO_ORG,
        topeTokens: 1000000,
        topeCosto: 100,
        topeIteraciones: 500,
        consumido: { tokens: 820000, costo: 82.5, iteraciones: 350 },
        periodo: "2026-09",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        orgId: DEMO_ORG,
        ambito: "proyecto",
        refId: "20000000-0000-4000-8000-000000000001",
        topeTokens: 500000,
        topeCosto: 50,
        topeIteraciones: 250,
        consumido: { tokens: 210000, costo: 21.0, iteraciones: 110 },
        periodo: "2026-09",
      },
    ]);

    tareas.definir(DEMO_ORG, [
      {
        id: "30000000-0000-4000-8000-000000000001",
        orgId: DEMO_ORG,
        proyectoId: "proyecto-ecommerce",
        agenteId: "agente-planificador",
        estado: "completada",
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        orgId: DEMO_ORG,
        proyectoId: "proyecto-ecommerce",
        agenteId: "agente-desarrollador",
        estado: "en_curso",
      },
      {
        id: "30000000-0000-4000-8000-000000000003",
        orgId: DEMO_ORG,
        proyectoId: "proyecto-infraestructura",
        agenteId: "agente-verificador",
        estado: "en_verificacion",
      },
      {
        id: "30000000-0000-4000-8000-000000000004",
        orgId: DEMO_ORG,
        proyectoId: "proyecto-infraestructura",
        agenteId: null,
        estado: "pendiente",
      },
    ]);

    ejecuciones.definir(DEMO_ORG, [
      {
        id: "40000000-0000-4000-8000-000000000001",
        orgId: DEMO_ORG,
        tareaId: "30000000-0000-4000-8000-000000000001",
        agenteId: "agente-planificador",
        modelo: "gemini-1.5-pro",
        tokensIn: 250000,
        tokensOut: 60000,
        tokensCache: 50000,
        costo: 32.5,
        estado: "completada",
        proyectoId: "proyecto-ecommerce",
        periodo: "2026-09",
      },
      {
        id: "40000000-0000-4000-8000-000000000002",
        orgId: DEMO_ORG,
        tareaId: "30000000-0000-4000-8000-000000000002",
        agenteId: "agente-desarrollador",
        modelo: "claude-3-5-sonnet",
        tokensIn: 300000,
        tokensOut: 110000,
        tokensCache: 50000,
        costo: 50.0,
        estado: "en_curso",
        proyectoId: "proyecto-ecommerce",
        periodo: "2026-09",
      },
    ]);

    aprobaciones.definir(DEMO_ORG, [
      {
        id: "50000000-0000-4000-8000-000000000001",
        orgId: DEMO_ORG,
        ejecucionId: "40000000-0000-4000-8000-000000000001",
        tipo: "despliegue_produccion",
        riesgo: "irreversible",
        estado: "aprobada",
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        orgId: DEMO_ORG,
        ejecucionId: "40000000-0000-4000-8000-000000000002",
        tipo: "borrado_tabla",
        riesgo: "irreversible",
        estado: "rechazada",
      },
      {
        id: "50000000-0000-4000-8000-000000000003",
        orgId: DEMO_ORG,
        ejecucionId: "40000000-0000-4000-8000-000000000002",
        tipo: "llamada_api_costosa",
        riesgo: "escritura_reversible",
        estado: "pendiente",
      },
    ]);

    g[CLAVE] = new ServicioDashboards({
      ejecuciones,
      presupuestos,
      tareas,
      aprobaciones,
      organizaciones,
    });
  }
  return g[CLAVE];
}
