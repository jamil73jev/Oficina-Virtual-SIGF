export interface CifraExtraida {
  texto: string;
  valor: number;
  posicion: number;
  porcentaje: boolean;
}

export interface VerificacionCifras {
  verificadas: CifraExtraida[];
  noVerificadas: CifraExtraida[];
}

export type PoliticaCifras = "advertir" | "rechazar";

export class CifrasNoVerificadasError extends Error {
  readonly codigo = "cifras_no_verificadas";

  constructor(readonly cifras: readonly CifraExtraida[]) {
    super(`La respuesta contiene ${cifras.length} cifra(s) no verificadas por las herramientas`);
    this.name = "CifrasNoVerificadasError";
  }
}

const PATRON_NUMERO = /[-+]?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?:\s*%)?/gu;
const PATRONES_EXCLUIDOS = [
  /\b\d{4}-\d{2}(?:-\d{2})?(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/gu,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/gu,
  /\b\d+\s*[-–—]\s*\d+\b/gu,
  /\b[\p{L}_][\p{L}\p{N}_-]*\d[\p{L}\p{N}_-]*\b/gu,
  /\b\d+[\p{L}_][\p{L}\p{N}_-]*\b/gu,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
];

function intervalosExcluidos(texto: string): Array<[number, number]> {
  const intervalos: Array<[number, number]> = [];
  for (const patron of PATRONES_EXCLUIDOS) {
    patron.lastIndex = 0;
    for (const coincidencia of texto.matchAll(patron)) {
      intervalos.push([coincidencia.index, coincidencia.index + coincidencia[0].length]);
    }
  }
  const lineas = /^(\s*)(\d+)[.)](?=\s)/gmu;
  for (const coincidencia of texto.matchAll(lineas)) {
    const inicio = coincidencia.index + coincidencia[1]!.length;
    intervalos.push([inicio, inicio + coincidencia[2]!.length]);
  }
  return intervalos;
}

interface NumeroNormalizado {
  valor: number;
  decimales: number;
  porcentaje: boolean;
  candidatos: Array<{ valor: number; decimales: number }>;
}

function normalizar(textoOriginal: string): NumeroNormalizado | null {
  const porcentaje = textoOriginal.includes("%");
  const texto = textoOriginal.replace(/\s|%/gu, "");
  const signo = texto.startsWith("-") ? -1 : 1;
  const limpio = texto.replace(/^[+-]/u, "");
  const puntos = [...limpio.matchAll(/\./gu)].map((m) => m.index ?? 0);
  const comas = [...limpio.matchAll(/,/gu)].map((m) => m.index ?? 0);
  let separadorDecimal: "." | "," | null = null;
  let ambiguo = false;

  if (puntos.length > 0 && comas.length > 0) {
    separadorDecimal = puntos.at(-1)! > comas.at(-1)! ? "." : ",";
  } else {
    const separadores = puntos.length > 0 ? puntos : comas;
    const separador = puntos.length > 0 ? "." : ",";
    const parteEntera = separadores.length === 1 ? limpio.slice(0, separadores[0]) : "";
    if (separadores.length === 1 && parteEntera === "0") separadorDecimal = separador;
    else if (separadores.length === 1 && limpio.length - separadores[0]! - 1 === 3) ambiguo = true;
    else if (separadores.length === 1) separadorDecimal = separador;
    if (separadores.length > 1 && limpio.length - separadores.at(-1)! - 1 !== 3) separadorDecimal = separador;
  }

  const indiceDecimal = separadorDecimal ? limpio.lastIndexOf(separadorDecimal) : -1;
  const decimales = indiceDecimal < 0 ? 0 : limpio.length - indiceDecimal - 1;
  const entero = indiceDecimal < 0 ? limpio : limpio.slice(0, indiceDecimal);
  const decimal = indiceDecimal < 0 ? "" : limpio.slice(indiceDecimal + 1);
  const canonico = `${entero.replace(/[.,]/gu, "")}${decimal ? `.${decimal}` : ""}`;
  const valor = signo * Number(canonico);
  if (!Number.isFinite(valor)) return null;
  const candidatos = [{ valor, decimales }];
  if (ambiguo) {
    const decimalAmbiguo = signo * Number(limpio.replace(/[.,]/u, "."));
    if (Number.isFinite(decimalAmbiguo) && decimalAmbiguo !== valor) {
      candidatos.push({ valor: decimalAmbiguo, decimales: 3 });
    }
  }
  return { valor, decimales, porcentaje, candidatos };
}

