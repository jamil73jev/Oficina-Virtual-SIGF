import { z } from "zod";
import { Corte, type ResultadoCalculo } from "@/modules/finanzas";
import { Certificacion, PartidaPresupuestaria, TipoPartida, type Reforma, type TipoReforma } from "./domain";
import { aCentavos, aDolares, fechaISO, filtrosDeCorte, hastaElCorte, proporcion, unicosPorId } from "./comun";

const texto = z.string().min(1);
const ejercicio = z.number().int();

/** Partida del ejercicio con las reformas vigentes al corte y su codificado, en centavos. */
export interface PartidaAlCorte {
  partida: PartidaPresupuestaria;
  reformasAplicadas: Reforma[];
  reformasCentavos: number;
  /** codificado = asignado inicial + reformas (aumentos - disminuciones +/- traspasos). */
  codificadoCentavos: number;
}

export interface PartidasPreparadas {
  partidas: PartidaAlCorte[];
  otroEjercicio: string[];
  duplicadas: string[];
  reformasDuplicadas: string[];
  reformasPosterioresAlCorte: string[];
}

/** Efecto con signo de una reforma sobre el codificado. */
export function efectoReformaCentavos(reforma: Pick<Reforma, "tipo" | "valor">): number {
  const valor = aCentavos(reforma.valor);
  return reforma.tipo === "disminucion" ? -valor : valor;
}

/**
 * Deja las partidas unicas del ejercicio (ordenadas por codigo) y aplica solo las reformas con
 * fecha <= corte. Lo que queda fuera se devuelve por id para informarlo, nunca se descarta en silencio.
 */
export function prepararPartidas(
  partidas: readonly PartidaPresupuestaria[],
  anio: number,
  corte: Corte,
): PartidasPreparadas {
  const { unicos, duplicados } = unicosPorId(partidas);
  const otroEjercicio = unicos.filter((p) => p.ejercicio !== anio).map((p) => p.id).sort();
  const delEjercicio = unicos
    .filter((p) => p.ejercicio === anio)
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.id.localeCompare(b.id));

  const reformasVistas = new Set<string>();
  const reformasDuplicadas = new Set<string>();
  const reformasPosteriores: string[] = [];
  const preparadas = delEjercicio.map((partida): PartidaAlCorte => {
    const reformasAplicadas: Reforma[] = [];
    for (const reforma of partida.reformas) {
      if (reformasVistas.has(reforma.id)) {
        reformasDuplicadas.add(reforma.id);
        continue;
      }
      reformasVistas.add(reforma.id);
      if (hastaElCorte(reforma.fecha, corte)) reformasAplicadas.push(reforma);
      else reformasPosteriores.push(reforma.id);
    }
    const reformasCentavos = reformasAplicadas.reduce((acc, r) => acc + efectoReformaCentavos(r), 0);
    return {
      partida,
      reformasAplicadas,
      reformasCentavos,
      codificadoCentavos: aCentavos(partida.asignadoInicial) + reformasCentavos,
    };
  });

  return {
    partidas: preparadas,
    otroEjercicio,
    duplicadas: duplicados,
    reformasDuplicadas: [...reformasDuplicadas].sort(),
    reformasPosterioresAlCorte: reformasPosteriores.sort(),
  };
}

function filtrosPresupuesto(corte: Corte, anio: number, extra: string[] = []): string[] {
  return [
    `ejercicio = ${anio}`,
    `reforma.fecha <= ${fechaISO(corte.fechaCorte)} (corte ${corte.periodo}, ${corte.horaExtraccion})`,
    "partida.id y reforma.id unicos (duplicados informados aparte)",
    ...extra,
  ];
}

// ---------------------------------------------------------------------------------------------
// ejecucion_presupuestaria
// ---------------------------------------------------------------------------------------------

export const EntradaEjecucionPresupuestaria = z.object({
  corte: Corte,
  ejercicio,
  partidas: z.array(PartidaPresupuestaria),
  tipo: TipoPartida.optional(),
  /** Avance esperado del devengado a la fecha (0-1), p. ej. 8/12 a fin de agosto. */
  avanceEsperado: z.number().min(0).max(1).optional(),
  /** Desvio admitido frente al avance esperado (por defecto 0.10). */
  tolerancia: z.number().min(0).max(1).optional(),
});
export type EntradaEjecucionPresupuestaria = z.infer<typeof EntradaEjecucionPresupuestaria>;

