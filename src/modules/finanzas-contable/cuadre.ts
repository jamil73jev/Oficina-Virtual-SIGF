import { z } from "zod";
import { Corte, exigirCortesSimultaneos, FinanzasError, type ResultadoCalculo } from "@/modules/finanzas";
import { FilaCuadre, JustificacionCuadre, TramoCuadre } from "./domain";
import { aCentavos, aDolares, filtrosDeCorte } from "./comun";

export const EntradaCuadreFinContPres = z.object({
  /** Corte de la contabilidad. */
  corte: Corte,
  /** Cortes de las demas columnas (fuente, conciliacion, presupuesto): deben ser simultaneos. */
  cortesFuentes: z.array(Corte).optional(),
  filas: z.array(FilaCuadre).min(1),
  justificaciones: z.array(JustificacionCuadre).optional(),
  toleranciaMinutos: z.number().int().nonnegative().optional(),
});
export type EntradaCuadreFinContPres = z.infer<typeof EntradaCuadreFinContPres>;

/** `no_aplica`: concepto sin columna presupuestaria (se muestra, no se trata como faltante). */
export type EstadoTramo = "cuadra" | "justificada" | "pendiente" | "sin_dato" | "no_aplica";

export interface TramoMatriz {
  tramo: TramoCuadre;
  /** Columna izquierda - columna derecha; null si falta alguna. */
  diferencia: number | null;
  justificado: number;
  /** diferencia - justificado; null si falta un dato. */
  pendiente: number | null;
  estado: EstadoTramo;
  justificacionIds: string[];
}

export interface FilaMatriz {
  concepto: string;
  fuente: string;
  valorFuente: number;
  valorConciliado: number | null;
  valorContabilizado: number | null;
  valorPresupuestario: number | null;
  tramos: TramoMatriz[];
}

export interface DiferenciaJustificada {
  concepto: string;
  tramo: TramoCuadre;
  diferencia: number;
  justificado: number;
  justificaciones: { id: string; valor: number; motivo: string; documento: string | null }[];
}

export interface PendientePorResolver {
  concepto: string;
  tramo: TramoCuadre;
  /** null cuando el pendiente es un dato faltante, no un monto. */
  diferencia: number | null;
  pendiente: number | null;
  motivo: "diferencia_sin_justificar" | "justificacion_parcial" | "justificacion_excede_diferencia" | "dato_faltante";
}

export interface CuadreFinContPres {
  matriz: FilaMatriz[];
  diferenciasJustificadas: DiferenciaJustificada[];
  pendientesPorResolver: PendientePorResolver[];
  /** Justificaciones cuyo concepto no esta en la matriz: se informan, no se aplican. */
  justificacionesNoAplicadas: string[];
  /** Sumas de valores absolutos: diferencias de signo contrario no se compensan. */
  totales: { diferenciasAbsolutas: number; justificadoAbsoluto: number; pendienteAbsoluto: number };
  cuadra: boolean;
}

const COLUMNAS: Record<TramoCuadre, [keyof FilaCuadre, keyof FilaCuadre]> = {
  fuente_conciliado: ["valorFuente", "valorConciliado"],
  conciliado_contabilizado: ["valorConciliado", "valorContabilizado"],
  contabilizado_presupuestario: ["valorContabilizado", "valorPresupuestario"],
};

const numero = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Matriz fuente vs conciliado vs contabilizado (vs presupuestario). Cada diferencia se separa en
 * justificada (con documento) y pendiente por resolver; los datos faltantes se listan, no se asumen en 0.
 */
