import type { Alojamiento } from "@/core/datos";
import { PRECIO_TOKEN, type Uso } from "@/orchestration/runtime";
import type { NombreSkill } from "@/orchestration/skills";
import type { NombreHerramientaArea } from "./herramientas";

/** Modulos del esquema SIGF de la Direccion General Financiera que lee cada agente. */
export type ModuloSigf =
  | "control_financiero_estadistica"
  | "rentas"
  | "coactiva"
  | "tesoreria"
  | "caja_general"
  | "presupuesto"
  | "contabilidad"
  | "pagaduria"
  | "direccion_financiera"
  | "planificacion";

export type IdAgenteArea =
  | "control-estadistica"
  | "cartera"
  | "datos"
  | "tesorero"
  | "presupuestista"
  | "contador"
  | "pagador"
  | "cajero-mayor"
  | "rentas"
  | "coactiva"
  | "director"
  | "planificacion";

/** Skill de un agente de area: debe estar registrada en SKILLS_DISPONIBLES (se verifica al compilar). */
export type SkillArea = Extract<IdAgenteArea, NombreSkill>;

export interface AgenteArea {
  id: IdAgenteArea;
  /** Id del registro `agente` (uuid fijo): ambito de su presupuesto y actor en auditoria. */
  agenteId: string;
  nombre: string;
  area: string;
  modulos: readonly ModuloSigf[];
  /** Archivo src/orchestration/skills/<skill>.md. */
  skill: SkillArea;
  /** Fuente unica de las herramientas que puede usar el agente (minimo privilegio). */
  herramientasPermitidas: readonly NombreHerramientaArea[];
  /** Modelo configurado; hoy el simulado. Con datos reales debe ser un modelo local. */
  modelo: string;
  alojamiento: Alojamiento;
  /** Tope por agente (tokens, costo simulado e iteraciones) para el guard de presupuesto. */
  presupuesto: Uso;
}

const presupuesto = (tokens: number): Uso => ({ tokens, costo: tokens * PRECIO_TOKEN, iteraciones: 40 });

