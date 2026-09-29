import { z } from "zod";
import { Corte, Deposito, Pago, type ResultadoCalculo } from "./domain";
import { aCentavos, aDolares, fechaISO, filtrosDeCorte, hastaElCorte } from "./comun";

export const EntradaConciliarBanco = z.object({
  corte: Corte,
  transacciones: z.array(Pago),
  depositos: z.array(Deposito),
});
export type EntradaConciliarBanco = z.infer<typeof EntradaConciliarBanco>;

export interface ParConciliado {
  pagoId: string;
  depositoIds: string[];
  valor: number;
  criterio: "referencia" | "banco_fecha_valor";
}

export interface DiferenciaConciliacion {
  pagoId: string;
  depositoIds: string[];
  valorTransaccion: number;
  valorDeposito: number;
  /** deposito - transaccion. */
  diferencia: number;
}

export interface ConciliacionBancaria {
  conciliado: { cantidad: number; valor: number; pares: ParConciliado[] };
  /** Transacciones sin deposito bancario. */
  pendiente: { cantidad: number; valor: number; pagoIds: string[] };
  diferencias: { cantidad: number; valorNeto: number; detalle: DiferenciaConciliacion[] };
  depositosSinTransaccion: { cantidad: number; valor: number; depositoIds: string[] };
  totalTransacciones: number;
  totalDepositos: number;
  /** Ambos totales se explican por completo con conciliado + pendiente + diferencias (+ sin transaccion). */
  cuadra: boolean;
}

/**
 * Conciliacion en dos pasos: 1) depositos con `referencia` = pago.id (se suman si hay varios);
 * 2) depositos sin referencia contra pagos libres del mismo banco, fecha y valor.
 */
export function conciliarBanco(entrada: EntradaConciliarBanco): ResultadoCalculo<ConciliacionBancaria> {
  const { corte } = entrada;
  const pagos = [...new Map(entrada.transacciones.map((p) => [p.id, p])).values()]
    .filter((p) => hastaElCorte(p.fechaPago, corte))
    .sort((a, b) => a.id.localeCompare(b.id));
  const depositos = [...new Map(entrada.depositos.map((d) => [d.id, d])).values()]
    .filter((d) => hastaElCorte(d.fecha, corte))
    .sort((a, b) => a.id.localeCompare(b.id));
  const pagosPorId = new Map(pagos.map((p) => [p.id, p]));

  const porReferencia = new Map<string, Deposito[]>();
  const sinReferencia: Deposito[] = [];
  const sinTransaccion: Deposito[] = [];
  for (const d of depositos) {
    if (d.referencia && pagosPorId.has(d.referencia)) {
      porReferencia.set(d.referencia, [...(porReferencia.get(d.referencia) ?? []), d]);
    } else if (d.referencia) {
      sinTransaccion.push(d);
    } else {
      sinReferencia.push(d);
    }
  }

  const pares: ParConciliado[] = [];
  const diferencias: DiferenciaConciliacion[] = [];
  const libres: Pago[] = [];
  for (const pago of pagos) {
    const asociados = porReferencia.get(pago.id);
    if (!asociados) {
      libres.push(pago);
      continue;
    }
    const valorPago = aCentavos(pago.valorBruto);
    const valorDeposito = asociados.reduce((acc, d) => acc + aCentavos(d.valor), 0);
    const depositoIds = asociados.map((d) => d.id);
    if (valorPago === valorDeposito) {
      pares.push({ pagoId: pago.id, depositoIds, valor: aDolares(valorPago), criterio: "referencia" });
    } else {
      diferencias.push({
        pagoId: pago.id,
        depositoIds,
        valorTransaccion: aDolares(valorPago),
        valorDeposito: aDolares(valorDeposito),
        diferencia: aDolares(valorDeposito - valorPago),
      });
    }
  }

  const clave = (bancoId: string | null | undefined, fecha: Date, valor: number) =>
    `${bancoId ?? ""}|${fechaISO(fecha)}|${aCentavos(valor)}`;
  const libresPorClave = new Map<string, Pago[]>();
  for (const p of libres) {
    const k = clave(p.bancoId, p.fechaPago, p.valorBruto);
    libresPorClave.set(k, [...(libresPorClave.get(k) ?? []), p]);
  }
  const emparejados = new Set<string>();
  for (const d of sinReferencia) {
    const candidato = libresPorClave.get(clave(d.bancoId, d.fecha, d.valor))?.shift();
    if (!candidato) {
      sinTransaccion.push(d);
      continue;
    }
    emparejados.add(candidato.id);
    pares.push({
      pagoId: candidato.id,
      depositoIds: [d.id],
      valor: aDolares(aCentavos(candidato.valorBruto)),
      criterio: "banco_fecha_valor",
    });
  }
  const pendientes = libres.filter((p) => !emparejados.has(p.id));

  const suma = (valores: number[]) => valores.reduce((acc, v) => acc + v, 0);
  const cConciliado = suma(pares.map((p) => aCentavos(p.valor)));
  const cPendiente = suma(pendientes.map((p) => aCentavos(p.valorBruto)));
  const cDifTransaccion = suma(diferencias.map((d) => aCentavos(d.valorTransaccion)));
  const cDifDeposito = suma(diferencias.map((d) => aCentavos(d.valorDeposito)));
  const cSinTransaccion = suma(sinTransaccion.map((d) => aCentavos(d.valor)));
  const cTransacciones = suma(pagos.map((p) => aCentavos(p.valorBruto)));
  const cDepositos = suma(depositos.map((d) => aCentavos(d.valor)));

  return {
    valor: {
      conciliado: { cantidad: pares.length, valor: aDolares(cConciliado), pares },
      pendiente: { cantidad: pendientes.length, valor: aDolares(cPendiente), pagoIds: pendientes.map((p) => p.id) },
      diferencias: {
        cantidad: diferencias.length,
        valorNeto: aDolares(cDifDeposito - cDifTransaccion),
        detalle: diferencias,
      },
      depositosSinTransaccion: {
        cantidad: sinTransaccion.length,
        valor: aDolares(cSinTransaccion),
        depositoIds: sinTransaccion.map((d) => d.id).sort(),
      },
      totalTransacciones: aDolares(cTransacciones),
      totalDepositos: aDolares(cDepositos),
      cuadra:
        cTransacciones === cConciliado + cPendiente + cDifTransaccion &&
        cDepositos === cConciliado + cDifDeposito + cSinTransaccion,
    },
    fuente: corte.fuente,
    formula:
      "conciliado = transacciones con deposito(s) de igual valor (por referencia o por banco+fecha+valor); " +
      "pendiente = transacciones sin deposito; diferencias = deposito - transaccion cuando no coinciden; " +
      "totalTransacciones = conciliado + pendiente + diferencias.valorTransaccion",
    filtros: [...filtrosDeCorte(corte), "pago.id y deposito.id unicos"],
    corte,
  };
}
