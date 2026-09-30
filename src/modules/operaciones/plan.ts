import { z } from "zod";
import {
  AGENTES_AREA,
  CATALOGO_AGENTES_AREA,
  esIdAgenteArea,
  puedeTraspasar,
  HERRAMIENTAS_OBLIGATORIAS_POR_AGENTE,
  type IdAgenteArea,
  type NombreHerramientaArea,
} from "@/modules/agentes-area";
import { MAX_TAREAS, PlanInvalidoError, PlanSchema, validarPlan, type Plan } from "@/orchestration/orchestrator";

export type IdiomaOperacion = "es" | "en";

/** Llamada a herramienta prevista para un paso (la usa el modelo simulado; un modelo real decide). */
export interface LlamadaPrevista {
  nombre: NombreHerramientaArea;
  entrada: Record<string, unknown>;
  /** Alias compatible para guiones de modelos simulados. */
  args: Record<string, unknown>;
}

export interface PasoOperacion {
  clave: string;
  agenteId: IdAgenteArea;
  titulo: string;
  /** Encargo concreto del paso (sin historial: el contexto viaja en el traspaso). */
  instruccion: string;
  herramientasObligatorias: readonly LlamadaPrevista[];
  /** Alias compatible usado por el modelo simulado de pruebas anteriores. */
  herramientas: readonly LlamadaPrevista[];
}

export interface PlanOperacion {
  pasos: PasoOperacion[];
  /** true si lo armo el planificador determinista (modelo simulado o plan del modelo invalido). */
  respaldo: boolean;
  motivoRespaldo?: string;
}

/** El Director siempre cierra la cadena: consolida el entregable. */
export const AGENTE_CONSOLIDADOR: IdAgenteArea = "director";

/**
 * Herramientas previstas por agente para el modo simulado: todas de lectura, permitidas en el
 * catalogo y con argumentos validos sin supuestos (las que exigen supuestos no se preven).
 */
/** Palabras clave (texto sin tildes y en minusculas, en espanol e ingles) y agentes que activan. */
const palabras = (...alternativas: string[]) => new RegExp(`\\b(?:${alternativas.join("|")})\\b`, "u");

const REGLAS: ReadonlyArray<{ patron: RegExp; agentes: readonly IdAgenteArea[] }> = [
  {
    patron: palabras("cartera", "vencid\\w*", "moros\\w*", "deud\\w*", "saldos?", "portfolio", "receivables?", "overdue", "arrears", "debts?"),
    agentes: ["rentas", "cartera"],
  },
  {
    patron: palabras("cobranzas?", "cobros?", "coactiv\\w*", "juicios?", "recuperacion", "collections?", "enforcement", "lawsuits?", "recovery"),
    agentes: ["cartera", "coactiva"],
  },
  { patron: palabras("recaud\\w*", "revenue collection", "collected"), agentes: ["control-estadistica"] },
  {
    patron: palabras("emision\\w*", "rentas?", "impuestos?", "rubros?", "resoluciones?", "issuance", "tax(?:es)?", "levies"),
    agentes: ["rentas"],
  },
  {
    patron: palabras("presupuest\\w*", "partidas?", "certificacion\\w*", "reformas?", "budget\\w*", "appropriations?"),
    agentes: ["presupuestista"],
  },
  {
    patron: palabras("pagos?", "pagar", "pagaduria", "ordenes de pago", "proveedores?", "payments?", "payables?", "suppliers?", "vendors?"),
    agentes: ["pagador", "tesorero"],
  },
  { patron: palabras("cajas?", "cajeros?", "arqueos?", "cash counts?", "cashiers?", "tills?"), agentes: ["cajero-mayor", "tesorero"] },
  {
    patron: palabras("concilia\\w*", "bancos?", "bancari\\w*", "tesoreria", "liquidez", "reconcil\\w*", "banks?", "treasury", "liquidity"),
    agentes: ["tesorero", "contador"],
  },
  { patron: palabras("contab\\w*", "balances?", "asientos?", "accounting", "ledgers?", "journal entries"), agentes: ["contador"] },
  {
    patron: palabras("calidad de (?:los )?datos", "calidad", "duplicad\\w*", "identificacion\\w*", "inconsistencia\\w*", "data quality", "duplicates?"),
    agentes: ["datos", "control-estadistica"],
  },
  { patron: palabras("estadistic\\w*", "cortes?", "statistic\\w*", "cut-?offs?"), agentes: ["control-estadistica"] },
  {
    patron: palabras("proyeccion\\w*", "proyect\\w*", "escenarios?", "planificacion", "interanual", "projections?", "forecasts?", "scenarios?", "planning"),
    agentes: ["planificacion"],
  },
];