export interface PorcentajesEjecucion {
  /** Proporciones (0-1) sobre el codificado; null si el codificado no es positivo. */
  certificado: number | null;
  comprometido: number | null;
  devengado: number | null;
  recaudadoOPagado: number | null;
}

export interface CifrasEjecucion {
  asignadoInicial: number;
  reformas: number;
  codificado: number;
  certificado: number;
  comprometido: number;
  devengado: number;
  recaudadoOPagado: number;
  /** codificado - devengado. */
  saldoPorDevengar: number;
  porcentajes: PorcentajesEjecucion;
}

export interface FilaEjecucion extends CifrasEjecucion {
  partidaId: string;
  codigo: string;
  nombre: string;
  tipo: TipoPartida;
}

export type TipoDesviacion =
  | "codificado_negativo"
  | "sobreejecucion"
  | "certificado_excede_codificado"
  | "comprometido_excede_certificado"
  | "devengado_excede_comprometido"
  | "recaudado_o_pagado_excede_devengado"
  | "bajo_avance"
  | "sobre_avance";

export interface Desviacion {
  partidaId: string;
  codigo: string;
  tipo: TipoDesviacion;
  /** Exceso en dolares, o diferencia de proporcion frente al avance esperado. */
  valor: number;
  unidad: "dolares" | "proporcion";
  detalle: string;
}

export interface EjecucionPresupuestaria {
  filas: FilaEjecucion[];
  totales: { ingreso: CifrasEjecucion | null; gasto: CifrasEjecucion | null };
  desviaciones: Desviacion[];
  partidasOtroEjercicio: string[];
  partidasDuplicadas: string[];
  reformasDuplicadas: string[];
  reformasPosterioresAlCorte: string[];
}

interface CentavosEjecucion {
  asignado: number;
  reformas: number;
  codificado: number;
  certificado: number;
  comprometido: number;
  devengado: number;
  recaudadoOPagado: number;
}

function centavosDe(p: PartidaAlCorte): CentavosEjecucion {
  return {
    asignado: aCentavos(p.partida.asignadoInicial),
    reformas: p.reformasCentavos,
    codificado: p.codificadoCentavos,
    certificado: aCentavos(p.partida.certificado),
    comprometido: aCentavos(p.partida.comprometido),
    devengado: aCentavos(p.partida.devengado),
    recaudadoOPagado: aCentavos(p.partida.recaudadoOPagado),
  };
}

function cifras(c: CentavosEjecucion): CifrasEjecucion {
  return {
    asignadoInicial: aDolares(c.asignado),
    reformas: aDolares(c.reformas),
    codificado: aDolares(c.codificado),
    certificado: aDolares(c.certificado),
    comprometido: aDolares(c.comprometido),
    devengado: aDolares(c.devengado),
    recaudadoOPagado: aDolares(c.recaudadoOPagado),
    saldoPorDevengar: aDolares(c.codificado - c.devengado),
    porcentajes: {
      certificado: proporcion(c.certificado, c.codificado),
      comprometido: proporcion(c.comprometido, c.codificado),
      devengado: proporcion(c.devengado, c.codificado),
      recaudadoOPagado: proporcion(c.recaudadoOPagado, c.codificado),
    },
  };
}

function sumarEjecucion(filas: readonly CentavosEjecucion[]): CentavosEjecucion {
  const total: CentavosEjecucion = {
    asignado: 0,
    reformas: 0,
    codificado: 0,
    certificado: 0,
    comprometido: 0,
    devengado: 0,
    recaudadoOPagado: 0,
  };
  for (const f of filas) {
    for (const clave of Object.keys(total) as (keyof CentavosEjecucion)[]) total[clave] += f[clave];
  }
  return total;
}

