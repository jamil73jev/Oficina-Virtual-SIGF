import { z } from "zod";
import {
  Corte,
  FinanzasError,
  Rubro,
  Titulo,
  titulosUnicos,
  type OrigenRubro,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import { aCentavos, aDolares, dentroDeRango, fechaEntrada, fechaISO, filtrosDeCorte, hastaElCorte } from "@/modules/finanzas/comun";

export const EntradaEmisionPorRubro = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  rubros: z.array(Rubro),
  desde: fechaEntrada.optional(),
  hasta: fechaEntrada.optional(),
  /** Agrupacion de periodos: mes (AAAA-MM) o anio (AAAA). */
  periodicidad: z.enum(["mes", "anio"]).default("mes"),
});
export type EntradaEmisionPorRubro = z.input<typeof EntradaEmisionPorRubro>;

export type TipoEmision = "tributario" | "no_tributario" | "sin_clasificar";

export interface FilaEmision {
  periodo: string;
  rubroId: string;
  rubroNombre: string;
  tipo: TipoEmision;
  origen: OrigenRubro | null;
  titulos: number;
  valorEmitido: number;
}

export interface EmisionPorRubro {
  filas: FilaEmision[];
  totalPorTipo: { tipo: TipoEmision; titulos: number; valorEmitido: number }[];
  totalPorPeriodo: { periodo: string; titulos: number; valorEmitido: number }[];
  totalTitulos: number;
  totalValorEmitido: number;
  titulosPosterioresAlCorte: number;
  titulosFueraDeRango: number;
  titulosSinRubro: string[];
  filasRepetidasDescartadas: number;
}

export const FORMULA_EMISION_POR_RUBRO =
  "valorEmitido(periodo, rubro) = SUM(titulo.valorEmitido) sobre titulos unicos por titulo.id con fechaEmision <= corte " +
  "agrupados por periodo de fechaEmision y rubroId; un titulo pertenece a un solo rubro y periodo, por lo que " +
  "los totales por tipo y periodo no duplican valor; titulos con rubroId sin rubro se reportan como sin_clasificar";

export function emisionPorRubro(entradaCruda: EntradaEmisionPorRubro): ResultadoCalculo<EmisionPorRubro> {
  const entrada = EntradaEmisionPorRubro.parse(entradaCruda);
  const { corte, desde, hasta } = entrada;
  if (desde && hasta && desde.getTime() > hasta.getTime()) throw new FinanzasError("entrada_invalida", "desde > hasta");
  const rubros = new Map(entrada.rubros.map((r) => [r.id, r]));
  const { unicos, filasRepetidas } = titulosUnicos(entrada.titulos);
  const periodoDe = (d: Date) => fechaISO(d).slice(0, entrada.periodicidad === "mes" ? 7 : 4);

  const acumulado = new Map<string, FilaEmision & { centavos: number }>();
  let posteriores = 0;
  let fueraDeRango = 0;
  const sinRubro: string[] = [];
  for (const t of unicos) {
    if (!hastaElCorte(t.fechaEmision, corte)) {
      posteriores++;
      continue;
    }
    if (!dentroDeRango(t.fechaEmision, desde, hasta)) {
      fueraDeRango++;
      continue;
    }
    const rubro = rubros.get(t.rubroId);
    if (!rubro) sinRubro.push(t.id);
    const periodo = periodoDe(t.fechaEmision);
    const clave = `${periodo}|${t.rubroId}`;
    const fila = acumulado.get(clave) ?? {
      periodo,
      rubroId: t.rubroId,
      rubroNombre: rubro?.nombre ?? "(rubro no encontrado)",
      tipo: rubro?.tipo ?? "sin_clasificar",
      origen: rubro?.origen ?? null,
      titulos: 0,
      valorEmitido: 0,
      centavos: 0,
    };
    fila.titulos++;
    fila.centavos += aCentavos(t.valorEmitido);
    acumulado.set(clave, fila);
  }

  const filasCent = [...acumulado.values()].sort(
    (a, b) => a.periodo.localeCompare(b.periodo) || a.rubroId.localeCompare(b.rubroId),
  );
  const agrupar = <K extends string>(clave: (f: FilaEmision) => K) => {
    const mapa = new Map<K, { titulos: number; centavos: number }>();
    for (const f of filasCent) {
      const a = mapa.get(clave(f)) ?? { titulos: 0, centavos: 0 };
      a.titulos += f.titulos;
      a.centavos += f.centavos;
      mapa.set(clave(f), a);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  return {
    valor: {
      filas: filasCent.map(({ centavos, ...f }) => ({ ...f, valorEmitido: aDolares(centavos) })),
      totalPorTipo: agrupar((f) => f.tipo).map(([tipo, a]) => ({
        tipo,
        titulos: a.titulos,
        valorEmitido: aDolares(a.centavos),
      })),
      totalPorPeriodo: agrupar((f) => f.periodo).map(([periodo, a]) => ({
        periodo,
        titulos: a.titulos,
        valorEmitido: aDolares(a.centavos),
      })),
      totalTitulos: filasCent.reduce((s, f) => s + f.titulos, 0),
      totalValorEmitido: aDolares(filasCent.reduce((s, f) => s + f.centavos, 0)),
      titulosPosterioresAlCorte: posteriores,
      titulosFueraDeRango: fueraDeRango,
      titulosSinRubro: sinRubro,
      filasRepetidasDescartadas: filasRepetidas,
    },
    fuente: corte.fuente,
    formula: FORMULA_EMISION_POR_RUBRO,
    filtros: [...filtrosDeCorte(corte, desde, hasta), `periodicidad = ${entrada.periodicidad}`, "titulo.id unico"],
    corte,
  };
}