function extraer(texto: string): CifraExtraida[] {
  const excluidos = intervalosExcluidos(texto);
  const cifras: CifraExtraida[] = [];
  PATRON_NUMERO.lastIndex = 0;
  for (const coincidencia of texto.matchAll(PATRON_NUMERO)) {
    const posicion = coincidencia.index;
    const fin = posicion + coincidencia[0].length;
    if (excluidos.some(([desde, hasta]) => posicion < hasta && fin > desde)) continue;
    const anterior = texto[posicion - 1] ?? "";
    const siguiente = texto[fin] ?? "";
    if (/[\p{L}\p{N}_]/u.test(anterior) || /[\p{L}\p{N}_]/u.test(siguiente)) continue;
    const normalizada = normalizar(coincidencia[0]);
    if (normalizada) cifras.push({ texto: coincidencia[0], valor: normalizada.valor, posicion, porcentaje: normalizada.porcentaje });
  }
  return cifras;
}

function cifrasDeHerramientas(valor: unknown, resultado: Array<{ valor: number; porcentaje: boolean }>): void {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    resultado.push({ valor, porcentaje: false });
    return;
  }
  if (typeof valor === "string") {
    for (const cifra of extraer(valor)) {
      const normalizada = normalizar(cifra.texto);
      if (normalizada) {
        resultado.push(...normalizada.candidatos.map((candidato) => ({ valor: candidato.valor, porcentaje: cifra.porcentaje })));
      }
    }
    return;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) cifrasDeHerramientas(item, resultado);
    return;
  }
  if (valor && typeof valor === "object") {
    for (const item of Object.values(valor as Record<string, unknown>)) cifrasDeHerramientas(item, resultado);
  }
}

const redondear = (valor: number, decimales: number) => {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
};

function coincide(cifra: CifraExtraida, herramienta: { valor: number; porcentaje: boolean }): boolean {
  const normalizada = normalizar(cifra.texto);
  if (!normalizada) return false;
  const valoresHerramienta = [herramienta.valor];
  if (cifra.porcentaje && !herramienta.porcentaje) valoresHerramienta.push(herramienta.valor * 100);
  if (!cifra.porcentaje && herramienta.porcentaje) valoresHerramienta.push(herramienta.valor / 100);
  return normalizada.candidatos.some((candidato) =>
    valoresHerramienta.some((valor) => {
      if (Math.abs(candidato.valor - valor) < 1e-9) return true;
      return candidato.decimales <= 2 && candidato.valor === redondear(valor, candidato.decimales);
    }),
  );
}

/** Verifica cifras de una respuesta exclusivamente contra valores emitidos por herramientas. */
export function verificarCifras(respuesta: string, salidasHerramientas: readonly unknown[]): VerificacionCifras {
  const disponibles: Array<{ valor: number; porcentaje: boolean }> = [];
  for (const salida of salidasHerramientas) cifrasDeHerramientas(salida, disponibles);
  const verificadas: CifraExtraida[] = [];
  const noVerificadas: CifraExtraida[] = [];
  for (const cifra of extraer(respuesta)) {
    (disponibles.some((valor) => coincide(cifra, valor)) ? verificadas : noVerificadas).push(cifra);
  }
  return { verificadas, noVerificadas };
}
