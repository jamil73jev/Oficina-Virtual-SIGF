import { formatCurrency, formatNumber } from "@/core/i18n/format";
import type { Locale } from "@/core/i18n/config";

export type IdiomaTabla = Locale;

export interface CeldaTabla {
  columna: string;
  texto: string;
  /** Valor sin formatear, conservado para trazabilidad y pruebas. */
  valorExacto: unknown;
}

export interface FilaTabla {
  celdas: CeldaTabla[];
}

export interface TablaHerramienta {
  titulo: string;
  ruta: string;
  columnas: Array<{ clave: string; etiqueta: string }>;
  filas: FilaTabla[];
  /** Cantidad exacta antes del recorte visual. */
  filasTotales: number;
  /** Filas completas para exportación; el servicio no las publica en eventos. */
  filasCompletas?: FilaTabla[];
  avisoFilas?: string;
  avisoTablas?: string;
  tablasOmitidas?: string[];
  fuente: string;
  formula: string;
  filtros: string[];
  corte: unknown;
}

export const MAX_FILAS_TABLA = 200;
export const MAX_TABLAS_HERRAMIENTA = 8;

interface SalidaRenderizable {
  herramienta?: unknown;
  fuente?: unknown;
  formula?: unknown;
  filtros?: unknown;
  corte?: unknown;
  valor?: unknown;
  error?: unknown;
  detalle?: unknown;
  estado?: unknown;
}

const DICCIONARIO: Record<IdiomaTabla, Record<string, string>> = {
  es: {
    clave: "Clave", valor: "Valor", tramo: "Tramo", titulos: "Títulos", saldo: "Saldo",
    proporcion: "Proporción", porcentaje: "Porcentaje", porcentajeAcumulado: "Porcentaje acumulado",
    recaudadoOPagado: "Recaudado o pagado", totalSaldo: "Saldo total", porVencer: "Por vencer",
    error: "Error", detalle: "Detalle", estado: "Estado",
  },
  en: {
    clave: "Key", valor: "Value", tramo: "Band", titulos: "Titles", saldo: "Balance",
    proporcion: "Proportion", porcentaje: "Percentage", porcentajeAcumulado: "Cumulative percentage",
    recaudadoOPagado: "Collected or paid", totalSaldo: "Total balance", porVencer: "Not yet due",
    error: "Error", detalle: "Detail", estado: "Status",
  },
};

const PALABRAS: Record<IdiomaTabla, Record<string, string>> = {
  es: { o: "o", por: "por", de: "de", sin: "sin", total: "total" },
  en: { o: "or", por: "by", de: "of", sin: "without", total: "total" },
};

/** Convierte camelCase y snake_case en una etiqueta legible y localizable. */
export function etiquetaCampo(campo: string, idioma: IdiomaTabla, diccionario: Record<string, string> = {}): string {
  const conocida = diccionario[campo] ?? DICCIONARIO[idioma][campo];
  if (conocida) return conocida;
  const palabras = campo
    .replace(/_/gu, " ")
    .replace(/([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])/gu, "$1 $2")
    .trim()
    .split(/\s+/u)
    .map((palabra) => PALABRAS[idioma][palabra.toLowerCase()] ?? palabra.toLowerCase());
  const texto = palabras.join(" ");
  return texto ? texto[0]!.toUpperCase() + texto.slice(1) : campo;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor) && !(valor instanceof Date);

const esMoneda = (clave: string) =>
  /(?:saldo|valor|monto|bruto|neto|pagado|recaudado|devengado|codificado|asignado|reformas|certificado|comprometido|disponibilidad|liquidez|diferencia)/iu.test(clave) &&
  !/(?:porcentaje|proporcion|cantidad|cuadra)/iu.test(clave);

