import type { IdAgenteArea } from "./catalogo";
import type { NombreHerramientaArea } from "./herramientas";

export interface LlamadaHerramientaArea {
  nombre: NombreHerramientaArea;
  entrada: Record<string, unknown>;
}

export interface LlamadaDemoArea {
  nombre: NombreHerramientaArea;
  args: Record<string, unknown>;
  /** Rutas dentro de `valor` que la demo copia a su respuesta. */
  cifras: readonly string[];
}

/** Fuente compartida por la demo y por la ejecución determinista de Operaciones. */
export const LLAMADAS_DEMO: Record<IdAgenteArea, LlamadaDemoArea> = {
  "control-estadistica": { nombre: "recaudacion_neta", args: {}, cifras: ["bruto", "reversosNormales", "reversosExtemporaneos", "neto"] },
  cartera: { nombre: "saldo_cartera_por_titulo", args: {}, cifras: ["totalSaldo", "cantidadTitulos", "titulosConVariosJuicios"] },
  datos: { nombre: "calidad_datos", args: {}, cifras: ["totalGeneral", "identificaciones.invalidas.cantidad", "sinParroquia.cantidad"] },
  tesorero: { nombre: "conciliar_banco", args: {}, cifras: ["conciliado.valor", "pendiente.valor", "diferencias.valorNeto", "cuadra"] },
  presupuestista: { nombre: "ejecucion_presupuestaria", args: {}, cifras: ["totales.ingreso.codificado", "totales.ingreso.recaudadoOPagado", "totales.gasto.codificado", "totales.gasto.devengado"] },
  contador: { nombre: "balance_comprobacion", args: {}, cifras: ["totalDebe", "totalHaber", "diferencia", "cuadra", "cantidadAsientos"] },
  pagador: { nombre: "resumen_ordenes_pago", args: {}, cifras: ["total.cantidad", "total.valor", "porEstado.solicitada.valor", "porEstado.validada.valor"] },
  "cajero-mayor": { nombre: "arqueo_caja", args: {}, cifras: ["totalTurnos", "cerrados", "sobrante", "faltante", "cuadre"] },
  rentas: { nombre: "emision_por_rubro", args: {}, cifras: ["totalTitulos", "totalValorEmitido", "titulosPosterioresAlCorte"] },
  coactiva: { nombre: "recuperacion_coactiva", args: {}, cifras: ["cantidadTitulos", "totalBaseCoactiva", "totalRecuperado", "porcentajeRecuperado"] },
  director: { nombre: "tablero_ejecutivo", args: {}, cifras: ["totalIndicadores", "totalAlertas", "compromisosAbiertos"] },
  planificacion: { nombre: "comparativo_interanual", args: {}, cifras: ["filas.0.actual", "filas.0.anterior", "filas.0.variacionAbsoluta", "filas.0.variacionPct"] },
};

const adicionales: Partial<Record<IdAgenteArea, readonly LlamadaHerramientaArea[]>> = {
  "control-estadistica": [{ nombre: "comparar_cortes", entrada: {} }],
  cartera: [{ nombre: "antiguedad_cartera", entrada: {} }, { nombre: "segmentar_pareto", entrada: {} }],
  datos: [{ nombre: "cruzar_identificaciones", entrada: {} }],
  tesorero: [{ nombre: "recaudacion_neta", entrada: {} }],
  presupuestista: [{ nombre: "reformas_certificaciones", entrada: {} }],
  contador: [{ nombre: "conciliacion_contable", entrada: {} }],
  pagador: [{ nombre: "validar_orden_pago", entrada: {} }],
  "cajero-mayor": [{ nombre: "productividad_cajas", entrada: {} }],
  rentas: [{ nombre: "estado_vigente_al_corte", entrada: {} }],
  coactiva: [{ nombre: "resumen_coactiva", entrada: {} }],
  director: [{ nombre: "alertas_desviacion", entrada: {} }],
  planificacion: [{ nombre: "consolidar_entidades", entrada: {} }],
};

export const HERRAMIENTAS_OBLIGATORIAS_POR_AGENTE = Object.fromEntries(
  (Object.keys(LLAMADAS_DEMO) as IdAgenteArea[]).map((agente) => [
    agente,
    [{ nombre: LLAMADAS_DEMO[agente].nombre, entrada: LLAMADAS_DEMO[agente].args }, ...(adicionales[agente] ?? [])],
  ]),
) as unknown as Record<IdAgenteArea, readonly LlamadaHerramientaArea[]>;
