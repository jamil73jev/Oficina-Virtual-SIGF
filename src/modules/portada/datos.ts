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
  /**
   * Identidad con la que se cargan los datos. Sin deps se usa la identidad REAL de la sesion
   * (redirige al login si no hay). Con deps inyectadas y sin ctx se usa un contexto vacio sin
   * organizacion, que los servicios reales rechazan (org_invalida): nunca una org fija.
   */
  ctx?: ContextoAcceso;
  aprobaciones: { listarPendientes(orgId: string): Promise<Array<{ tipo: string; expiraEn: Date }>> };
  dashboards: {
    obtenerResumen(
      ctx: ContextoAcceso,
      filtro?: undefined,
      opciones?: { locale?: Locale },
    ): Promise<ResumenDashboard>;
  };
}

const CTX_SIN_ORG: ContextoAcceso = { usuarioId: "", orgId: "", rol: "viewer" };

/** Identidad real de la sesion (import perezoso: next/headers solo en el servidor de Next). */
async function identidadDeSesion(locale: Locale): Promise<ContextoAcceso> {
  const { exigirIdentidadPagina } = await import("@/core/auth/pagina");
  return (await exigirIdentidadPagina(locale)).ctx;
}

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
  // La identidad se resuelve FUERA de las secciones: una redireccion al login no debe
  // quedar atrapada como "error de seccion".
  const ctx = deps ? (deps.ctx ?? CTX_SIN_ORG) : await identidadDeSesion(locale);
  const aprobacionesSrv = () => deps?.aprobaciones ?? obtenerServicioAprobaciones();
  const dashboardsSrv = () => deps?.dashboards ?? obtenerServicioDashboards();
  const [aprobaciones, resumen] = await Promise.all([
    seccion<DatosAprobaciones>(async () => {
      const pendientes = await aprobacionesSrv().listarPendientes(ctx.orgId);
      const primera = pendientes[0];
      return {
        pendientes: pendientes.length,
        proxima: primera ? { tipo: primera.tipo, expiraEn: primera.expiraEn.toISOString() } : null,
      };
    }),
    seccion(() => dashboardsSrv().obtenerResumen(ctx, undefined, { locale })),
  ]);
  return {
    aprobaciones,
    costos: resumen.ok ? { ok: true, datos: resumirCostos(resumen.datos) } : { ok: false },
    operaciones: resumen.ok ? { ok: true, datos: resumirOperaciones(resumen.datos) } : { ok: false },
  };
}