/** Orden canonico del flujo SIGF: de la operacion de origen hacia el control y la direccion. */
const ORDEN: readonly IdAgenteArea[] = [
  "pagador",
  "cajero-mayor",
  "tesorero",
  "contador",
  "presupuestista",
  "rentas",
  "cartera",
  "coactiva",
  "datos",
  "control-estadistica",
  "planificacion",
];

/** Cadena por defecto si ninguna palabra clave coincide: nunca se deja una operacion sin plan. */
const POR_DEFECTO: readonly IdAgenteArea[] = ["datos", "control-estadistica"];

export const normalizarTexto = (texto: string) =>
  texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Agentes de area que pide el texto segun las palabras clave, en orden canonico. */
export function agentesPorPalabrasClave(texto: string): IdAgenteArea[] {
  const t = normalizarTexto(texto);
  const elegidos = new Set<IdAgenteArea>();
  for (const regla of REGLAS) if (regla.patron.test(t)) for (const a of regla.agentes) elegidos.add(a);
  return ORDEN.filter((a) => elegidos.has(a));
}

/** Camino mas corto desde `desde` hasta `hacia` por el grafo de colaboradores (sin pasar por el Director). */
function camino(desde: IdAgenteArea, hacia: IdAgenteArea): IdAgenteArea[] | null {
  const previo = new Map<IdAgenteArea, IdAgenteArea | null>([[desde, null]]);
  const cola: IdAgenteArea[] = [desde];
  while (cola.length > 0) {
    const actual = cola.shift() as IdAgenteArea;
    if (actual === hacia) break;
    if (actual === AGENTE_CONSOLIDADOR && actual !== desde) continue;
    for (const siguiente of CATALOGO_AGENTES_AREA[actual].colaboradores) {
      if (previo.has(siguiente)) continue;
      previo.set(siguiente, actual);
      cola.push(siguiente);
    }
  }
  if (!previo.has(hacia)) return null;
  const ruta: IdAgenteArea[] = [];
  for (let a: IdAgenteArea | null = hacia; a !== null; a = previo.get(a) ?? null) ruta.unshift(a);
  return ruta;
}

/**
 * Arma una cadena valida que visita los agentes pedidos en orden y termina en el Director.
 * Entre dos agentes sin traspaso directo usa el camino mas corto del grafo; si no lo hay,
 * el Director hace de intermediario (el Director puede traspasar a cualquiera).
 */
export function cadenaValida(agentes: readonly IdAgenteArea[]): IdAgenteArea[] {
  const objetivos = [...agentes.filter((a) => a !== AGENTE_CONSOLIDADOR), AGENTE_CONSOLIDADOR];
  const cadena: IdAgenteArea[] = [objetivos[0] as IdAgenteArea];
  for (const objetivo of objetivos.slice(1)) {
    const actual = cadena.at(-1) as IdAgenteArea;
    if (actual === objetivo) continue;
    const ruta = camino(actual, objetivo) ?? [actual, AGENTE_CONSOLIDADOR, objetivo];
    for (const a of ruta.slice(1)) if (cadena.at(-1) !== a) cadena.push(a);
  }
  return cadena;
}

const TITULOS: Record<IdiomaOperacion, (nombre: string) => string> = {
  es: (nombre) => `Aporte del ${nombre}`,
  en: (nombre) => `Contribution from ${nombre}`,
};

const herramientasPara = (agenteId: IdAgenteArea): readonly LlamadaPrevista[] =>
  HERRAMIENTAS_OBLIGATORIAS_POR_AGENTE[agenteId].map((llamada) => ({ ...llamada, args: llamada.entrada }));

