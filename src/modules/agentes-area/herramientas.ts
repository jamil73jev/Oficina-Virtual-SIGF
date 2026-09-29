import { z } from "zod";
import {
  EstadoTitulo,
  FUENTES_SINTETICAS,
  FinanzasError,
  HERRAMIENTAS_FINANZAS,
  NOMBRES_HERRAMIENTAS_FINANZAS,
  corteDe,
  generarDatosSinteticos,
  saldoCarteraPorTitulo,
  type DatosFinanzas,
  type NombreHerramientaFinanzas,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import {
  FUENTES_CONTABLES,
  HERRAMIENTAS_CONTABLE,
  NOMBRES_HERRAMIENTAS_CONTABLE,
  OrigenAsiento,
  TipoPartida,
  generarDatosContables,
  type DatosContables,
  type NombreHerramientaContable,
} from "@/modules/finanzas-contable";
import {
  HERRAMIENTAS_DIRECCION,
  NOMBRES_HERRAMIENTAS_DIRECCION,
  generarDatosDireccion,
  type DatosDireccion,
  type NombreHerramientaDireccion,
} from "@/modules/finanzas-direccion";
import { HERRAMIENTAS_PAGOS, generarDatosPagos, type DatosPagos, type NombreHerramientaPagos } from "@/modules/finanzas-pagos";
import {
  HERRAMIENTAS_RENTAS,
  NOMBRES_HERRAMIENTAS_RENTAS,
  generarDatosRentas,
  type DatosRentas,
  type NombreHerramientaRentas,
} from "@/modules/finanzas-rentas";
import { definirHerramienta, RegistroHerramientas } from "@/orchestration/tools";

/** Clasificacion de la fuente; decide el modoDatos de la ejecucion (ver ejecutar.ts). */
export type TipoFuente = "sintetico" | "real";

/**
 * Puerto de lectura de datos financieros. La implementacion real (datos del municipio) debe
 * declarar `tipo: "real"`: con ella solo se admiten modelos locales.
 *
 * `cargar` provee los datos de finanzas (rentas, tesoreria, coactiva). Los demas cargadores son
 * opcionales: si faltan y la fuente es sintetica se usan los generadores con semilla fija; si la
 * fuente no es sintetica la herramienta informa que el modulo no esta disponible (nunca mezcla
 * datos sinteticos en una ejecucion real).
 */
export interface FuenteDatos {
  readonly tipo: TipoFuente;
  readonly descripcion: string;
  cargar(orgId: string): Promise<DatosFinanzas>;
  cargarContable?(orgId: string): Promise<DatosContables>;
  cargarPagos?(orgId: string): Promise<DatosPagos>;
  /** Resoluciones, historial y movimientos; se combinan con los titulos de `cargar`. */
  cargarRentas?(orgId: string): Promise<DatosRentas>;
  cargarDireccion?(orgId: string): Promise<DatosDireccion>;
}

export const SEMILLA_SINTETICA = 20260831;

/** Fuente por defecto: generadores sinteticos con semilla fija (deterministas, sin datos reales). */
export function fuenteSintetica(semilla: number | string = SEMILLA_SINTETICA): FuenteDatos {
  const cache: {
    finanzas?: DatosFinanzas;
    contable?: DatosContables;
    pagos?: DatosPagos;
    rentas?: DatosRentas;
    direccion?: DatosDireccion;
  } = {};
  const finanzas = () => (cache.finanzas ??= generarDatosSinteticos({ semilla }));
  return {
    tipo: "sintetico",
    descripcion: `generador sintetico (semilla ${semilla})`,
    async cargar() {
      return structuredClone(finanzas());
    },
    async cargarContable() {
      return structuredClone((cache.contable ??= generarDatosContables(semilla)));
    },
    async cargarPagos() {
      return structuredClone((cache.pagos ??= generarDatosPagos(semilla)));
    },
    async cargarRentas() {
      return structuredClone((cache.rentas ??= generarDatosRentas(semilla, finanzas())));
    },
    async cargarDireccion() {
      return structuredClone((cache.direccion ??= generarDatosDireccion(semilla)));
    },
  };
}

/** Modulo de datos del que lee cada herramienta. */
export type ModuloDatos = "finanzas" | "contable" | "pagos" | "rentas" | "direccion";

/** La fuente no provee el modulo y no es sintetica: se informa como dato faltante. */
export class ModuloNoDisponibleError extends Error {
  constructor(readonly modulo: ModuloDatos) {
    super(`La fuente no provee datos del modulo ${modulo}`);
    this.name = "ModuloNoDisponibleError";
  }
}

export interface DatosModulo {
  finanzas: DatosFinanzas;
  contable: DatosContables;
  pagos: DatosPagos;
  /** Rentas y Coactiva extienden los titulos, pagos y juicios de finanzas. */
  rentas: { finanzas: DatosFinanzas; rentas: DatosRentas };
  direccion: DatosDireccion;
}

/** Solo una fuente declarada exactamente sintetica recibe los generadores por defecto. */
function porDefecto<T>(fuente: FuenteDatos, modulo: ModuloDatos, generar: () => T): T {
  if (fuente.tipo !== "sintetico") throw new ModuloNoDisponibleError(modulo);
  return generar();
}

const CARGADORES: { [M in ModuloDatos]: (f: FuenteDatos, orgId: string) => Promise<DatosModulo[M]> } = {
  finanzas: (f, orgId) => f.cargar(orgId),
  contable: async (f, orgId) =>
    f.cargarContable ? f.cargarContable(orgId) : porDefecto(f, "contable", () => generarDatosContables(SEMILLA_SINTETICA)),
  pagos: async (f, orgId) =>
    f.cargarPagos ? f.cargarPagos(orgId) : porDefecto(f, "pagos", () => generarDatosPagos(SEMILLA_SINTETICA)),
  rentas: async (f, orgId) => {
    const finanzas = await f.cargar(orgId);
    const rentas = f.cargarRentas
      ? await f.cargarRentas(orgId)
      : porDefecto(f, "rentas", () => generarDatosRentas(SEMILLA_SINTETICA, finanzas));
    return { finanzas, rentas };
  },
  direccion: async (f, orgId) =>
    f.cargarDireccion ? f.cargarDireccion(orgId) : porDefecto(f, "direccion", () => generarDatosDireccion(SEMILLA_SINTETICA)),
};

const MAX_ELEMENTOS = 15;
const MUESTRA = 3;

/**
 * Acota la salida para el modelo: conserva todas las cifras escalares y resume los arreglos
 * largos (detalle por titulo, ids) con su cantidad y una muestra. Asi el sobre de datos no
 * confiables nunca trunca el JSON y el detalle completo sigue en la calculadora.
 */
export function compactar(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) {
    if (v.length <= MAX_ELEMENTOS) return v.map(compactar);
    return { elementos: v.length, muestra: v.slice(0, MUESTRA).map(compactar), omitidos: v.length - MUESTRA };
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compactar(x)]));
  }
  return v;
}