function desviacionesDe(
  p: PartidaAlCorte,
  c: CentavosEjecucion,
  avanceEsperado: number | undefined,
  tolerancia: number,
): Desviacion[] {
  const { id: partidaId, codigo, tipo } = p.partida;
  const lista: Desviacion[] = [];
  const exceso = (t: TipoDesviacion, mayor: number, menor: number, detalle: string) => {
    if (mayor > menor) lista.push({ partidaId, codigo, tipo: t, valor: aDolares(mayor - menor), unidad: "dolares", detalle });
  };

  if (c.codificado < 0) {
    lista.push({
      partidaId,
      codigo,
      tipo: "codificado_negativo",
      valor: aDolares(c.codificado),
      unidad: "dolares",
      detalle: "Las reformas dejan el codificado por debajo de cero",
    });
  }
  // Con codificado negativo la base es 0: ese caso ya lo informa `codificado_negativo`.
  const base = Math.max(c.codificado, 0);
  exceso("sobreejecucion", c.devengado, base, "Devengado mayor que el codificado");
  if (tipo === "gasto") {
    exceso("certificado_excede_codificado", c.certificado, base, "Certificado mayor que el codificado");
    exceso("comprometido_excede_certificado", c.comprometido, c.certificado, "Comprometido mayor que el certificado");
    exceso("devengado_excede_comprometido", c.devengado, c.comprometido, "Devengado mayor que el comprometido");
  }
  exceso(
    "recaudado_o_pagado_excede_devengado",
    c.recaudadoOPagado,
    c.devengado,
    tipo === "gasto" ? "Pagado mayor que el devengado" : "Recaudado mayor que el devengado",
  );

  const avance = proporcion(c.devengado, c.codificado);
  if (avanceEsperado !== undefined && avance !== null) {
    const desvio = Math.round((avance - avanceEsperado) * 10_000) / 10_000;
    if (Math.abs(desvio) > tolerancia) {
      lista.push({
        partidaId,
        codigo,
        tipo: desvio < 0 ? "bajo_avance" : "sobre_avance",
        valor: desvio,
        unidad: "proporcion",
        detalle: `Devengado ${avance} del codificado frente a ${avanceEsperado} esperado (tolerancia ${tolerancia})`,
      });
    }
  }
  return lista;
}

export function ejecucionPresupuestaria(
  entrada: EntradaEjecucionPresupuestaria,
): ResultadoCalculo<EjecucionPresupuestaria> {
  const { corte, tipo, avanceEsperado } = entrada;
  const tolerancia = entrada.tolerancia ?? 0.1;
  const preparadas = prepararPartidas(entrada.partidas, entrada.ejercicio, corte);
  const seleccion = preparadas.partidas.filter((p) => !tipo || p.partida.tipo === tipo);

  const filas: FilaEjecucion[] = [];
  const desviaciones: Desviacion[] = [];
  const porTipo: Record<TipoPartida, CentavosEjecucion[]> = { ingreso: [], gasto: [] };
  for (const p of seleccion) {
    const c = centavosDe(p);
    porTipo[p.partida.tipo].push(c);
    filas.push({ partidaId: p.partida.id, codigo: p.partida.codigo, nombre: p.partida.nombre, tipo: p.partida.tipo, ...cifras(c) });
    desviaciones.push(...desviacionesDe(p, c, avanceEsperado, tolerancia));
  }
  const total = (t: TipoPartida) => (porTipo[t].length === 0 ? null : cifras(sumarEjecucion(porTipo[t])));

  const extra = [];
  if (tipo) extra.push(`partida.tipo = ${tipo}`);
  if (avanceEsperado !== undefined) extra.push(`avance esperado ${avanceEsperado} +/- ${tolerancia}`);
  return {
    valor: {
      filas,
      totales: { ingreso: total("ingreso"), gasto: total("gasto") },
      desviaciones,
      partidasOtroEjercicio: preparadas.otroEjercicio,
      partidasDuplicadas: preparadas.duplicadas,
      reformasDuplicadas: preparadas.reformasDuplicadas,
      reformasPosterioresAlCorte: preparadas.reformasPosterioresAlCorte,
    },
    fuente: corte.fuente,
    formula:
      "codificado = asignado inicial + aumentos - disminuciones +/- traspasos (reformas al corte); " +
      "% certificado, comprometido, devengado y recaudado o pagado = valor / codificado (null si codificado <= 0); " +
      "saldo por devengar = codificado - devengado; desviaciones = excesos entre etapas y frente al avance esperado",
    filtros: filtrosPresupuesto(corte, entrada.ejercicio, extra),
    corte,
  };
}

