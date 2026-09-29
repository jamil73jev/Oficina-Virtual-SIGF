import { z } from "zod";
import { Corte, CortesDistintosError, FinanzasError, type DiferenciaCorte, type ResultadoCalculo } from "./domain";
import { diasEntre, fechaISO } from "./comun";

export const EntradaCompararCortes = z.object({
  mediciones: z
    .array(
      z.object({
        corte: Corte,
        valor: z.number().finite().optional(),
        etiqueta: z.string().optional(),
      }),
    )
    .min(2),
  /** `simultaneo` exige el mismo corte; `evolutivo` ordena cortes distintos en el tiempo. */
  modo: z.enum(["simultaneo", "evolutivo"]).optional(),
  /** Diferencia admitida en la hora de extraccion en modo simultaneo (por defecto 0). */
  toleranciaMinutos: z.number().int().nonnegative().optional(),
});
export type EntradaCompararCortes = z.infer<typeof EntradaCompararCortes>;

export interface FilaComparacion {
  fuente: string;
  etiqueta: string | null;
  fechaCorte: string;
  horaExtraccion: string;
  periodo: string;
  valor: number | null;
  /** Solo en modo evolutivo: cambio frente a la fila anterior. */
  diasDesdeAnterior: number | null;
  variacion: number | null;
}

export interface ComparacionCortes {
  modo: "simultaneo" | "evolutivo";
  filas: FilaComparacion[];
  /** En modo simultaneo: max(valor) - min(valor) entre fuentes. */
  diferenciaMaxima: number | null;
}

export function minutosDelDia(hora: string): number {
  const [h, m, s] = hora.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0) + (s ?? 0) / 60;
}

/** Diferencias entre cortes que impiden tratarlos como simultaneos; vacio si coinciden. */
export function diferenciasDeCorte(cortes: readonly Corte[], toleranciaMinutos = 0): DiferenciaCorte[] {
  const primero = cortes[0];
  if (!primero) return [];
  const fuentes = (valor: (c: Corte) => string) => cortes.map((c) => ({ fuente: c.fuente, valor: valor(c) }));
  const diferencias: DiferenciaCorte[] = [];
  if (cortes.some((c) => diasEntre(c.fechaCorte, primero.fechaCorte) !== 0)) {
    diferencias.push({ campo: "fechaCorte", fuentes: fuentes((c) => fechaISO(c.fechaCorte)) });
  }
  if (cortes.some((c) => c.periodo !== primero.periodo)) {
    diferencias.push({ campo: "periodo", fuentes: fuentes((c) => c.periodo) });
  }
  const minutos = cortes.map((c) => minutosDelDia(c.horaExtraccion));
  if (Math.max(...minutos) - Math.min(...minutos) > toleranciaMinutos) {
    diferencias.push({ campo: "horaExtraccion", fuentes: fuentes((c) => c.horaExtraccion) });
  }
  return diferencias;
}

/** Lanza `CortesDistintosError` si los cortes no son simultaneos. */
export function exigirCortesSimultaneos(cortes: readonly Corte[], toleranciaMinutos = 0): void {
  const diferencias = diferenciasDeCorte(cortes, toleranciaMinutos);
  if (diferencias.length > 0) throw new CortesDistintosError(diferencias);
}

export function compararCortes(entrada: EntradaCompararCortes): ResultadoCalculo<ComparacionCortes> {
  const modo = entrada.modo ?? "simultaneo";
  const tolerancia = entrada.toleranciaMinutos ?? 0;
  const cortes = entrada.mediciones.map((m) => m.corte);
  if (cortes.length < 2) throw new FinanzasError("entrada_invalida", "se requieren al menos dos mediciones");
  if (modo === "simultaneo") exigirCortesSimultaneos(cortes, tolerancia);

  const ordenadas =
    modo === "evolutivo"
      ? [...entrada.mediciones].sort(
          (a, b) =>
            a.corte.fechaCorte.getTime() - b.corte.fechaCorte.getTime() ||
            minutosDelDia(a.corte.horaExtraccion) - minutosDelDia(b.corte.horaExtraccion),
        )
      : entrada.mediciones;

  const filas: FilaComparacion[] = ordenadas.map((m, i) => {
    const anterior = i > 0 ? ordenadas[i - 1] : undefined;
    const evolutivo = modo === "evolutivo" && anterior !== undefined;
    return {
      fuente: m.corte.fuente,
      etiqueta: m.etiqueta ?? null,
      fechaCorte: fechaISO(m.corte.fechaCorte),
      horaExtraccion: m.corte.horaExtraccion,
      periodo: m.corte.periodo,
      valor: m.valor ?? null,
      diasDesdeAnterior: evolutivo ? diasEntre(anterior.corte.fechaCorte, m.corte.fechaCorte) : null,
      variacion:
        evolutivo && m.valor !== undefined && anterior.valor !== undefined
          ? Math.round((m.valor - anterior.valor) * 100) / 100
          : null,
    };
  });
  const valores = filas.map((f) => f.valor).filter((v): v is number => v !== null);

  return {
    valor: {
      modo,
      filas,
      diferenciaMaxima:
        modo === "simultaneo" && valores.length > 1
          ? Math.round((Math.max(...valores) - Math.min(...valores)) * 100) / 100
          : null,
    },
    fuente: [...new Set(cortes.map((c) => c.fuente))].join(" + "),
    formula:
      modo === "simultaneo"
        ? `simultaneo: exige igual fechaCorte, periodo y horaExtraccion (tolerancia ${tolerancia} min); diferenciaMaxima = MAX(valor) - MIN(valor)`
        : "evolutivo: ordena por fechaCorte y horaExtraccion; variacion = valor - valorAnterior",
    filtros: [`modo = ${modo}`],
    corte: cortes,
  };
}
