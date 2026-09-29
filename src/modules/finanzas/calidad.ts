import { z } from "zod";
import { Contribuyente, Corte, type ResultadoCalculo } from "./domain";
import { filtrosDeCorte } from "./comun";
import { identificacionValida, normalizarIdentificacion } from "./identificacion";

export const EntradaCalidadDatos = z.object({
  corte: Corte,
  contribuyentes: z.array(Contribuyente),
});
export type EntradaCalidadDatos = z.infer<typeof EntradaCalidadDatos>;

export const SIN_PARROQUIA = "(sin parroquia)";

export interface ConteoConIds {
  cantidad: number;
  contribuyenteIds: string[];
}

export interface CalidadDatos {
  /** Todos los contribuyentes: ninguna observacion los excluye. */
  totalGeneral: number;
  identificaciones: {
    /** Validas segun su tipo declarado (cedula o RUC con digito verificador); no es el cruce titulo-juicio. */
    validas: ConteoConIds;
    invalidas: ConteoConIds;
    /** Tipo `otro`: no hay regla que verificar. */
    noVerificables: ConteoConIds;
    /** Misma identificacion normalizada en mas de un contribuyente. */
    duplicadas: { grupos: number; contribuyentes: number; detalle: { identificacion: string; contribuyenteIds: string[] }[] };
  };
  sinParroquia: ConteoConIds;
  sinSector: ConteoConIds;
  /** Falta latitud o longitud, estan fuera de rango, o son (0, 0). */
  sinUbicacionSuficiente: ConteoConIds;
  /** Incluye el grupo `(sin parroquia)`; la suma es `totalGeneral`. */
  porParroquia: { parroquia: string; contribuyentes: number }[];
  cuadra: boolean;
}

const vacio = (v: string | null | undefined): boolean => v === null || v === undefined || v.trim() === "";

function ubicacionSuficiente(c: Contribuyente): boolean {
  const { latitud, longitud } = c;
  if (latitud === null || latitud === undefined || longitud === null || longitud === undefined) return false;
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return false;
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) return false;
  return !(latitud === 0 && longitud === 0);
}

const conteo = (ids: string[]): ConteoConIds => ({ cantidad: ids.length, contribuyenteIds: ids });

export function calidadDatos(entrada: EntradaCalidadDatos): ResultadoCalculo<CalidadDatos> {
  const { corte, contribuyentes } = entrada;
  const validas: string[] = [];
  const invalidas: string[] = [];
  const noVerificables: string[] = [];
  const sinParroquia: string[] = [];
  const sinSector: string[] = [];
  const sinUbicacion: string[] = [];
  const porIdentificacion = new Map<string, string[]>();
  const porParroquia = new Map<string, number>();

  for (const c of contribuyentes) {
    const valida = identificacionValida(c.tipoIdentificacion, c.identificacion);
    (valida === null ? noVerificables : valida ? validas : invalidas).push(c.id);
    const normalizada = normalizarIdentificacion(c.identificacion);
    if (normalizada.length > 0) porIdentificacion.set(normalizada, [...(porIdentificacion.get(normalizada) ?? []), c.id]);
    if (vacio(c.parroquia)) sinParroquia.push(c.id);
    if (vacio(c.sector)) sinSector.push(c.id);
    if (!ubicacionSuficiente(c)) sinUbicacion.push(c.id);
    const parroquia = vacio(c.parroquia) ? SIN_PARROQUIA : (c.parroquia ?? SIN_PARROQUIA).trim();
    porParroquia.set(parroquia, (porParroquia.get(parroquia) ?? 0) + 1);
  }

  const duplicadas = [...porIdentificacion.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([identificacion, ids]) => ({ identificacion, contribuyenteIds: ids }))
    .sort((a, b) => a.identificacion.localeCompare(b.identificacion));
  const parroquias = [...porParroquia.entries()]
    .map(([parroquia, n]) => ({ parroquia, contribuyentes: n }))
    .sort((a, b) => b.contribuyentes - a.contribuyentes || a.parroquia.localeCompare(b.parroquia));

  return {
    valor: {
      totalGeneral: contribuyentes.length,
      identificaciones: {
        validas: conteo(validas),
        invalidas: conteo(invalidas),
        noVerificables: conteo(noVerificables),
        duplicadas: {
          grupos: duplicadas.length,
          contribuyentes: duplicadas.reduce((acc, d) => acc + d.contribuyenteIds.length, 0),
          detalle: duplicadas,
        },
      },
      sinParroquia: conteo(sinParroquia),
      sinSector: conteo(sinSector),
      sinUbicacionSuficiente: conteo(sinUbicacion),
      porParroquia: parroquias,
      cuadra:
        parroquias.reduce((acc, p) => acc + p.contribuyentes, 0) === contribuyentes.length &&
        validas.length + invalidas.length + noVerificables.length === contribuyentes.length,
    },
    fuente: corte.fuente,
    formula:
      "totalGeneral = COUNT(contribuyentes) sin exclusiones; cada observacion se cuenta aparte; " +
      "validas + invalidas + noVerificables = totalGeneral; SUM(porParroquia) = totalGeneral",
    filtros: [...filtrosDeCorte(corte), "ninguna exclusion"],
    corte,
  };
}

export const EntradaContarUnicos = z.object({
  corte: Corte,
  grupos: z.array(z.object({ nombre: z.string().min(1), ids: z.array(z.string()) })),
});
export type EntradaContarUnicos = z.infer<typeof EntradaContarUnicos>;

export interface ConteoUnicos {
  porGrupo: { nombre: string; unicos: number }[];
  /** Suma ingenua de los conteos por grupo (NO es el total de unicos si hay solapamiento). */
  sumaDeGrupos: number;
  /** Tamano de la union: el total correcto. */
  unicosTotales: number;
  /** sumaDeGrupos - unicosTotales. */
  solapamiento: number;
  idsEnVariosGrupos: number;
}

/** Conteo de unicos sobre grupos que pueden solaparse: se hace la union, no la suma. */
export function contarUnicos(entrada: EntradaContarUnicos): ResultadoCalculo<ConteoUnicos> {
  const apariciones = new Map<string, number>();
  const porGrupo = entrada.grupos.map((g) => {
    const unicos = new Set(g.ids);
    for (const id of unicos) apariciones.set(id, (apariciones.get(id) ?? 0) + 1);
    return { nombre: g.nombre, unicos: unicos.size };
  });
  const sumaDeGrupos = porGrupo.reduce((acc, g) => acc + g.unicos, 0);
  return {
    valor: {
      porGrupo,
      sumaDeGrupos,
      unicosTotales: apariciones.size,
      solapamiento: sumaDeGrupos - apariciones.size,
      idsEnVariosGrupos: [...apariciones.values()].filter((n) => n > 1).length,
    },
    fuente: entrada.corte.fuente,
    formula: "unicosTotales = |UNION(grupo.ids)|; nunca SUM(COUNT DISTINCT por grupo)",
    filtros: filtrosDeCorte(entrada.corte),
    corte: entrada.corte,
  };
}