const fecha = z.iso.date();
const estados = z.array(EstadoTitulo).min(1).optional();
const tasa = z.number().min(-1).max(10);
const importe = z.number().finite().min(-1e13).max(1e13);

/**
 * Adaptador por herramienta: modulo de datos, argumentos acotados que decide el modelo (no
 * confiables) y armado de la entrada completa de la calculadora con los datos de la fuente.
 */
interface Adaptador<M extends ModuloDatos, A> {
  modulo: M;
  args: z.ZodType<A>;
  calcular(datos: DatosModulo[M], args: A): ResultadoCalculo<unknown>;
}

const adaptador = <M extends ModuloDatos, A>(a: Adaptador<M, A>) => a;

/** Valida la entrada completa con el esquema de la calculadora y la ejecuta. */
function ejecutar<E extends z.ZodType, R>(
  h: { esquemaEntrada: E; funcion: (entrada: z.output<E>) => ResultadoCalculo<R> },
  entrada: z.input<E>,
): ResultadoCalculo<R> {
  return h.funcion(h.esquemaEntrada.parse(entrada));
}

const cartera = (d: DatosFinanzas) => ({
  corte: corteDe(d, FUENTES_SINTETICAS.rentas),
  titulos: d.titulos,
  pagos: d.pagos,
  reversos: d.reversos,
  juicios: d.juicios,
});