export const CATALOGO_AGENTES_AREA = {
  "control-estadistica": {
    id: "control-estadistica",
    agenteId: "00000000-0000-4000-8000-00000000c001",
    nombre: "Agente de Control Financiero y Estadistica",
    area: "Control Financiero y Estadistica",
    modulos: ["control_financiero_estadistica", "rentas", "tesoreria", "coactiva"],
    skill: "control-estadistica",
    herramientasPermitidas: [
      "comparar_cortes",
      "contar_unicos",
      "recaudacion_neta",
      "calidad_datos",
      "cruzar_identificaciones",
    ],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(200_000),
  },
  cartera: {
    id: "cartera",
    agenteId: "00000000-0000-4000-8000-00000000c002",
    nombre: "Agente de Cartera",
    area: "Rentas y Coactiva (cartera)",
    modulos: ["rentas", "coactiva"],
    skill: "cartera",
    herramientasPermitidas: ["saldo_cartera_por_titulo", "antiguedad_cartera", "segmentar_pareto", "contar_unicos"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(200_000),
  },
  datos: {
    id: "datos",
    agenteId: "00000000-0000-4000-8000-00000000c003",
    nombre: "Agente de Datos",
    area: "Calidad de datos (transversal)",
    modulos: ["rentas", "coactiva", "tesoreria"],
    skill: "datos",
    herramientasPermitidas: ["calidad_datos", "comparar_cortes", "contar_unicos", "cruzar_identificaciones"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(150_000),
  },
  tesorero: {
    id: "tesorero",
    agenteId: "00000000-0000-4000-8000-00000000c004",
    nombre: "Agente Tesorero",
    area: "Tesoreria",
    modulos: ["tesoreria", "caja_general"],
    skill: "tesorero",
    herramientasPermitidas: ["conciliar_banco", "recaudacion_neta"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(100_000),
  },
  presupuestista: {
    id: "presupuestista",
    agenteId: "00000000-0000-4000-8000-00000000c005",
    nombre: "Agente Presupuestista",
    area: "Presupuesto",
    modulos: ["presupuesto", "contabilidad"],
    skill: "presupuestista",
    herramientasPermitidas: [
      "ejecucion_presupuestaria",
      "disponibilidad_partida",
      "reformas_certificaciones",
      "cuadre_fin_cont_pres",
    ],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(150_000),
  },
  contador: {
    id: "contador",
    agenteId: "00000000-0000-4000-8000-00000000c006",
    nombre: "Agente Contador",
    area: "Contabilidad",
    modulos: ["contabilidad", "presupuesto", "tesoreria"],
    skill: "contador",
    herramientasPermitidas: ["conciliacion_contable", "balance_comprobacion", "cuadre_fin_cont_pres"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(150_000),
  },
  pagador: {
    id: "pagador",
    agenteId: "00000000-0000-4000-8000-00000000c007",
    nombre: "Agente Pagador",
    area: "Pagaduria",
    modulos: ["pagaduria", "presupuesto"],
    skill: "pagador",
    herramientasPermitidas: ["validar_orden_pago", "programar_pagos", "resumen_ordenes_pago"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(100_000),
  },
  "cajero-mayor": {
    id: "cajero-mayor",
    agenteId: "00000000-0000-4000-8000-00000000c008",
    nombre: "Agente Cajero Mayor",
    area: "Caja General",
    modulos: ["caja_general", "tesoreria"],
    skill: "cajero-mayor",
    herramientasPermitidas: ["arqueo_caja", "productividad_cajas", "recaudacion_neta"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(100_000),
  },
  rentas: {
    id: "rentas",
    agenteId: "00000000-0000-4000-8000-00000000c009",
    nombre: "Agente de Rentas",
    area: "Rentas",
    modulos: ["rentas"],
    skill: "rentas",
    herramientasPermitidas: [
      "emision_por_rubro",
      "efecto_resoluciones",
      "estado_vigente_al_corte",
      "saldo_cartera_por_titulo",
    ],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(200_000),
  },
  coactiva: {
    id: "coactiva",
    agenteId: "00000000-0000-4000-8000-00000000c00a",
    nombre: "Agente de Coactiva",
    area: "Coactiva",
    modulos: ["coactiva", "rentas"],
    skill: "coactiva",
    herramientasPermitidas: [
      "resumen_coactiva",
      "recuperacion_coactiva",
      "estado_vigente_al_corte",
      "cruzar_identificaciones",
    ],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(200_000),
  },
  director: {
    id: "director",
    agenteId: "00000000-0000-4000-8000-00000000c00b",
    nombre: "Agente Director Financiero",
    area: "Direccion General Financiera",
    modulos: ["direccion_financiera", "control_financiero_estadistica"],
    skill: "director",
    herramientasPermitidas: ["tablero_ejecutivo", "avance_vs_meta", "comparativo_interanual", "alertas_desviacion"],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(150_000),
  },
  planificacion: {
    id: "planificacion",
    agenteId: "00000000-0000-4000-8000-00000000c00c",
    nombre: "Agente de Planificacion Financiera",
    area: "Planificacion financiera interinstitucional",
    modulos: ["planificacion", "direccion_financiera"],
    skill: "planificacion",
    herramientasPermitidas: [
      "consolidar_entidades",
      "proyeccion_escenarios",
      "comparativo_interanual",
      "alertas_desviacion",
    ],
    modelo: "simulado",
    alojamiento: "local",
    presupuesto: presupuesto(150_000),
  },
} as const satisfies Record<IdAgenteArea, AgenteArea>;

export const AGENTES_AREA: readonly AgenteArea[] = Object.values(CATALOGO_AGENTES_AREA);

export const esIdAgenteArea = (id: string): id is IdAgenteArea => Object.hasOwn(CATALOGO_AGENTES_AREA, id);

export function obtenerAgenteArea(id: string): AgenteArea {
  const a = AGENTES_AREA.find((x) => x.id === id);
  if (!a) throw new Error(`Agente de area desconocido: ${id}`);
  return a;
}