// ---------------------------------------------------------------------------------------------
// disponibilidad_partida
// ---------------------------------------------------------------------------------------------

export const EntradaDisponibilidadPartida = z.object({
  corte: Corte,
  ejercicio,
  partidas: z.array(PartidaPresupuestaria),
  /** Limita el reporte a estas partidas; sin el filtro se listan todas las de gasto. */
  partidaIds: z.array(texto).optional(),
  /** Certificaciones propuestas; se evaluan en orden, en simulacion, sin crear nada. */
  solicitudes: z.array(z.object({ id: texto, partidaId: texto, valor: z.number().finite().positive() })).optional(),
});
export type EntradaDisponibilidadPartida = z.infer<typeof EntradaDisponibilidadPartida>;

export interface FilaDisponibilidad {
  partidaId: string;
  codigo: string;
  nombre: string;
  codificado: number;
  certificado: number;
  /** codificado - certificado. */
  disponible: number;
  alertaNegativa: boolean;
}

export type MotivoRechazo = "sin_disponibilidad" | "partida_inexistente" | "partida_de_ingreso";

export interface EvaluacionSolicitud {
  solicitudId: string;
  partidaId: string;
  valor: number;
  disponibleAntes: number | null;
  disponibleDespues: number | null;
  resultado: "aprobable" | "rechazada";
  motivo: MotivoRechazo | null;
}

export interface DisponibilidadPartidas {
  filas: FilaDisponibilidad[];
  alertas: { partidaId: string; codigo: string; disponible: number }[];
  solicitudes: EvaluacionSolicitud[];
  /** Partidas pedidas en `partidaIds` que no existen en el ejercicio o son de ingreso. */
  noEncontradas: string[];
  noAplica: string[];
  partidasOtroEjercicio: string[];
  partidasDuplicadas: string[];
}

/** Regla de certificacion: solo se aprueba si el valor no supera la disponibilidad restante. */
export const certificacionAprobable = (valorCentavos: number, disponibleCentavos: number): boolean =>
  valorCentavos > 0 && valorCentavos <= disponibleCentavos;

export function disponibilidadPartida(entrada: EntradaDisponibilidadPartida): ResultadoCalculo<DisponibilidadPartidas> {
  const { corte } = entrada;
  const preparadas = prepararPartidas(entrada.partidas, entrada.ejercicio, corte);
  const porId = new Map(preparadas.partidas.map((p) => [p.partida.id, p]));
  const pedidas = entrada.partidaIds ? new Set(entrada.partidaIds) : null;

  const disponibleCentavos = new Map<string, number>();
  const filas: FilaDisponibilidad[] = [];
  for (const p of preparadas.partidas) {
    if (p.partida.tipo !== "gasto") continue;
    const disponible = p.codificadoCentavos - aCentavos(p.partida.certificado);
    disponibleCentavos.set(p.partida.id, disponible);
    if (pedidas && !pedidas.has(p.partida.id)) continue;
    filas.push({
      partidaId: p.partida.id,
      codigo: p.partida.codigo,
      nombre: p.partida.nombre,
      codificado: aDolares(p.codificadoCentavos),
      certificado: aDolares(aCentavos(p.partida.certificado)),
      disponible: aDolares(disponible),
      alertaNegativa: disponible < 0,
    });
  }

  const solicitudes = (entrada.solicitudes ?? []).map((s): EvaluacionSolicitud => {
    const partida = porId.get(s.partidaId);
    const antes = disponibleCentavos.get(s.partidaId);
    const base = { solicitudId: s.id, partidaId: s.partidaId, valor: s.valor };
    if (!partida || antes === undefined) {
      return {
        ...base,
        disponibleAntes: null,
        disponibleDespues: null,
        resultado: "rechazada",
        motivo: partida ? "partida_de_ingreso" : "partida_inexistente",
      };
    }
    const valor = aCentavos(s.valor);
    if (!certificacionAprobable(valor, antes)) {
      return { ...base, disponibleAntes: aDolares(antes), disponibleDespues: aDolares(antes), resultado: "rechazada", motivo: "sin_disponibilidad" };
    }
    disponibleCentavos.set(s.partidaId, antes - valor);
    return { ...base, disponibleAntes: aDolares(antes), disponibleDespues: aDolares(antes - valor), resultado: "aprobable", motivo: null };
  });

  const pedidasLista = [...(pedidas ?? [])];
  const extra = pedidas ? [`partida.id en [${pedidasLista.join(", ")}]`] : [];
  if (entrada.solicitudes?.length) extra.push("solicitudes evaluadas en orden; simulacion: no crea certificaciones");
  return {
    valor: {
      filas,
      alertas: filas.filter((f) => f.alertaNegativa).map((f) => ({ partidaId: f.partidaId, codigo: f.codigo, disponible: f.disponible })),
      solicitudes,
      noEncontradas: pedidasLista.filter((id) => !porId.has(id)).sort(),
      noAplica: pedidasLista.filter((id) => porId.get(id)?.partida.tipo === "ingreso").sort(),
      partidasOtroEjercicio: preparadas.otroEjercicio,
      partidasDuplicadas: preparadas.duplicadas,
    },
    fuente: corte.fuente,
    formula:
      "disponible = codificado - certificado, con codificado = asignado inicial + reformas al corte; " +
      "alerta si disponible < 0; una solicitud se rechaza si su valor supera el disponible restante",
    filtros: filtrosPresupuesto(corte, entrada.ejercicio, ["partida.tipo = gasto", ...extra]),
    corte,
  };
}