/** Saldo por contribuyente (sumado por titulo unico): las partidas del Pareto. */
export function partidasPorContribuyente(d: DatosFinanzas, filtro?: EstadoTitulo[]) {
  const saldo = saldoCarteraPorTitulo({ ...cartera(d), estados: filtro });
  const porClave = new Map<string, number>();
  for (const t of saldo.valor.titulos) {
    porClave.set(t.contribuyenteId, (porClave.get(t.contribuyenteId) ?? 0) + t.saldo);
  }
  return [...porClave].map(([clave, valor]) => ({ clave, valor }));
}

/** Grupos solapados de contribuyentes (un contribuyente puede tener titulos en varios). */
export function gruposDeContribuyentes(d: DatosFinanzas, agrupacion: "estado_titulo" | "rubro") {
  const grupos = new Map<string, string[]>();
  for (const t of d.titulos) {
    const nombre = agrupacion === "estado_titulo" ? t.estado : t.rubroId;
    grupos.set(nombre, [...(grupos.get(nombre) ?? []), t.contribuyenteId]);
  }
  return [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([nombre, ids]) => ({ nombre, ids }));
}

/** Umbral de desviacion por defecto (%) de las alertas de direccion; se declara en los filtros. */
export const UMBRAL_ALERTAS_PCT = 10;

const H = HERRAMIENTAS_FINANZAS;
const HC = HERRAMIENTAS_CONTABLE;
const HP = HERRAMIENTAS_PAGOS;
const HR = HERRAMIENTAS_RENTAS;
const HD = HERRAMIENTAS_DIRECCION;

const ADAPTADORES_FINANZAS = {
  recaudacion_neta: adaptador({
    modulo: "finanzas",
    args: z.strictObject({ desde: fecha.optional(), hasta: fecha.optional() }),
    calcular: (d, a) =>
      ejecutar(H.recaudacion_neta, {
        corte: corteDe(d, FUENTES_SINTETICAS.tesoreria),
        pagos: d.pagos,
        reversos: d.reversos,
        ...a,
      }),
  }),
  saldo_cartera_por_titulo: adaptador({
    modulo: "finanzas",
    args: z.strictObject({ estados }),
    calcular: (d, a) => H.saldo_cartera_por_titulo.funcion({ ...cartera(d), estados: a.estados }),
  }),
  antiguedad_cartera: adaptador({
    modulo: "finanzas",
    args: z.strictObject({ estados, base: z.enum(["vencimiento", "emision"]).optional() }),
    calcular: (d, a) => H.antiguedad_cartera.funcion({ ...cartera(d), estados: a.estados, base: a.base }),
  }),
  segmentar_pareto: adaptador({
    modulo: "finanzas",
    args: z.strictObject({ estados, umbrales: z.tuple([z.number(), z.number()]).optional() }),
    calcular: (d, a) =>
      H.segmentar_pareto.funcion({
        corte: corteDe(d, FUENTES_SINTETICAS.rentas),
        partidas: partidasPorContribuyente(d, a.estados),
        umbrales: a.umbrales,
      }),
  }),
  conciliar_banco: adaptador({
    modulo: "finanzas",
    args: z.strictObject({}),
    calcular: (d) =>
      H.conciliar_banco.funcion({
        corte: corteDe(d, FUENTES_SINTETICAS.tesoreria),
        transacciones: d.pagos.filter((p) => p.canal !== "caja"),
        depositos: d.depositos,
      }),
  }),
  calidad_datos: adaptador({
    modulo: "finanzas",
    args: z.strictObject({}),
    calcular: (d) =>
      H.calidad_datos.funcion({ corte: corteDe(d, FUENTES_SINTETICAS.rentas), contribuyentes: d.contribuyentes }),
  }),
  cruzar_identificaciones: adaptador({
    modulo: "finanzas",
    args: z.strictObject({}),
    calcular: (d) =>
      H.cruzar_identificaciones.funcion({
        corte: corteDe(d, FUENTES_SINTETICAS.coactiva),
        titulos: d.titulos,
        contribuyentes: d.contribuyentes,
        juicios: d.juicios,
      }),
  }),
  comparar_cortes: adaptador({
    modulo: "finanzas",
    args: z.strictObject({
      fuentes: z.array(z.string().min(1).max(50)).min(2).max(10).optional(),
      modo: z.enum(["simultaneo", "evolutivo"]).optional(),
      toleranciaMinutos: z.number().int().nonnegative().max(1440).optional(),
    }),
    calcular: (d, a) => {
      const fuentes = a.fuentes ?? d.cortes.map((c) => c.fuente);
      const desconocidas = fuentes.filter((f) => !d.cortes.some((c) => c.fuente === f));
      if (desconocidas.length > 0) throw new FinanzasError("entrada_invalida", "fuente sin corte");
      return H.comparar_cortes.funcion({
        mediciones: fuentes.map((f) => ({ corte: corteDe(d, f) })),
        modo: a.modo,
        toleranciaMinutos: a.toleranciaMinutos,
      });
    },
  }),
  contar_unicos: adaptador({
    modulo: "finanzas",
    args: z.strictObject({ agrupacion: z.enum(["estado_titulo", "rubro"]) }),
    calcular: (d, a) =>
      H.contar_unicos.funcion({
        corte: corteDe(d, FUENTES_SINTETICAS.rentas),
        grupos: gruposDeContribuyentes(d, a.agrupacion),
      }),
  }),
} satisfies Record<NombreHerramientaFinanzas, unknown>;

