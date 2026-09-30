import { obtenerServicioAprobaciones } from "@/core/approvals";
import type { Locale } from "@/core/i18n/config";
import type { ContextoAcceso } from "@/core/rbac";
import { obtenerServicioDashboards, type ResumenDashboard } from "@/modules/dashboards";

/** Cada sección se carga por separado: si una falla, las demás se siguen mostrando. */
export type Seccion<T> = { ok: true; datos: T } | { ok: false };

export interface DatosAprobaciones {
  pendientes: number;
  /** La que vence primero (la lista llega ordenada por vencimiento). */
  proxima: { tipo: string; expiraEn: string } | null;
}

export interface DatosCostos {
  periodo: string | null;
  costo: string;
  tokens: number;
  /** Mayor porcentaje consumido del presupuesto de la organización; null si no hay tope. */
  porcentajeTope: number | null;
  nivel: "ok" | "alerta_80" | "alerta_100";
}

export const ORDEN_ESTADOS = [
  "en_curso",
  "en_verificacion",
  "pendiente",
  "asignada",
  "bloqueada",
  "fallida",
  "completada",
] as const;
export type EstadoOperacion = (typeof ORDEN_ESTADOS)[number];

export interface DatosOperaciones {
  total: number;
  filas: Array<{ estado: EstadoOperacion; cantidad: number }>;
}

export interface DatosPortada {
  aprobaciones: Seccion<DatosAprobaciones>;
  costos: Seccion<DatosCostos>;
  operaciones: Seccion<DatosOperaciones>;
}

export interface DepsPortada {
  aprobaciones: { listarPendientes(orgId: string): Promise<Array<{ tipo: string; expiraEn: Date }>> };
  dashboards: {
    obtenerResumen(
      ctx: ContextoAcceso,
      filtro?: undefined,
      opciones?: { locale?: Locale },
    ): Promise<ResumenDashboard>;
  };
}

// Organización y lector de demostración, igual que la página de costos (sin autenticación real aún).
const ORG_DEMO = "00000000-0000-4000-8000-000000000001";
const CTX_DEMO: ContextoAcceso = {
  usuarioId: "00000000-0000-4000-8000-000000000002",
  orgId: ORG_DEMO,
  rol: "viewer",
};

async function seccion<T>(cargar: () => Promise<T>): Promise<Seccion<T>> {
  try {
    return { ok: true, datos: await cargar() };
  } catch {
    return { ok: false };
  }
}

export function resumirOperaciones(resumen: ResumenDashboard): DatosOperaciones {
  const filas = ORDEN_ESTADOS.map((estado) => ({ estado, cantidad: resumen.tareasPorEstado[estado] ?? 0 })).filter(
    (f) => f.cantidad > 0,
  );
  return { total: resumen.tareasPorEstado.total ?? 0, filas };
}

export function resumirCostos(resumen: ResumenDashboard): DatosCostos {
  const org = resumen.presupuestos.filter((p) => p.ambito === "org");
  const peor = org.reduce<(typeof org)[number] | null>(
    (m, p) => (m === null || p.porcentajeMaximo > m.porcentajeMaximo ? p : m),
    null,
  );
  return {
    periodo: resumen.periodo ?? peor?.periodo ?? null,
    costo: resumen.consumoOrg.costoFormateado,
    tokens: resumen.consumoOrg.tokens.total,
    porcentajeTope: peor ? Math.round(peor.porcentajeMaximo) : null,
    nivel: peor?.nivelAlerta ?? "ok",
  };
}

export async function cargarPortada(locale: Locale, deps?: DepsPortada): Promise<DatosPortada> {
  // Los servicios se obtienen dentro de cada seccion: si construirlos falla (p. ej. falta
  // AUDIT_HMAC_KEY en produccion) solo esa tarjeta muestra el estado de error.
  const aprobacionesSrv = () => deps?.aprobaciones ?? obtenerServicioAprobaciones();
  const dashboardsSrv = () => deps?.dashboards ?? obtenerServicioDashboards();
  const [aprobaciones, resumen] = await Promise.all([
    seccion<DatosAprobaciones>(async () => {
      const pendientes = await aprobacionesSrv().listarPendientes(ORG_DEMO);
      const primera = pendientes[0];
      return {
        pendientes: pendientes.length,
        proxima: primera ? { tipo: primera.tipo, expiraEn: primera.expiraEn.toISOString() } : null,
      };
    }),
    seccion(() => dashboardsSrv().obtenerResumen(CTX_DEMO, undefined, { locale })),
  ]);
  return {
    aprobaciones,
    costos: resumen.ok ? { ok: true, datos: resumirCostos(resumen.datos) } : { ok: false },
    operaciones: resumen.ok ? { ok: true, datos: resumirOperaciones(resumen.datos) } : { ok: false },
  };
}
