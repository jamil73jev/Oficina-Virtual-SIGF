import type { ContextoAcceso } from "@/core/rbac";
import { exigir } from "@/core/rbac";
import type { Locale } from "@/core/i18n/config";
import { isLocale } from "@/core/i18n/config";
import { formatCurrency, formatDate, formatNumber } from "@/core/i18n/format";
import type { Organizacion } from "@/types";
import type {
  ConteoTareasPorEstado,
  ConsumoAgente,
  ConsumoOrganizacion,
  ConsumoProyecto,
  ConsumoTokens,
  EstadoDeTarea,
  FiltroDashboard,
  MetricasAprobaciones,
  NivelAlertaPresupuesto,
  ResumenAlertas,
  ResumenDashboard,
  ResumenPresupuesto,
} from "./domain";
import type {
  LectorAprobaciones,
  LectorEjecuciones,
  LectorOrganizaciones,
  LectorPresupuestos,
  LectorTareas,
} from "./ports";

export interface PuertosDashboards {
  ejecuciones: LectorEjecuciones;
  presupuestos: LectorPresupuestos;
  tareas: LectorTareas;
  aprobaciones?: LectorAprobaciones;
  organizaciones?: LectorOrganizaciones;
  ahora?: () => Date;
}

export interface OpcionesResumen {
  locale?: Locale;
}

export class ServicioDashboards {
  private readonly ahora: () => Date;

  constructor(private readonly puertos: PuertosDashboards) {
    this.ahora = puertos.ahora ?? (() => new Date());
  }

