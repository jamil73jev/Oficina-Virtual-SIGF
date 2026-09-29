import type { z } from "zod";
import type { EstadoTarea, Organizacion } from "@/types";

export type EstadoDeTarea = z.infer<typeof EstadoTarea>;

export interface ConsumoTokens {
  tokensIn: number;
  tokensOut: number;
  tokensCache: number;
  total: number;
  formateado?: string;
}

export interface ConsumoAgente {
  agenteId: string;
  rol?: string;
  modelo?: string;
  tokens: ConsumoTokens;
  costo: number;
  costoFormateado: string;
  ejecucionesCount: number;
}

export interface ConsumoProyecto {
  proyectoId: string;
  objetivo?: string;
  tokens: ConsumoTokens;
  costo: number;
  costoFormateado: string;
  ejecucionesCount: number;
}

export interface ConsumoOrganizacion {
  orgId: string;
  tokens: ConsumoTokens;
  costo: number;
  costoFormateado: string;
  ejecucionesCount: number;
}

export type NivelAlertaPresupuesto = "ok" | "alerta_80" | "alerta_100";

export interface ResumenPresupuesto {
  id: string;
  ambito: "org" | "proyecto" | "agente";
  refId: string;
  periodo: string;
  topeTokens: number;
  topeCosto: number;
  topeIteraciones: number;
  consumidoTokens: number;
  consumidoCosto: number;
  consumidoIteraciones: number;
  porcentajeTokens: number;
  porcentajeCosto: number;
  porcentajeMaximo: number;
  alerta80: boolean;
  alerta100: boolean;
  nivelAlerta: NivelAlertaPresupuesto;
  topeCostoFormateado: string;
  consumidoCostoFormateado: string;
}

export interface ResumenAlertas {
  tieneAlerta80: boolean;
  tieneAlerta100: boolean;
  alertas80: ResumenPresupuesto[];
  alertas100: ResumenPresupuesto[];
}

export type ConteoTareasPorEstado = Record<EstadoDeTarea, number> & {
  total: number;
};

export interface MetricasAprobaciones {
  total: number;
  aprobadas: number;
  rechazadas: number;
  expiradas: number;
  pendientes: number;
  totalDecididas: number;
  tasaAprobacion: number;
  tasaRechazo: number;
  porcentajeAprobacion: number;
  porcentajeRechazo: number;
}

export interface ResumenDashboard {
  organizacion: Organizacion;
  periodo?: string;
  consumoOrg: ConsumoOrganizacion;
  porAgente: ConsumoAgente[];
  porProyecto: ConsumoProyecto[];
  presupuestos: ResumenPresupuesto[];
  alertas: ResumenAlertas;
  tareasPorEstado: ConteoTareasPorEstado;
  aprobaciones: MetricasAprobaciones;
  generadoEn: string;
  generadoEnFormateado: string;
}

export interface FiltroDashboard {
  periodo?: string;
  desde?: Date | string;
  hasta?: Date | string;
  proyectoId?: string;
  agenteId?: string;
}