function formatear(valor: unknown, clave: string, idioma: IdiomaTabla): string {
  if (typeof valor === "number") return esMoneda(clave) ? formatCurrency(valor, idioma) : formatNumber(valor, idioma);
  if (typeof valor === "boolean") return valor ? (idioma === "es" ? "Sí" : "Yes") : (idioma === "es" ? "No" : "No");
  if (valor === null || valor === undefined) return idioma === "es" ? "No disponible" : "Not available";
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) {
    const cortos = valor.length <= 3 && valor.every((item) => !esObjeto(item) && !Array.isArray(item));
    return cortos && valor.length > 0
      ? `${formatNumber(valor.length, idioma)}: ${valor.map((item) => formatear(item, clave, idioma)).join("; ")}`
      : formatNumber(valor.length, idioma);
  }
  if (esObjeto(valor)) {
    const entradas = Object.entries(valor);
    return entradas.length <= 3 && entradas.every(([, item]) => !esObjeto(item) && !Array.isArray(item))
      ? entradas.map(([campo, item]) => `${etiquetaCampo(campo, idioma)}: ${formatear(item, `${clave}.${campo}`, idioma)}`).join("; ")
      : formatNumber(entradas.length, idioma);
  }
  return String(valor);
}

function tablaDeFilas(
  filasCrudas: readonly Record<string, unknown>[],
  ruta: string,
  idioma: IdiomaTabla,
  metadatos: Pick<TablaHerramienta, "fuente" | "formula" | "filtros" | "corte">,
  clavesDeFormato?: readonly string[],
): TablaHerramienta {
  const encontradas = [...new Set(filasCrudas.flatMap((fila) => Object.keys(fila)))];
  const claves = encontradas.length > 0 ? encontradas : ["valor"];
  const filasCompletas = filasCrudas.map((fila, indice) => ({
    celdas: claves.map((clave) => ({
      columna: clave,
      texto: formatear(fila[clave], `${ruta}.${clave === "valor" ? (clavesDeFormato?.[indice] ?? clave) : clave}`, idioma),
      valorExacto: fila[clave],
    })),
  }));
  const filasTotales = filasCompletas.length;
  const filas = filasCompletas.slice(0, MAX_FILAS_TABLA);
  return {
    titulo: ruta.split(".").map((parte) => etiquetaCampo(parte, idioma)).join(" — "),
    ruta,
    columnas: claves.map((clave) => ({ clave, etiqueta: etiquetaCampo(clave, idioma) })),
    filas,
    filasTotales,
    ...(filasTotales > filas.length ? {
      filasCompletas,
      avisoFilas: idioma === "es"
        ? `Mostrando ${formatNumber(filas.length, idioma)} de ${formatNumber(filasTotales, idioma)} filas`
        : `Showing ${formatNumber(filas.length, idioma)} of ${formatNumber(filasTotales, idioma)} rows`,
    } : {}),
    ...metadatos,
  };
}

function recorrer(
  valor: unknown,
  ruta: string,
  idioma: IdiomaTabla,
  metadatos: Pick<TablaHerramienta, "fuente" | "formula" | "filtros" | "corte">,
  tablas: TablaHerramienta[],
  profundidad = 0,
): void {
  if (Array.isArray(valor)) {
    const filas = valor.map((item) => esObjeto(item)
      ? Object.fromEntries(Object.entries(item))
      : { valor: item });
    tablas.push(tablaDeFilas(filas, ruta, idioma, metadatos));
    return;
  }
  if (!esObjeto(valor)) {
    tablas.push(tablaDeFilas([{ valor }], ruta, idioma, metadatos));
    return;
  }

  const escalares = Object.fromEntries(Object.entries(valor).filter(([, item]) => !Array.isArray(item) && !esObjeto(item)));
  if (Object.keys(escalares).length > 0) {
    const filas = Object.entries(escalares).map(([clave, item]) => ({ clave: etiquetaCampo(clave, idioma), valor: item }));
    tablas.push(tablaDeFilas(filas, ruta, idioma, metadatos, Object.keys(escalares)));
  }
  if (profundidad >= 2) return;
  for (const [clave, item] of Object.entries(valor)) {
    if (Array.isArray(item) || esObjeto(item)) recorrer(item, `${ruta}.${clave}`, idioma, metadatos, tablas, profundidad + 1);
  }
}

