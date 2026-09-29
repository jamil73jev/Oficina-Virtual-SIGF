import { z } from "zod";
import { Corte, type ResultadoCalculo } from "@/modules/finanzas";
import { aCentavos, aDolares } from "@/modules/finanzas/comun";
import { Beneficiario, EstadoOrdenPago, OrdenPago } from "./domain";

const disponibilidades = z.record(z.string(), z.number().finite().nonnegative());

export const EntradaValidarOrdenPago = z.strictObject({
  corte: Corte,
  ordenes: z.array(OrdenPago),
  beneficiarios: z.array(Beneficiario),
  disponibilidades,
});

export type MotivoValidacion =
  | "beneficiario_no_encontrado"
  | "beneficiario_sin_cuenta"
  | "valor_no_positivo"
  | "partida_ausente"
  | "sin_disponibilidad"
  | "disponibilidad_insuficiente"
  | "orden_duplicada";

export function validarOrdenPago(
  entrada: z.output<typeof EntradaValidarOrdenPago>,
): ResultadoCalculo<{
  totalOrdenes: number;
  candidatas: number;
  observadas: number;
  resultados: { ordenId: string; valida: boolean; motivos: MotivoValidacion[] }[];
}> {
  const beneficiarios = new Map(entrada.beneficiarios.map((b) => [b.id, b]));
  const claves = new Map<string, number>();
  for (const orden of entrada.ordenes) {
    const clave = `${orden.beneficiarioId}\u0000${orden.concepto.trim().toLowerCase()}\u0000${aCentavos(orden.valor)}`;
    claves.set(clave, (claves.get(clave) ?? 0) + 1);
  }
  const resultados = entrada.ordenes.map((orden) => {
    const motivos: MotivoValidacion[] = [];
    const beneficiario = beneficiarios.get(orden.beneficiarioId);
    if (!beneficiario) motivos.push("beneficiario_no_encontrado");
    else if (!beneficiario.cuentaBancaria?.trim()) motivos.push("beneficiario_sin_cuenta");
    const valor = aCentavos(orden.valor);
    if (valor <= 0) motivos.push("valor_no_positivo");
    if (!orden.partidaId?.trim()) motivos.push("partida_ausente");
    else {
      const disponible = entrada.disponibilidades[orden.partidaId];
      if (disponible === undefined) motivos.push("sin_disponibilidad");
      else if (aCentavos(disponible) < valor) motivos.push("disponibilidad_insuficiente");
    }
    const clave = `${orden.beneficiarioId}\u0000${orden.concepto.trim().toLowerCase()}\u0000${valor}`;
    if ((claves.get(clave) ?? 0) > 1) motivos.push("orden_duplicada");
    return { ordenId: orden.id, valida: motivos.length === 0, motivos };
  });
  return {
    valor: {
      totalOrdenes: resultados.length,
      candidatas: resultados.filter((r) => r.valida).length,
      observadas: resultados.filter((r) => !r.valida).length,
      resultados,
    },
    fuente: entrada.corte.fuente,
    formula: "cada orden verifica beneficiario con cuenta + valor > 0 + partida + disponibilidad >= valor + ausencia de duplicado",
    filtros: ["ninguna orden excluida", "resultado de validacion es propuesta; no aprueba ni cambia estados"],
    corte: entrada.corte,
  };
}

export const EntradaProgramarPagos = z.strictObject({
  corte: Corte,
  ordenes: z.array(OrdenPago),
  topeLiquidez: z.number().finite().nonnegative(),
});

export function programarPagos(
  entrada: z.output<typeof EntradaProgramarPagos>,
): ResultadoCalculo<{
  topeLiquidez: number;
  totalPropuesto: number;
  liquidezRestante: number;
  pagadas: { ordenId: string; valor: number; motivo: "dentro_tope_liquidez" }[];
  diferidas: { ordenId: string; valor: number; motivo: "estado_no_validado" | "liquidez_insuficiente" }[];
}> {
  let restante = aCentavos(entrada.topeLiquidez);
  const pagadas: { ordenId: string; valor: number; motivo: "dentro_tope_liquidez" }[] = [];
  const diferidas: { ordenId: string; valor: number; motivo: "estado_no_validado" | "liquidez_insuficiente" }[] = [];
  const ordenadas = [...entrada.ordenes].sort(
    (a, b) => a.fechaSolicitud.getTime() - b.fechaSolicitud.getTime() || a.id.localeCompare(b.id),
  );
  for (const orden of ordenadas) {
    const valor = aCentavos(orden.valor);
    if (orden.estado !== "validada") {
      diferidas.push({ ordenId: orden.id, valor: aDolares(valor), motivo: "estado_no_validado" });
    } else if (valor > restante) {
      diferidas.push({ ordenId: orden.id, valor: aDolares(valor), motivo: "liquidez_insuficiente" });
    } else {
      restante -= valor;
      pagadas.push({ ordenId: orden.id, valor: aDolares(valor), motivo: "dentro_tope_liquidez" });
    }
  }
  const total = pagadas.reduce((s, p) => s + aCentavos(p.valor), 0);
  return {
    valor: {
      topeLiquidez: aDolares(aCentavos(entrada.topeLiquidez)),
      totalPropuesto: aDolares(total),
      liquidezRestante: aDolares(restante),
      pagadas,
      diferidas,
    },
    fuente: entrada.corte.fuente,
    formula: "ordenes validadas por fecha ascendente; se propone mientras suma en centavos <= tope de liquidez",
    filtros: ["solo estado validada es elegible", "propuesta sin programar ni pagar; requiere aprobacion humana"],
    corte: entrada.corte,
  };
}

export const EntradaResumenOrdenesPago = z.strictObject({ corte: Corte, ordenes: z.array(OrdenPago) });

export function resumenOrdenesPago(
  entrada: z.output<typeof EntradaResumenOrdenesPago>,
): ResultadoCalculo<{
  total: { cantidad: number; valor: number };
  porEstado: Record<z.infer<typeof EstadoOrdenPago>, { cantidad: number; valor: number }>;
}> {
  const estados = EstadoOrdenPago.options;
  const centavos = Object.fromEntries(estados.map((estado) => [estado, { cantidad: 0, valor: 0 }])) as Record<
    z.infer<typeof EstadoOrdenPago>, { cantidad: number; valor: number }
  >;
  let total = 0;
  for (const orden of entrada.ordenes) {
    const valor = aCentavos(orden.valor);
    total += valor;
    centavos[orden.estado].cantidad++;
    centavos[orden.estado].valor += valor;
  }
  const porEstado = Object.fromEntries(
    estados.map((estado) => [estado, { ...centavos[estado], valor: aDolares(centavos[estado].valor) }]),
  ) as Record<z.infer<typeof EstadoOrdenPago>, { cantidad: number; valor: number }>;
  return {
    valor: { total: { cantidad: entrada.ordenes.length, valor: aDolares(total) }, porEstado },
    fuente: entrada.corte.fuente,
    formula: "conteo y suma en centavos de todas las ordenes, agrupadas por estado",
    filtros: ["ninguna orden excluida del total"],
    corte: entrada.corte,
  };
}