const presupuesto = (d: DatosContables) => ({
  corte: corteDe(d, FUENTES_CONTABLES.presupuesto),
  ejercicio: d.ejercicio,
  partidas: d.partidas,
});
const contabilidad = (d: DatosContables) => corteDe(d, FUENTES_CONTABLES.contabilidad);
const toleranciaMinutos = z.number().int().nonnegative().max(1440).optional();

const ADAPTADORES_CONTABLE = {
  ejecucion_presupuestaria: adaptador({
    modulo: "contable",
    args: z.strictObject({
      tipo: TipoPartida.optional(),
      avanceEsperado: z.number().min(0).max(1).optional(),
      tolerancia: z.number().min(0).max(1).optional(),
    }),
    calcular: (d, a) => ejecutar(HC.ejecucion_presupuestaria, { ...presupuesto(d), ...a }),
  }),
  disponibilidad_partida: adaptador({
    modulo: "contable",
    args: z.strictObject({
      partidaIds: z.array(z.string().min(1).max(50)).min(1).max(50).optional(),
      solicitudes: z
        .array(z.strictObject({ id: z.string().min(1).max(50), partidaId: z.string().min(1).max(50), valor: z.number().finite().positive() }))
        .min(1)
        .max(20)
        .optional(),
    }),
    calcular: (d, a) => ejecutar(HC.disponibilidad_partida, { ...presupuesto(d), ...a }),
  }),
  reformas_certificaciones: adaptador({
    modulo: "contable",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HC.reformas_certificaciones, { ...presupuesto(d), certificaciones: d.certificaciones }),
  }),
  conciliacion_contable: adaptador({
    modulo: "contable",
    args: z.strictObject({ desde: fecha.optional(), hasta: fecha.optional(), toleranciaMinutos }),
    calcular: (d, a) =>
      ejecutar(HC.conciliacion_contable, { corte: contabilidad(d), asientos: d.asientos, subsistemas: d.subsistemas, ...a }),
  }),
  cuadre_fin_cont_pres: adaptador({
    modulo: "contable",
    args: z.strictObject({ toleranciaMinutos }),
    calcular: (d, a) => {
      const corte = contabilidad(d);
      return ejecutar(HC.cuadre_fin_cont_pres, {
        corte,
        cortesFuentes: d.cortes.filter((c) => c.fuente !== corte.fuente),
        filas: d.cuadre,
        justificaciones: d.justificaciones,
        ...a,
      });
    },
  }),
  balance_comprobacion: adaptador({
    modulo: "contable",
    args: z.strictObject({
      desde: fecha.optional(),
      hasta: fecha.optional(),
      origenes: z.array(OrigenAsiento).min(1).optional(),
    }),
    calcular: (d, a) => ejecutar(HC.balance_comprobacion, { corte: contabilidad(d), cuentas: d.cuentas, asientos: d.asientos, ...a }),
  }),
} satisfies Record<NombreHerramientaContable, unknown>;

