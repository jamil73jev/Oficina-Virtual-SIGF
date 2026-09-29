import { z } from "zod";
import { Corte, type ResultadoCalculo } from "@/modules/finanzas";
import { aCentavos, aDolares } from "@/modules/finanzas/comun";
import { Caja, NovedadCaja, Turno } from "./domain";

export const EntradaArqueoCaja = z.strictObject({
  corte: Corte,
  turnos: z.array(Turno),
  novedades: z.array(NovedadCaja).default([]),
});

export function arqueoCaja(entrada: z.output<typeof EntradaArqueoCaja>): ResultadoCalculo<{
  totalTurnos: number;
  cerrados: number;
  sinCierre: string[];
  sobrante: number;
  faltante: number;
  cuadre: boolean;
  detalle: { turnoId: string; esperado: number; contado: number | null; diferencia: number | null; estado: string; novedades: number }[];
}> {
  let sobrante = 0;
  let faltante = 0;
  const sinCierre: string[] = [];
  const detalle = entrada.turnos.map((turno) => {
    const esperado = aCentavos(turno.fondoInicial) + aCentavos(turno.recaudadoSistema);
    const novedades = entrada.novedades.filter((n) => n.turnoId === turno.id).length;
    if (!turno.cierre || turno.contadoFisico === undefined) {
      sinCierre.push(turno.id);
      return { turnoId: turno.id, esperado: aDolares(esperado), contado: null, diferencia: null, estado: "sin_cierre", novedades };
    }
    const contado = aCentavos(turno.contadoFisico);
    const diferencia = contado - esperado;
    if (diferencia > 0) sobrante += diferencia;
    if (diferencia < 0) faltante += -diferencia;
    return {
      turnoId: turno.id,
      esperado: aDolares(esperado),
      contado: aDolares(contado),
      diferencia: aDolares(diferencia),
      estado: diferencia > 0 ? "sobrante" : diferencia < 0 ? "faltante" : "cuadre",
      novedades,
    };
  });
  return {
    valor: {
      totalTurnos: entrada.turnos.length,
      cerrados: entrada.turnos.length - sinCierre.length,
      sinCierre,
      sobrante: aDolares(sobrante),
      faltante: aDolares(faltante),
      cuadre: sobrante === 0 && faltante === 0 && sinCierre.length === 0,
      detalle,
    },
    fuente: entrada.corte.fuente,
    formula: "diferencia = contado fisico - (fondo inicial + recaudado del sistema), calculada en centavos",
    filtros: ["turnos sin cierre reportados aparte y conservados en total", "novedades informadas sin alterar el arqueo"],
    corte: entrada.corte,
  };
}

export const EntradaProductividadCajas = z.strictObject({ corte: Corte, cajas: z.array(Caja), turnos: z.array(Turno) });

type FilaProductividad = { clave: string; operaciones: number; valor: number };

function agrupar(turnos: readonly z.infer<typeof Turno>[], clave: (turno: z.infer<typeof Turno>) => string) {
  const mapa = new Map<string, { operaciones: number; centavos: number }>();
  for (const turno of turnos) {
    const k = clave(turno);
    const actual = mapa.get(k) ?? { operaciones: 0, centavos: 0 };
    actual.operaciones++;
    actual.centavos += aCentavos(turno.recaudadoSistema);
    mapa.set(k, actual);
  }
  return [...mapa].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]): FilaProductividad => ({
    clave: k,
    operaciones: v.operaciones,
    valor: aDolares(v.centavos),
  }));
}

const franja = (fecha: Date) => {
  const hora = fecha.getUTCHours();
  return hora >= 6 && hora < 12 ? "manana" : hora < 18 ? "tarde" : "noche";
};

export function productividadCajas(entrada: z.output<typeof EntradaProductividadCajas>): ResultadoCalculo<{
  totalOperaciones: number;
  valorTotal: number;
  porCaja: FilaProductividad[];
  porCajero: FilaProductividad[];
  porSede: FilaProductividad[];
  porFranja: FilaProductividad[];
}> {
  const sedePorCaja = new Map(entrada.cajas.map((caja) => [caja.id, caja.sede]));
  const valorTotal = entrada.turnos.reduce((s, turno) => s + aCentavos(turno.recaudadoSistema), 0);
  return {
    valor: {
      totalOperaciones: entrada.turnos.length,
      valorTotal: aDolares(valorTotal),
      porCaja: agrupar(entrada.turnos, (t) => t.cajaId),
      porCajero: agrupar(entrada.turnos, (t) => t.cajeroId),
      porSede: agrupar(entrada.turnos, (t) => sedePorCaja.get(t.cajaId) ?? "caja_sin_sede"),
      porFranja: agrupar(entrada.turnos, (t) => franja(t.apertura)),
    },
    fuente: entrada.corte.fuente,
    formula: "operaciones = cantidad de turnos agregados; valor = suma en centavos de recaudado del sistema",
    filtros: ["agrupaciones por caja, cajero, sede y franja UTC", "turnos abiertos incluidos"],
    corte: entrada.corte,
  };
}