/** Convierte resultados completos de herramientas en tablas deterministas, sin omitir filas ni columnas. */
export function renderizarTablas(salidasHerramientas: readonly unknown[], idioma: IdiomaTabla = "es"): TablaHerramienta[] {
  const tablas: TablaHerramienta[] = [];
  salidasHerramientas.forEach((cruda, indice) => {
    if (!esObjeto(cruda)) return;
    const salida = cruda as SalidaRenderizable;
    const herramienta = typeof salida.herramienta === "string" ? salida.herramienta : `herramienta_${indice + 1}`;
    const metadatos = {
      fuente: typeof salida.fuente === "string" ? salida.fuente : "",
      formula: typeof salida.formula === "string" ? salida.formula : "",
      filtros: Array.isArray(salida.filtros) ? salida.filtros.filter((f): f is string => typeof f === "string") : [],
      corte: salida.corte,
    };
    const valor = salida.valor ?? { error: salida.error, detalle: salida.detalle, estado: salida.estado };
    const candidatas: TablaHerramienta[] = [];
    recorrer(valor, herramienta, idioma, metadatos, candidatas);
    const prioridad = (tabla: TablaHerramienta) => /(?:resumen|total|totales|consolid|indicador)/iu.test(tabla.ruta) ? 0 : 1;
    const ordenadas = candidatas.map((tabla, orden) => ({ tabla, orden })).sort((a, b) => prioridad(a.tabla) - prioridad(b.tabla) || a.orden - b.orden);
    const visibles = ordenadas.slice(0, MAX_TABLAS_HERRAMIENTA).map(({ tabla }) => tabla);
    const omitidas = ordenadas.slice(MAX_TABLAS_HERRAMIENTA).map(({ tabla }) => tabla.titulo);
    if (omitidas.length > 0 && visibles[0]) {
      visibles[0].tablasOmitidas = omitidas;
      visibles[0].avisoTablas = idioma === "es"
        ? `Se omitieron ${formatNumber(omitidas.length, idioma)} tablas de detalle: ${omitidas.join("; ")}`
        : `${formatNumber(omitidas.length, idioma)} detail tables omitted: ${omitidas.join("; ")}`;
    }
    tablas.push(...visibles);
  });
  return tablas;
}

const csvCelda = (valor: string) => `"${valor.replace(/"/gu, '""')}"`;

/** Exporta siempre el conjunto completo cuando la tabla conserva sus filas originales. */
export function tablaACsv(tabla: TablaHerramienta): string {
  const filas = tabla.filasCompletas ?? tabla.filas;
  return [
    tabla.columnas.map((columna) => csvCelda(columna.etiqueta)).join(","),
    ...filas.map((fila) => tabla.columnas.map((columna) => csvCelda(fila.celdas.find((celda) => celda.columna === columna.clave)?.texto ?? "")).join(",")),
  ].join("\r\n");
}

const escapar = (texto: string) => texto.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
const corteLegible = (corte: unknown): string => {
  if (Array.isArray(corte)) return corte.map(corteLegible).join("; ");
  if (esObjeto(corte)) return Object.entries(corte).map(([clave, valor]) => `${clave}: ${corteLegible(valor)}`).join(", ");
  if (corte instanceof Date) return corte.toISOString();
  return String(corte ?? "");
};

export function tablasAMarkdown(tablas: readonly TablaHerramienta[], idioma: IdiomaTabla): string {
  const fuente = idioma === "es" ? "Fuente" : "Source";
  const formula = idioma === "es" ? "Fórmula" : "Formula";
  const filtros = idioma === "es" ? "Filtros" : "Filters";
  const corte = idioma === "es" ? "Corte" : "Cut-off";
  return tablas.map((tabla) => [
    `## ${tabla.titulo}`,
    ...(tabla.avisoFilas ? [`> ${tabla.avisoFilas}`] : []),
    ...(tabla.avisoTablas ? [`> ${tabla.avisoTablas}`] : []),
    `| ${tabla.columnas.map((columna) => escapar(columna.etiqueta)).join(" | ")} |`,
    `| ${tabla.columnas.map(() => "---").join(" | ")} |`,
    ...tabla.filas.map((fila) => `| ${fila.celdas.map((celda) => escapar(celda.texto)).join(" | ")} |`),
    `- ${fuente}: ${tabla.fuente}`,
    `- ${formula}: ${tabla.formula}`,
    `- ${filtros}: ${tabla.filtros.join("; ")}`,
    `- ${corte}: ${corteLegible(tabla.corte)}`,
  ].join("\n")).join("\n\n");
}