function instruccionPara(agenteId: IdAgenteArea, texto: string, idioma: IdiomaOperacion, final: boolean): string {
  const area = CATALOGO_AGENTES_AREA[agenteId].area;
  if (idioma === "en") {
    return final
      ? `Operation: ${texto}\nAs financial director, review the executive dashboard and the deviations that frame the previous findings.`
      : `Operation: ${texto}\nContribute the analysis of your area (${area}) with your tools.`;
  }
  return final
    ? `Operación: ${texto}\nComo director financiero, revisa el tablero ejecutivo y las desviaciones que enmarcan los hallazgos previos.`
    : `Operación: ${texto}\nAporta el análisis de tu área (${area}) con tus herramientas.`;
}

export function pasosDeCadena(cadena: readonly IdAgenteArea[], texto: string, idioma: IdiomaOperacion): PasoOperacion[] {
  return cadena.map((agenteId, i) => {
    const herramientasObligatorias = herramientasPara(agenteId);
    return {
      clave: `p${i + 1}-${agenteId}`,
      agenteId,
      titulo: TITULOS[idioma](CATALOGO_AGENTES_AREA[agenteId].nombre),
      instruccion: instruccionPara(agenteId, texto, idioma, i === cadena.length - 1),
      herramientasObligatorias,
      herramientas: herramientasObligatorias,
    };
  });
}

/** PLANIFICADOR DETERMINISTA de respaldo: palabras clave y grafo de colaboradores. */
export function planDeterminista(texto: string, idioma: IdiomaOperacion, motivoRespaldo: string): PlanOperacion {
  const pedidos = agentesPorPalabrasClave(texto);
  const cadena = cadenaValida(pedidos.length > 0 ? pedidos : POR_DEFECTO);
  return { pasos: pasosDeCadena(cadena, texto, idioma), respaldo: true, motivoRespaldo };
}

/** Un traspaso del plan que el grafo de colaboradores no permite. */
export class TraspasoNoPermitidoError extends Error {
  readonly codigo = "traspaso_no_permitido";

  constructor(
    readonly desde: string,
    readonly hacia: string,
  ) {
    super(`Traspaso no permitido: ${desde} -> ${hacia}`);
    this.name = "TraspasoNoPermitidoError";
  }
}

/** Esquema del plan del Director: el de orquestar, con rol restringido a los 12 agentes de area. */
export const PlanDirectorSchema = PlanSchema.extend({
  tareas: PlanSchema.shape.tareas.element
    .extend({ rol: z.enum(AGENTES_AREA.map((a) => a.id) as [IdAgenteArea, ...IdAgenteArea[]]) })
    .array()
    .min(1)
    .max(MAX_TAREAS),
});

/**
 * Convierte el plan del Director (esquema de orquestar) en una cadena de pasos. Exige: plan
 * valido segun validarPlan, cada rol en el catalogo, dependencias en cadena lineal (cada tarea
 * depende de la anterior), cada traspaso permitido por el grafo y el Director al final.
 */
export function planDesdeModelo(plan: Plan, idioma: IdiomaOperacion, texto: string): PlanOperacion {
  validarPlan(plan);
  const tareas = plan.tareas;
  for (const [i, t] of tareas.entries()) {
    if (!esIdAgenteArea(t.rol)) throw new PlanInvalidoError(`rol fuera del catalogo: ${t.rol.slice(0, 40)}`);
    const anterior = tareas[i - 1];
    const esperadas = anterior ? [anterior.clave] : [];
    if (t.deps.length !== esperadas.length || t.deps.some((d) => !esperadas.includes(d))) {
      throw new PlanInvalidoError(`dependencias no lineales en ${t.clave.slice(0, 40)}`);
    }
    if (anterior && !puedeTraspasar(anterior.rol, t.rol)) throw new TraspasoNoPermitidoError(anterior.rol, t.rol);
  }
  const ultimo = tareas.at(-1);
  if (ultimo?.rol !== AGENTE_CONSOLIDADOR) throw new PlanInvalidoError("el plan debe terminar en el Director");
  return {
    respaldo: false,
    pasos: tareas.map((t, i) => {
      const agenteId = t.rol as IdAgenteArea;
      const herramientasObligatorias = herramientasPara(agenteId);
      return {
        clave: t.clave,
        agenteId,
        titulo: t.titulo.slice(0, 200),
        // La descripcion del modelo es texto no confiable: se acota y se ancla a la operacion.
        instruccion: `${instruccionPara(agenteId, texto, idioma, i === tareas.length - 1)}\n${t.descripcion.slice(0, 1000)}`,
        herramientasObligatorias,
        herramientas: herramientasObligatorias,
      };
    }),
  };
}