  async obtenerResumen(
    ctx: ContextoAcceso,
    filtro?: FiltroDashboard,
    opciones?: OpcionesResumen,
  ): Promise<ResumenDashboard> {
    // 1. Autorización RBAC estricta (viewer puede leer, roles sin permiso deniegan)
    exigir(ctx, "presupuesto:leer", { orgId: ctx.orgId });

    const orgId = ctx.orgId;

    // 2. Obtener organización y configuración de formato
    const orgEncontrada = await this.puertos.organizaciones?.obtener(orgId);
    const org: Organizacion = orgEncontrada ?? {
      id: orgId,
      nombre: "Organización",
      moneda: "USD",
      huso: "America/Guayaquil",
      locale: "es",
    };

    const locale: Locale =
      opciones?.locale ?? (isLocale(org.locale) ? (org.locale as Locale) : "es");

    // 3. Lecturas paralelas aisladas por orgId
    const [ejecuciones, presupuestos, tareas, aprobaciones] = await Promise.all([
      this.puertos.ejecuciones.listar(orgId, filtro),
      this.puertos.presupuestos.listar(orgId, filtro?.periodo),
      this.puertos.tareas.listar(orgId, filtro?.proyectoId),
      this.puertos.aprobaciones ? this.puertos.aprobaciones.listar(orgId) : Promise.resolve([]),
    ]);

    // Mapa de tareas para asociar tareaId -> proyectoId
    const tareaProyectoMap = new Map<string, string>();
    for (const t of tareas) {
      tareaProyectoMap.set(t.id, t.proyectoId);
    }

    // 4. Agregación de ejecuciones: consumo de tokens y costo por agente, proyecto y org
    let orgTokensIn = 0;
    let orgTokensOut = 0;
    let orgTokensCache = 0;
    let orgCosto = 0;
    let orgEjecucionesCount = 0;

    const porAgenteMap = new Map<
      string,
      {
        tokensIn: number;
        tokensOut: number;
        tokensCache: number;
        costo: number;
        ejecucionesCount: number;
        modelo?: string;
      }
    >();

    const porProyectoMap = new Map<
      string,
      {
        tokensIn: number;
        tokensOut: number;
        tokensCache: number;
        costo: number;
        ejecucionesCount: number;
      }
    >();

    for (const e of ejecuciones) {
      const tIn = e.tokensIn ?? 0;
      const tOut = e.tokensOut ?? 0;
      const tCache = e.tokensCache ?? 0;
      const c = e.costo ?? 0;

      orgTokensIn += tIn;
      orgTokensOut += tOut;
      orgTokensCache += tCache;
      orgCosto += c;
      orgEjecucionesCount += 1;

      // Agrupar por Agente
      const agenteData = porAgenteMap.get(e.agenteId) ?? {
        tokensIn: 0,
        tokensOut: 0,
        tokensCache: 0,
        costo: 0,
        ejecucionesCount: 0,
        modelo: e.modelo,
      };
      agenteData.tokensIn += tIn;
      agenteData.tokensOut += tOut;
      agenteData.tokensCache += tCache;
      agenteData.costo += c;
      agenteData.ejecucionesCount += 1;
      porAgenteMap.set(e.agenteId, agenteData);

      // Agrupar por Proyecto
      const proyId = e.proyectoId ?? tareaProyectoMap.get(e.tareaId) ?? "general";
      const proyData = porProyectoMap.get(proyId) ?? {
        tokensIn: 0,
        tokensOut: 0,
        tokensCache: 0,
        costo: 0,
        ejecucionesCount: 0,
      };
      proyData.tokensIn += tIn;
      proyData.tokensOut += tOut;
      proyData.tokensCache += tCache;
      proyData.costo += c;
      proyData.ejecucionesCount += 1;
      porProyectoMap.set(proyId, proyData);
    }

    const orgTokensTotal = orgTokensIn + orgTokensOut + orgTokensCache;
    const consumoOrg: ConsumoOrganizacion = {
      orgId,
      tokens: {
        tokensIn: orgTokensIn,
        tokensOut: orgTokensOut,
        tokensCache: orgTokensCache,
        total: orgTokensTotal,
        formateado: formatNumber(orgTokensTotal, locale),
      },
      costo: orgCosto,
      costoFormateado: formatCurrency(orgCosto, locale, org.moneda),
      ejecucionesCount: orgEjecucionesCount,
    };

    const porAgente: ConsumoAgente[] = Array.from(porAgenteMap.entries()).map(([agenteId, d]) => {
      const tot = d.tokensIn + d.tokensOut + d.tokensCache;
      const tokens: ConsumoTokens = {
        tokensIn: d.tokensIn,
        tokensOut: d.tokensOut,
        tokensCache: d.tokensCache,
        total: tot,
        formateado: formatNumber(tot, locale),
      };
      return {
        agenteId,
        modelo: d.modelo,
        tokens,
        costo: d.costo,
        costoFormateado: formatCurrency(d.costo, locale, org.moneda),
        ejecucionesCount: d.ejecucionesCount,
      };
    });

    const porProyecto: ConsumoProyecto[] = Array.from(porProyectoMap.entries()).map(
      ([proyectoId, d]) => {
        const tot = d.tokensIn + d.tokensOut + d.tokensCache;
        const tokens: ConsumoTokens = {
          tokensIn: d.tokensIn,
          tokensOut: d.tokensOut,
          tokensCache: d.tokensCache,
          total: tot,
          formateado: formatNumber(tot, locale),
        };
        return {
          proyectoId,
          tokens,
          costo: d.costo,
          costoFormateado: formatCurrency(d.costo, locale, org.moneda),
          ejecucionesCount: d.ejecucionesCount,
        };
      },
    );

    // 5. Presupuestos, porcentaje consumido y alertas al 80% y 100%
    const presupuestosResumen: ResumenPresupuesto[] = presupuestos.map((p) => {
      const pctCosto = p.topeCosto > 0 ? (p.consumido.costo / p.topeCosto) * 100 : 0;
      const pctTokens = p.topeTokens > 0 ? (p.consumido.tokens / p.topeTokens) * 100 : 0;
      const pctMaximo = Math.max(pctCosto, pctTokens);

      const alerta100 = pctMaximo >= 100;
      const alerta80 = !alerta100 && pctMaximo >= 80;
      const nivelAlerta: NivelAlertaPresupuesto = alerta100
        ? "alerta_100"
        : alerta80
          ? "alerta_80"
          : "ok";

      return {
        id: p.id,
        ambito: p.ambito,
        refId: p.refId,
        periodo: p.periodo,
        topeTokens: p.topeTokens,
        topeCosto: p.topeCosto,
        topeIteraciones: p.topeIteraciones,
        consumidoTokens: p.consumido.tokens,
        consumidoCosto: p.consumido.costo,
        consumidoIteraciones: p.consumido.iteraciones,
        porcentajeTokens: Math.round(pctTokens * 10) / 10,
        porcentajeCosto: Math.round(pctCosto * 10) / 10,
        porcentajeMaximo: Math.round(pctMaximo * 10) / 10,
        alerta80,
        alerta100,
        nivelAlerta,
        topeCostoFormateado: formatCurrency(p.topeCosto, locale, org.moneda),
        consumidoCostoFormateado: formatCurrency(p.consumido.costo, locale, org.moneda),
      };
    });

    const alertas80 = presupuestosResumen.filter((p) => p.alerta80);
    const alertas100 = presupuestosResumen.filter((p) => p.alerta100);
    const alertas: ResumenAlertas = {
      tieneAlerta80: alertas80.length > 0,
      tieneAlerta100: alertas100.length > 0,
      alertas80,
      alertas100,
    };

    // 6. Tareas por estado
    const tareasPorEstado: ConteoTareasPorEstado = {
      pendiente: 0,
      asignada: 0,
      en_curso: 0,
      en_verificacion: 0,
      completada: 0,
      fallida: 0,
      bloqueada: 0,
      total: tareas.length,
    };

    for (const t of tareas) {
      const st = t.estado as EstadoDeTarea;
      if (st in tareasPorEstado) {
        tareasPorEstado[st] = (tareasPorEstado[st] ?? 0) + 1;
      }
    }

    // 7. Aprobaciones: tasas de aprobación y rechazo
    let aprobadas = 0;
    let rechazadas = 0;
    let expiradas = 0;
    let pendientes = 0;

    for (const a of aprobaciones) {
      switch (a.estado) {
        case "aprobada":
          aprobadas += 1;
          break;
        case "rechazada":
          rechazadas += 1;
          break;
        case "expirada":
          expiradas += 1;
          break;
        case "pendiente":
          pendientes += 1;
          break;
      }
    }

    const totalDecididas = aprobadas + rechazadas + expiradas;
    const totalAprobaciones = aprobaciones.length;
    const tasaAprobacion = totalDecididas > 0 ? aprobadas / totalDecididas : 0;
    const tasaRechazo = totalDecididas > 0 ? (rechazadas + expiradas) / totalDecididas : 0;

    const metricasAprobaciones: MetricasAprobaciones = {
      total: totalAprobaciones,
      aprobadas,
      rechazadas,
      expiradas,
      pendientes,
      totalDecididas,
      tasaAprobacion: Math.round(tasaAprobacion * 1000) / 1000,
      tasaRechazo: Math.round(tasaRechazo * 1000) / 1000,
      porcentajeAprobacion: Math.round(tasaAprobacion * 1000) / 10,
      porcentajeRechazo: Math.round(tasaRechazo * 1000) / 10,
    };

    // 8. Timestamps formateados con huso y locale de la organización
    const ahoraDate = this.ahora();
    const generadoEn = ahoraDate.toISOString();
    const generadoEnFormateado = formatDate(ahoraDate, locale, org.huso, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return {
      organizacion: org,
      periodo: filtro?.periodo,
      consumoOrg,
      porAgente,
      porProyecto,
      presupuestos: presupuestosResumen,
      alertas,
      tareasPorEstado,
      aprobaciones: metricasAprobaciones,
      generadoEn,
      generadoEnFormateado,
    };
  }
}
