import { z } from "zod";
import { Contribuyente, Corte, Juicio, Titulo, type ResultadoCalculo } from "./domain";
import { aCentavos, aDolares, filtrosDeCorte } from "./comun";
import { normalizarIdentificacion } from "./identificacion";
import { titulosUnicos } from "./cartera";

/**
 * Cruce titulo-contribuyente-juicio: compara la identificacion del contribuyente del titulo con la
 * que figura en el juicio. No confundir con `calidadDatos.identificaciones.validas`, que solo
 * verifica el formato segun el tipo.
 */

/** Longitud (ya normalizada) fuera de este rango: no puede ser una identificacion. */
export const LONGITUD_MINIMA_IDENTIFICACION = 5;
export const LONGITUD_MAXIMA_IDENTIFICACION = 15;

export const EntradaCruzarIdentificaciones = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  contribuyentes: z.array(Contribuyente),
  juicios: z.array(Juicio),
});
export type EntradaCruzarIdentificaciones = z.infer<typeof EntradaCruzarIdentificaciones>;

export type CategoriaCruce = "coincidente" | "diferente" | "noUtilizable";

export type MotivoNoUtilizable =
  | "titulo_inexistente"
  | "contribuyente_inexistente"
  | "identificacion_contribuyente_inutilizable"
  | "identificacion_demandado_faltante"
  | "identificacion_demandado_inutilizable";

export interface ParCruce {
  tituloId: string;
  juicioId: string;
  contribuyenteId: string | null;
  identificacionContribuyente: string | null;
  identificacionDemandado: string | null;
  categoria: CategoriaCruce;
  motivo?: MotivoNoUtilizable;
}

export interface CruceIdentificaciones {
  /** Un par por juicio: es el total del cruce y no excluye ningun registro. */
  totalPares: number;
  conteos: { coincidentes: number; diferentes: number; noUtilizables: number };
  pares: { coincidentes: ParCruce[]; diferentes: ParCruce[]; noUtilizables: ParCruce[] };
  titulosConJuicio: number;
  titulosConVariosJuicios: number;
  titulosSinJuicio: number;
  /** Valor de los titulos unicos con juicio; un titulo con N juicios suma una sola vez. */
  valorTitulosConJuicio: number;
  juiciosRepetidosDescartados: number;
  filasTituloRepetidas: number;
  cuadra: boolean;
}

type Lectura = { utilizable: true; normalizada: string } | { utilizable: false; normalizada: string; faltante: boolean };

function leer(identificacion: string | null | undefined): Lectura {
  if (identificacion === null || identificacion === undefined) return { utilizable: false, normalizada: "", faltante: true };
  const normalizada = normalizarIdentificacion(identificacion);
  if (normalizada.length === 0) return { utilizable: false, normalizada, faltante: true };
  const largo = normalizada.length;
  if (largo < LONGITUD_MINIMA_IDENTIFICACION || largo > LONGITUD_MAXIMA_IDENTIFICACION) {
    return { utilizable: false, normalizada, faltante: false };
  }
  return { utilizable: true, normalizada };
}

export const FORMULA_CRUCE_IDENTIFICACIONES =
  "un par por cada juicio (titulo x juicio); normalizar = quitar espacios y guiones y pasar a mayusculas; " +
  `utilizable = normalizada con longitud ${LONGITUD_MINIMA_IDENTIFICACION}-${LONGITUD_MAXIMA_IDENTIFICACION}; ` +
  "coincidente = ambas utilizables e iguales; diferente = ambas utilizables y distintas; " +
  "noUtilizable = alguna vacia, faltante, de longitud imposible o sin titulo/contribuyente; " +
  "coincidentes + diferentes + noUtilizables = totalPares = COUNT(juicios unicos); " +
  "valorTitulosConJuicio = SUM(valorEmitido) sobre titulos unicos, una vez por titulo.id";

export function cruzarIdentificaciones(entrada: EntradaCruzarIdentificaciones): ResultadoCalculo<CruceIdentificaciones> {
  const { corte } = entrada;
  const { unicos, filasRepetidas } = titulosUnicos(entrada.titulos);
  const tituloPorId = new Map(unicos.map((t) => [t.id, t]));
  const contribuyentePorId = new Map<string, Contribuyente>();
  for (const c of entrada.contribuyentes) if (!contribuyentePorId.has(c.id)) contribuyentePorId.set(c.id, c);

  const pares: CruceIdentificaciones["pares"] = { coincidentes: [], diferentes: [], noUtilizables: [] };
  const juiciosPorTitulo = new Map<string, number>();
  const juiciosVistos = new Set<string>();
  let repetidos = 0;

  for (const juicio of entrada.juicios) {
    if (juiciosVistos.has(juicio.id)) {
      repetidos++;
      continue;
    }
    juiciosVistos.add(juicio.id);

    const titulo = tituloPorId.get(juicio.tituloId);
    const contribuyente = titulo ? contribuyentePorId.get(titulo.contribuyenteId) : undefined;
    if (titulo) juiciosPorTitulo.set(titulo.id, (juiciosPorTitulo.get(titulo.id) ?? 0) + 1);

    const propia = leer(contribuyente?.identificacion);
    const demandado = leer(juicio.identificacionDemandado);
    const par: ParCruce = {
      tituloId: juicio.tituloId,
      juicioId: juicio.id,
      contribuyenteId: contribuyente?.id ?? titulo?.contribuyenteId ?? null,
      identificacionContribuyente: contribuyente?.identificacion ?? null,
      identificacionDemandado: juicio.identificacionDemandado ?? null,
      categoria: "noUtilizable",
    };

    if (!titulo) par.motivo = "titulo_inexistente";
    else if (!contribuyente) par.motivo = "contribuyente_inexistente";
    else if (!propia.utilizable) par.motivo = "identificacion_contribuyente_inutilizable";
    else if (!demandado.utilizable) {
      par.motivo = demandado.faltante ? "identificacion_demandado_faltante" : "identificacion_demandado_inutilizable";
    } else par.categoria = propia.normalizada === demandado.normalizada ? "coincidente" : "diferente";

    const destino = par.categoria === "coincidente" ? "coincidentes" : par.categoria === "diferente" ? "diferentes" : "noUtilizables";
    pares[destino].push(par);
  }

  const totalPares = pares.coincidentes.length + pares.diferentes.length + pares.noUtilizables.length;
  let valorCentavos = 0;
  let variosJuicios = 0;
  for (const [tituloId, n] of juiciosPorTitulo) {
    valorCentavos += aCentavos(tituloPorId.get(tituloId)?.valorEmitido ?? 0);
    if (n > 1) variosJuicios++;
  }

  return {
    valor: {
      totalPares,
      conteos: {
        coincidentes: pares.coincidentes.length,
        diferentes: pares.diferentes.length,
        noUtilizables: pares.noUtilizables.length,
      },
      pares,
      titulosConJuicio: juiciosPorTitulo.size,
      titulosConVariosJuicios: variosJuicios,
      titulosSinJuicio: unicos.length - juiciosPorTitulo.size,
      valorTitulosConJuicio: aDolares(valorCentavos),
      juiciosRepetidosDescartados: repetidos,
      filasTituloRepetidas: filasRepetidas,
      cuadra: totalPares === juiciosVistos.size,
    },
    fuente: corte.fuente,
    formula: FORMULA_CRUCE_IDENTIFICACIONES,
    filtros: [...filtrosDeCorte(corte), "ninguna exclusion", "juicios con el mismo id se cuentan una vez"],
    corte,
  };
}
