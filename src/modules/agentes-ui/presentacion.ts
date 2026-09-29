import { mensajesAgentes, type LocaleAgentes } from "./mensajes";

/**
 * Presentacion legible de la demo (sin dependencias de servidor: la usa tambien el panel).
 * La etiqueta interna del sobre de datos no confiables nunca se muestra al usuario.
 */

const SOBRE = /^<datos_herramienta nombre="[^"]*" confiable="false">\n([\s\S]*)\n<\/datos_herramienta>$/;
const ETIQUETA_SOBRE = /<\\?\/?\s*datos_herramienta\b[^>]*>/gi;

/** Salida de una herramienta de area tal como llega al modelo dentro del sobre. */
export interface SalidaHerramienta {
  tipoDatos?: string;
  fuente?: string;
  formula?: string;
  filtros?: string[];
  corte?: unknown;
  valor?: unknown;
  error?: string;
  detalle?: string;
  estado?: string;
}

/** Extrae el JSON del sobre de datos no confiables; null si el contenido no es un sobre valido. */
export function extraerSalida(contenido: string): SalidaHerramienta | null {
  const m = SOBRE.exec(contenido);
  if (!m?.[1]) return null;
  try {
    const v: unknown = JSON.parse(m[1]);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as SalidaHerramienta) : null;
  } catch {
    return null;
  }
}

/** Quita cualquier etiqueta del sobre que haya quedado en un texto destinado al usuario. */
export const limpiarRespuesta = (texto: string) => texto.replace(ETIQUETA_SOBRE, "").trim();

export const leerRuta = (v: unknown, ruta: string): unknown =>
  ruta.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | null | undefined)?.[k], v);

/** "reversosExtemporaneos" -> "reversos extemporaneos"; "a.b" -> "a › b". */
export const etiquetaDeRuta = (ruta: string) =>
  ruta
    .split(".")
    .map((p) => p.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase())
    .join(" › ");

const formatoNumero = (locale: LocaleAgentes) =>
  new Intl.NumberFormat(locale === "es" ? "es-EC" : "en-US", { maximumFractionDigits: 4 });

export function formatearCifra(v: unknown, locale: LocaleAgentes): string {
  const t = mensajesAgentes[locale];
  if (typeof v === "number") return formatoNumero(locale).format(v);
  if (typeof v === "boolean") return v ? t.si : t.no;
  if (typeof v === "string") return v;
  return t.noDisponible;
}

interface CorteSerializado {
  fechaCorte?: unknown;
  horaExtraccion?: unknown;
  periodo?: unknown;
  fuente?: unknown;
}

export function formatearCorte(corte: unknown, locale: LocaleAgentes): string {
  const t = mensajesAgentes[locale];
  const lista = (Array.isArray(corte) ? corte : [corte]) as CorteSerializado[];
  const texto = lista
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const fecha = typeof c.fechaCorte === "string" ? c.fechaCorte.slice(0, 10) : t.noDisponible;
      const hora = typeof c.horaExtraccion === "string" ? c.horaExtraccion : "";
      const partes = [String(c.fuente ?? t.noDisponible), fecha, hora].filter(Boolean).join(" ");
      return `${partes} (${t.periodo} ${String(c.periodo ?? t.noDisponible)})`;
    })
    .join("; ");
  return texto || t.noDisponible;
}

/** Lineas legibles de cifras y procedencia de una salida de herramienta. */
export function lineasSalida(salida: SalidaHerramienta, rutas: readonly string[], locale: LocaleAgentes): string[] {
  const t = mensajesAgentes[locale];
  if (salida.estado) return [`- ${t.sinCifras}: ${salida.estado}`];
  if (salida.error) return [`- ${t.sinCifras}: ${salida.error}`];
  return [
    `## ${t.cifras}`,
    ...rutas.map((r) => `- ${etiquetaDeRuta(r)}: ${formatearCifra(leerRuta(salida.valor, r), locale)}`),
    "",
    `## ${t.procedencia}`,
    `- ${t.fuente}: ${salida.fuente ?? t.noDisponible}`,
    `- ${t.formula}: ${salida.formula ?? t.noDisponible}`,
    `- ${t.filtros}: ${(salida.filtros ?? []).join("; ") || t.noDisponible}`,
    `- ${t.corte}: ${formatearCorte(salida.corte, locale)}`,
  ];
}

export type Bloque =
  | { tipo: "titulo"; texto: string }
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; items: { etiqueta: string | null; texto: string }[] };

/** Convierte la respuesta (Markdown simple) en bloques para el panel, sin etiquetas internas. */
export function bloquesRespuesta(respuesta: string): Bloque[] {
  const bloques: Bloque[] = [];
  for (const cruda of limpiarRespuesta(respuesta).split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (linea.startsWith("#")) {
      bloques.push({ tipo: "titulo", texto: linea.replace(/^#+\s*/, "") });
    } else if (linea.startsWith("- ")) {
      const cuerpo = linea.slice(2);
      const corte = cuerpo.indexOf(": ");
      const item = corte > 0 ? { etiqueta: cuerpo.slice(0, corte), texto: cuerpo.slice(corte + 2) } : { etiqueta: null, texto: cuerpo };
      const ultimo = bloques.at(-1);
      if (ultimo?.tipo === "lista") ultimo.items.push(item);
      else bloques.push({ tipo: "lista", items: [item] });
    } else {
      bloques.push({ tipo: "parrafo", texto: linea });
    }
  }
  return bloques;
}