// ---------------------------------------------------------------------------------------------
// reformas_certificaciones
// ---------------------------------------------------------------------------------------------

export const EntradaReformasCertificaciones = z.object({
  corte: Corte,
  ejercicio,
  partidas: z.array(PartidaPresupuestaria),
  certificaciones: z.array(Certificacion),
});
export type EntradaReformasCertificaciones = z.infer<typeof EntradaReformasCertificaciones>;

export interface ResumenMonto {
  cantidad: number;
  valor: number;
}

export interface EquilibrioPresupuestario {
  ingresos: number;
  gastos: number;
  /** ingresos - gastos. */
  diferencia: number;
}

export interface ReformasCertificaciones {
  reformas: {
    /** Cantidad y suma de magnitudes por tipo (un traspaso cuenta tanto lo cedido como lo recibido). */
    porTipo: Record<TipoReforma, ResumenMonto>;
    /** Suma con signo de todos los traspasos: debe ser 0. */
    traspasosNeto: number;
    /** Resoluciones (referencia) cuyos traspasos no suman 0. */
    traspasosDescuadrados: { referencia: string; neto: number; reformaIds: string[] }[];
    /** Reformas cuyo partidaId no coincide con la partida que las contiene. */
    partidaInconsistente: { reformaId: string; partidaId: string; declarada: string }[];
    netoIngresos: number;
    netoGastos: number;
    /** null si no hay partidas de ingreso o de gasto: el equilibrio no se puede verificar. */
    equilibrioReformas: EquilibrioPresupuestario | null;
    equilibrioInicial: EquilibrioPresupuestario | null;
    equilibrioCodificado: EquilibrioPresupuestario | null;
    partidasCodificadoNegativo: { partidaId: string; codigo: string; codificado: number }[];
    duplicadas: string[];
    posterioresAlCorte: string[];
    /** true/false si es verificable; null si falta informacion para verificar el equilibrio. */
    cuadran: boolean | null;
  };
  certificaciones: {
    porEstado: Record<"emitida" | "comprometida" | "anulada", ResumenMonto>;
    /** Emitidas + comprometidas. */
    vigentes: ResumenMonto;
    sinComprometer: { certificacionId: string; partidaId: string; valor: number }[];
    /** Suma de certificaciones vigentes frente al certificado de la partida. */
    diferenciasConPartida: { partidaId: string; codigo: string; certificadoPartida: number; sumaCertificaciones: number; diferencia: number }[];
    sinPartida: string[];
    enPartidaDeIngreso: string[];
    duplicadas: string[];
    posterioresAlCorte: string[];
  };
  observaciones: string[];
}