const ADAPTADORES_PAGOS = {
  validar_orden_pago: adaptador({
    modulo: "pagos",
    args: z.strictObject({}),
    calcular: (d) =>
      ejecutar(HP.validar_orden_pago, {
        corte: d.corte,
        ordenes: d.ordenes,
        beneficiarios: d.beneficiarios,
        disponibilidades: d.disponibilidades,
      }),
  }),
  programar_pagos: adaptador({
    modulo: "pagos",
    // El tope de liquidez es un supuesto explicito: sin el no se propone programacion.
    args: z.strictObject({ topeLiquidez: z.number().finite().nonnegative().max(1e13) }),
    calcular: (d, a) => ejecutar(HP.programar_pagos, { corte: d.corte, ordenes: d.ordenes, topeLiquidez: a.topeLiquidez }),
  }),
  resumen_ordenes_pago: adaptador({
    modulo: "pagos",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HP.resumen_ordenes_pago, { corte: d.corte, ordenes: d.ordenes }),
  }),
  arqueo_caja: adaptador({
    modulo: "pagos",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HP.arqueo_caja, { corte: d.corte, turnos: d.turnos, novedades: d.novedades }),
  }),
  productividad_cajas: adaptador({
    modulo: "pagos",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HP.productividad_cajas, { corte: d.corte, cajas: d.cajas, turnos: d.turnos }),
  }),
} satisfies Record<NombreHerramientaPagos, unknown>;

const ADAPTADORES_RENTAS = {
  emision_por_rubro: adaptador({
    modulo: "rentas",
    args: z.strictObject({ desde: fecha.optional(), hasta: fecha.optional(), periodicidad: z.enum(["mes", "anio"]).optional() }),
    calcular: ({ finanzas: f }, a) =>
      ejecutar(HR.emision_por_rubro, { corte: corteDe(f, FUENTES_SINTETICAS.rentas), titulos: f.titulos, rubros: f.rubros, ...a }),
  }),
  efecto_resoluciones: adaptador({
    modulo: "rentas",
    args: z.strictObject({}),
    calcular: ({ finanzas: f, rentas: r }) =>
      ejecutar(HR.efecto_resoluciones, {
        corte: corteDe(f, FUENTES_SINTETICAS.rentas),
        titulos: f.titulos,
        resoluciones: r.resoluciones,
        pagos: f.pagos,
        reversos: f.reversos,
        historial: r.historial,
      }),
  }),
  estado_vigente_al_corte: adaptador({
    modulo: "rentas",
    /** `fecha`: estado a una fecha pasada, reconstruido desde el historial; nunca posterior al corte. */
    args: z.strictObject({ fecha: fecha.optional() }),
    calcular: ({ finanzas: f, rentas: r }, a) => {
      const corte = corteDe(f, FUENTES_SINTETICAS.rentas);
      const pedida = a.fecha ? new Date(a.fecha) : null;
      if (pedida && pedida.getTime() > corte.fechaCorte.getTime()) {
        throw new FinanzasError("entrada_invalida", "fecha posterior al corte de la fuente");
      }
      return ejecutar(HR.estado_vigente_al_corte, {
        corte: pedida ? { ...corte, fechaCorte: pedida } : corte,
        titulos: f.titulos,
        historial: r.historial,
      });
    },
  }),
  resumen_coactiva: adaptador({
    modulo: "rentas",
    args: z.strictObject({}),
    calcular: ({ finanzas: f, rentas: r }) =>
      ejecutar(HR.resumen_coactiva, {
        corte: corteDe(f, FUENTES_SINTETICAS.coactiva),
        titulos: f.titulos,
        juicios: f.juicios,
        movimientos: r.movimientos,
      }),
  }),
  recuperacion_coactiva: adaptador({
    modulo: "rentas",
    args: z.strictObject({}),
    calcular: ({ finanzas: f, rentas: r }) =>
      ejecutar(HR.recuperacion_coactiva, {
        corte: corteDe(f, FUENTES_SINTETICAS.coactiva),
        titulos: f.titulos,
        pagos: [...f.pagos, ...r.pagosCoactiva],
        reversos: f.reversos,
        juicios: f.juicios,
        historial: r.historial,
        resoluciones: r.resoluciones,
      }),
  }),
} satisfies Record<NombreHerramientaRentas, unknown>;