export function cuadreFinContPres(entrada: EntradaCuadreFinContPres): ResultadoCalculo<CuadreFinContPres> {
  const { corte } = entrada;
  const cortes = [corte, ...(entrada.cortesFuentes ?? [])];
  exigirCortesSimultaneos(cortes, entrada.toleranciaMinutos ?? 0);

  const conceptos = new Set<string>();
  for (const f of entrada.filas) {
    if (conceptos.has(f.concepto)) throw new FinanzasError("entrada_invalida", `concepto repetido en el cuadre: ${f.concepto}`);
    conceptos.add(f.concepto);
  }
  const justificaciones = [...new Map((entrada.justificaciones ?? []).map((j) => [j.id, j])).values()];
  const justificacionesNoAplicadas = justificaciones.filter((j) => !conceptos.has(j.concepto)).map((j) => j.id).sort();

  const diferenciasJustificadas: DiferenciaJustificada[] = [];
  const pendientesPorResolver: PendientePorResolver[] = [];
  let diferenciasAbs = 0;
  let justificadoAbs = 0;
  let pendienteAbs = 0;

  const matriz = entrada.filas.map((fila): FilaMatriz => {
    const tramos = TramoCuadre.options.map((tramo): TramoMatriz => {
      const [izq, der] = COLUMNAS[tramo];
      const a = numero(fila[izq]);
      const b = numero(fila[der]);
      const propias = justificaciones.filter((j) => j.concepto === fila.concepto && j.tramo === tramo);
      const justificado = propias.reduce((acc, j) => acc + aCentavos(j.valor), 0);
      const justificacionIds = propias.map((j) => j.id).sort();

      // Sin presupuestario y sin justificaciones: la columna no aplica a este concepto.
      if (tramo === "contabilizado_presupuestario" && b === null && propias.length === 0 && a !== null) {
        return { tramo, diferencia: null, justificado: 0, pendiente: null, estado: "no_aplica", justificacionIds };
      }
      if (a === null || b === null) {
        pendientesPorResolver.push({ concepto: fila.concepto, tramo, diferencia: null, pendiente: null, motivo: "dato_faltante" });
        return { tramo, diferencia: null, justificado: aDolares(justificado), pendiente: null, estado: "sin_dato", justificacionIds };
      }

      const diferencia = aCentavos(a) - aCentavos(b);
      const pendiente = diferencia - justificado;
      diferenciasAbs += Math.abs(diferencia);
      justificadoAbs += Math.abs(justificado);
      pendienteAbs += Math.abs(pendiente);
      if (justificado !== 0) {
        diferenciasJustificadas.push({
          concepto: fila.concepto,
          tramo,
          diferencia: aDolares(diferencia),
          justificado: aDolares(justificado),
          justificaciones: propias.map((j) => ({ id: j.id, valor: j.valor, motivo: j.motivo, documento: j.documento ?? null })),
        });
      }
      if (pendiente !== 0) {
        const excede = justificado !== 0 && Math.abs(justificado) > Math.abs(diferencia);
        pendientesPorResolver.push({
          concepto: fila.concepto,
          tramo,
          diferencia: aDolares(diferencia),
          pendiente: aDolares(pendiente),
          motivo: justificado === 0 ? "diferencia_sin_justificar" : excede ? "justificacion_excede_diferencia" : "justificacion_parcial",
        });
      }
      const estado: EstadoTramo = pendiente !== 0 ? "pendiente" : diferencia === 0 ? "cuadra" : "justificada";
      return { tramo, diferencia: aDolares(diferencia), justificado: aDolares(justificado), pendiente: aDolares(pendiente), estado, justificacionIds };
    });

    return {
      concepto: fila.concepto,
      fuente: fila.fuente,
      valorFuente: fila.valorFuente,
      valorConciliado: fila.valorConciliado ?? null,
      valorContabilizado: fila.valorContabilizado ?? null,
      valorPresupuestario: fila.valorPresupuestario ?? null,
      tramos,
    };
  });

  return {
    valor: {
      matriz,
      diferenciasJustificadas,
      pendientesPorResolver,
      justificacionesNoAplicadas,
      totales: {
        diferenciasAbsolutas: aDolares(diferenciasAbs),
        justificadoAbsoluto: aDolares(justificadoAbs),
        pendienteAbsoluto: aDolares(pendienteAbs),
      },
      cuadra: pendientesPorResolver.length === 0 && justificacionesNoAplicadas.length === 0,
    },
    fuente: [...new Set([corte.fuente, ...entrada.filas.map((f) => f.fuente), ...cortes.map((c) => c.fuente)])].join(", "),
    formula:
      "por concepto: fuente - conciliado, conciliado - contabilizado y contabilizado - presupuestario; " +
      "pendiente = diferencia - justificaciones documentadas del tramo; justificada si pendiente = 0 y diferencia != 0; " +
      "totales en valor absoluto (sin compensar signos)",
    filtros: [...filtrosDeCorte(corte), "cortes simultaneos exigidos", "concepto unico; justificacion.id unico"],
    corte: cortes.length === 1 ? corte : cortes,
  };
}