function equilibrio(ingresos: number[], gastos: number[]): EquilibrioPresupuestario | null {
  if (ingresos.length === 0 || gastos.length === 0) return null;
  const i = ingresos.reduce((a, b) => a + b, 0);
  const g = gastos.reduce((a, b) => a + b, 0);
  return { ingresos: aDolares(i), gastos: aDolares(g), diferencia: aDolares(i - g) };
}

export function reformasCertificaciones(
  entrada: EntradaReformasCertificaciones,
): ResultadoCalculo<ReformasCertificaciones> {
  const { corte } = entrada;
  const preparadas = prepararPartidas(entrada.partidas, entrada.ejercicio, corte);
  const observaciones: string[] = [];

  const porTipo: Record<TipoReforma, { cantidad: number; centavos: number }> = {
    aumento: { cantidad: 0, centavos: 0 },
    disminucion: { cantidad: 0, centavos: 0 },
    traspaso: { cantidad: 0, centavos: 0 },
  };
  const grupos = new Map<string, { neto: number; ids: string[] }>();
  const partidaInconsistente: ReformasCertificaciones["reformas"]["partidaInconsistente"] = [];
  let traspasosNeto = 0;
  for (const p of preparadas.partidas) {
    for (const r of p.reformasAplicadas) {
      const efecto = efectoReformaCentavos(r);
      porTipo[r.tipo].cantidad++;
      porTipo[r.tipo].centavos += Math.abs(efecto); // magnitud; el signo del traspaso va en traspasosNeto
      if (r.partidaId !== p.partida.id) {
        partidaInconsistente.push({ reformaId: r.id, partidaId: p.partida.id, declarada: r.partidaId });
      }
      if (r.tipo === "traspaso") {
        traspasosNeto += efecto;
        const clave = r.referencia ?? "(sin referencia)";
        const g = grupos.get(clave) ?? { neto: 0, ids: [] };
        g.neto += efecto;
        g.ids.push(r.id);
        grupos.set(clave, g);
      }
    }
  }
  const traspasosDescuadrados = [...grupos.entries()]
    .filter(([, g]) => g.neto !== 0)
    .map(([referencia, g]) => ({ referencia, neto: aDolares(g.neto), reformaIds: g.ids.sort() }))
    .sort((a, b) => a.referencia.localeCompare(b.referencia));

  const deTipo = (t: TipoPartida) => preparadas.partidas.filter((p) => p.partida.tipo === t);
  const ingresos = deTipo("ingreso");
  const gastos = deTipo("gasto");
  const netoIngresos = ingresos.reduce((a, p) => a + p.reformasCentavos, 0);
  const netoGastos = gastos.reduce((a, p) => a + p.reformasCentavos, 0);
  const equilibrioReformas = equilibrio(ingresos.map((p) => p.reformasCentavos), gastos.map((p) => p.reformasCentavos));
  const equilibrioInicial = equilibrio(
    ingresos.map((p) => aCentavos(p.partida.asignadoInicial)),
    gastos.map((p) => aCentavos(p.partida.asignadoInicial)),
  );
  const equilibrioCodificado = equilibrio(ingresos.map((p) => p.codificadoCentavos), gastos.map((p) => p.codificadoCentavos));
  if (!equilibrioReformas) {
    observaciones.push("Faltan partidas de ingreso o de gasto del ejercicio: no se puede verificar el equilibrio presupuestario");
  }
  const partidasCodificadoNegativo = preparadas.partidas
    .filter((p) => p.codificadoCentavos < 0)
    .map((p) => ({ partidaId: p.partida.id, codigo: p.partida.codigo, codificado: aDolares(p.codificadoCentavos) }));

  const verificacionesLocales =
    traspasosNeto === 0 &&
    traspasosDescuadrados.length === 0 &&
    partidaInconsistente.length === 0 &&
    preparadas.reformasDuplicadas.length === 0 &&
    partidasCodificadoNegativo.length === 0;
  const cuadran = !verificacionesLocales
    ? false
    : equilibrioReformas === null
      ? null
      : equilibrioReformas.diferencia === 0;

  // Certificaciones
  const { unicos: certUnicas, duplicados: certDuplicadas } = unicosPorId(entrada.certificaciones);
  const posteriores = certUnicas.filter((c) => c.fecha && !hastaElCorte(c.fecha, corte)).map((c) => c.id).sort();
  const certificaciones = certUnicas
    .filter((c) => !c.fecha || hastaElCorte(c.fecha, corte))
    .sort((a, b) => a.id.localeCompare(b.id));
  const partidaPorId = new Map(preparadas.partidas.map((p) => [p.partida.id, p]));
  const porEstado = {
    emitida: { cantidad: 0, centavos: 0 },
    comprometida: { cantidad: 0, centavos: 0 },
    anulada: { cantidad: 0, centavos: 0 },
  };
  const vigentesPorPartida = new Map<string, number>();
  const sinPartida: string[] = [];
  const enPartidaDeIngreso: string[] = [];
  for (const c of certificaciones) {
    porEstado[c.estado].cantidad++;
    porEstado[c.estado].centavos += aCentavos(c.valor);
    const partida = partidaPorId.get(c.partidaId);
    if (!partida) sinPartida.push(c.id);
    else if (partida.partida.tipo === "ingreso") enPartidaDeIngreso.push(c.id);
    if (c.estado !== "anulada") vigentesPorPartida.set(c.partidaId, (vigentesPorPartida.get(c.partidaId) ?? 0) + aCentavos(c.valor));
  }
  const diferenciasConPartida = gastos
    .map((p) => {
      const suma = vigentesPorPartida.get(p.partida.id) ?? 0;
      const certificado = aCentavos(p.partida.certificado);
      return {
        partidaId: p.partida.id,
        codigo: p.partida.codigo,
        certificadoPartida: aDolares(certificado),
        sumaCertificaciones: aDolares(suma),
        diferencia: aDolares(suma - certificado),
      };
    })
    .filter((d) => d.diferencia !== 0);
  const resumen = (x: { cantidad: number; centavos: number }): ResumenMonto => ({ cantidad: x.cantidad, valor: aDolares(x.centavos) });

  return {
    valor: {
      reformas: {
        porTipo: { aumento: resumen(porTipo.aumento), disminucion: resumen(porTipo.disminucion), traspaso: resumen(porTipo.traspaso) },
        traspasosNeto: aDolares(traspasosNeto),
        traspasosDescuadrados,
        partidaInconsistente,
        netoIngresos: aDolares(netoIngresos),
        netoGastos: aDolares(netoGastos),
        equilibrioReformas,
        equilibrioInicial,
        equilibrioCodificado,
        partidasCodificadoNegativo,
        duplicadas: preparadas.reformasDuplicadas,
        posterioresAlCorte: preparadas.reformasPosterioresAlCorte,
        cuadran,
      },
      certificaciones: {
        porEstado: { emitida: resumen(porEstado.emitida), comprometida: resumen(porEstado.comprometida), anulada: resumen(porEstado.anulada) },
        vigentes: resumen({
          cantidad: porEstado.emitida.cantidad + porEstado.comprometida.cantidad,
          centavos: porEstado.emitida.centavos + porEstado.comprometida.centavos,
        }),
        sinComprometer: certificaciones
          .filter((c) => c.estado === "emitida")
          .map((c) => ({ certificacionId: c.id, partidaId: c.partidaId, valor: aDolares(aCentavos(c.valor)) })),
        diferenciasConPartida,
        sinPartida,
        enPartidaDeIngreso,
        duplicadas: certDuplicadas,
        posterioresAlCorte: posteriores,
      },
      observaciones,
    },
    fuente: corte.fuente,
    formula:
      "reformas: aumento suma, disminucion resta, traspaso con signo; cuadran si traspasos netos = 0 (total y por referencia), " +
      "neto reformas ingresos = neto reformas gastos, ninguna partida queda con codificado < 0 y no hay ids duplicados ni inconsistentes; " +
      "certificaciones vigentes = emitidas + comprometidas; sin comprometer = emitidas; diferencia = suma vigentes - certificado de la partida",
    filtros: filtrosPresupuesto(corte, entrada.ejercicio, [
      ...filtrosDeCorte(corte).map((f) => `certificacion.${f} (si informa fecha)`),
      "certificacion.id unico",
    ]),
    corte,
  };
}