const umbralPct = z.number().finite().nonnegative().max(1000).optional();
const tasasEscenario = z.strictObject({ crecimientoIngresos: tasa, crecimientoGastos: tasa });

/** Alertas de desviacion del conjunto de direccion con el umbral dado (insumo del tablero). */
export function alertasDeDireccion(d: DatosDireccion, umbral = UMBRAL_ALERTAS_PCT) {
  return HD.alertas_desviacion.funcion({
    corte: d.corte,
    metas: d.metas,
    observados: d.observados,
    compromisos: d.compromisos,
    umbralPct: umbral,
  });
}

const ADAPTADORES_DIRECCION = {
  avance_vs_meta: adaptador({
    modulo: "direccion",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HD.avance_vs_meta, { corte: d.corte, metas: d.metas, observados: d.observados }),
  }),
  comparativo_interanual: adaptador({
    modulo: "direccion",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HD.comparativo_interanual, { corte: d.corte, observados: d.observados }),
  }),
  consolidar_entidades: adaptador({
    modulo: "direccion",
    args: z.strictObject({}),
    calcular: (d) => ejecutar(HD.consolidar_entidades, { corte: d.corte, entidades: d.entidades, reportes: d.reportes }),
  }),
  proyeccion_escenarios: adaptador({
    modulo: "direccion",
    // Supuestos explicitos: bases y tasas los declara quien consulta; no se infieren.
    args: z.strictObject({
      ingresosBase: importe,
      gastosBase: importe,
      liquidezBase: importe,
      periodos: z.number().int().positive().max(120),
      escenarios: z.strictObject({ base: tasasEscenario, optimista: tasasEscenario, pesimista: tasasEscenario }),
    }),
    calcular: (d, a) => ejecutar(HD.proyeccion_escenarios, { corte: d.corte, ...a }),
  }),
  alertas_desviacion: adaptador({
    modulo: "direccion",
    args: z.strictObject({ umbralPct }),
    calcular: (d, a) => alertasDeDireccion(d, a.umbralPct),
  }),
  tablero_ejecutivo: adaptador({
    modulo: "direccion",
    args: z.strictObject({ umbralPct }),
    calcular: (d, a) => {
      const umbral = a.umbralPct ?? UMBRAL_ALERTAS_PCT;
      const r = ejecutar(HD.tablero_ejecutivo, {
        indicadores: d.indicadores,
        alertas: alertasDeDireccion(d, umbral).valor.alertas,
        compromisos: d.compromisos,
      });
      return { ...r, filtros: [...r.filtros, `alertas de alertas_desviacion con umbral = ${umbral}%`] };
    },
  }),
} satisfies Record<NombreHerramientaDireccion, unknown>;

/** Nombres de herramientas por modulo de datos; no puede haber un nombre en dos modulos. */
export const HERRAMIENTAS_POR_MODULO = {
  finanzas: NOMBRES_HERRAMIENTAS_FINANZAS,
  contable: NOMBRES_HERRAMIENTAS_CONTABLE,
  // finanzas-pagos no exporta NOMBRES_HERRAMIENTAS_PAGOS: se derivan de su objeto de herramientas.
  pagos: Object.keys(HERRAMIENTAS_PAGOS) as NombreHerramientaPagos[],
  rentas: NOMBRES_HERRAMIENTAS_RENTAS,
  direccion: NOMBRES_HERRAMIENTAS_DIRECCION,
} as const satisfies Record<ModuloDatos, readonly string[]>;

/** Nombres que aparecen en mas de un modulo (debe ser vacio). */
export function colisionesDeHerramientas(porModulo: Record<string, readonly string[]>): string[] {
  const vistos = new Map<string, number>();
  for (const nombres of Object.values(porModulo)) {
    for (const n of new Set(nombres)) vistos.set(n, (vistos.get(n) ?? 0) + 1);
  }
  return [...vistos].filter(([, veces]) => veces > 1).map(([n]) => n).sort();
}

const colisiones = colisionesDeHerramientas(HERRAMIENTAS_POR_MODULO);
if (colisiones.length > 0) throw new Error(`Herramientas con nombre repetido entre modulos: ${colisiones.join(", ")}`);

export type NombreHerramientaArea =
  | NombreHerramientaFinanzas
  | NombreHerramientaContable
  | NombreHerramientaPagos
  | NombreHerramientaRentas
  | NombreHerramientaDireccion;

export const ADAPTADORES = {
  ...ADAPTADORES_FINANZAS,
  ...ADAPTADORES_CONTABLE,
  ...ADAPTADORES_PAGOS,
  ...ADAPTADORES_RENTAS,
  ...ADAPTADORES_DIRECCION,
} satisfies Record<NombreHerramientaArea, unknown>;

export const NOMBRES_HERRAMIENTAS_AREA = Object.keys(ADAPTADORES) as NombreHerramientaArea[];

const DESCRIPCIONES: Record<NombreHerramientaArea, string> = Object.fromEntries(
  [H, HC, HP, HR, HD].flatMap((grupo) => Object.entries(grupo).map(([n, h]) => [n, h.descripcion])),
) as Record<NombreHerramientaArea, string>;

/**
 * Registra todas las herramientas de area (de riesgo lectura) leyendo de `fuente`. Cada agente
 * solo ve y usa las de su lista del catalogo. Los errores de dominio (p. ej. cortes distintos)
 * y un modulo que la fuente no provee se devuelven como dato, no como excepcion.
 */
export function crearRegistroFinanzas(
  fuente: FuenteDatos,
  alResultado?: (salida: unknown, nombre: NombreHerramientaArea) => void,
): RegistroHerramientas {
  const registro = new RegistroHerramientas();
  for (const nombre of NOMBRES_HERRAMIENTAS_AREA) {
    const a = ADAPTADORES[nombre] as unknown as Adaptador<ModuloDatos, unknown>;
    registro.registrar(
      definirHerramienta({
        nombre,
        descripcion: DESCRIPCIONES[nombre],
        riesgo: "lectura",
        entrada: a.args,
        async ejecutar(args, ctx) {
          try {
            const datos = await CARGADORES[a.modulo](fuente, ctx.orgId);
            const r = a.calcular(datos, args);
            const salidaCompleta = {
              tipoDatos: fuente.tipo,
              fuente: r.fuente,
              formula: r.formula,
              filtros: r.filtros,
              corte: r.corte,
              valor: r.valor,
            };
            alResultado?.(salidaCompleta, nombre);
            return { ...salidaCompleta, corte: compactar(r.corte), valor: compactar(r.valor) };
          } catch (e) {
            if (e instanceof FinanzasError) {
              const salida = { tipoDatos: fuente.tipo, error: e.codigo, detalle: e.message };
              alResultado?.(salida, nombre);
              return salida;
            }
            if (e instanceof ModuloNoDisponibleError) {
              const salida = { tipoDatos: fuente.tipo, error: "modulo_no_disponible", detalle: e.message };
              alResultado?.(salida, nombre);
              return salida;
            }
            throw e;
          }
        },
      }),
    );
  }
  return registro;
}

/** Alias descriptivo: el registro ya cubre finanzas, contable, pagos, rentas y direccion. */
export const crearRegistroArea = crearRegistroFinanzas;
