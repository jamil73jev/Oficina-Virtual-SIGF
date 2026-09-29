import {
  Aleatorio,
  corteDe,
  FUENTES_SINTETICAS,
  generarDatosSinteticos,
  type CanalPago,
  type DatosFinanzas,
  type EstadoTitulo,
  type Juicio,
  type Pago,
  type Titulo,
} from "@/modules/finanzas";
import { diasEntre } from "@/modules/finanzas/comun";
import type { DatosRentas, HistorialTitulo, MovimientoJuicio, Resolucion } from "./domain";

/**
 * Datos SINTETICOS y deterministas de Rentas y Coactiva, coherentes con los titulos, juicios y
 * pagos de finanzas (mismos ids). No depende de que los datos sean sinteticos: `generarDatosRentas`
 * acepta cualquier `DatosFinanzas`.
 *
 * Casos borde garantizados (si el conjunto base los permite): titulo con varias resoluciones,
 * resolucion que cambia el saldo, resolucion posterior al corte, resolucion revocada, titulo con
 * historial de ida y vuelta entre cobranza y coactiva, titulos con 3 juicios con movimientos en
 * cada uno y un movimiento posterior al corte de coactiva.
 */

const MS_DIA = 86_400_000;
const sumarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * MS_DIA);
const antes = (a: Date, b: Date) => (diasEntre(a, b) >= 0 ? a : b);
const despues = (a: Date, b: Date) => (diasEntre(a, b) >= 0 ? b : a);
const pad = (n: number, largo: number) => String(n).padStart(largo, "0");
const CANALES: CanalPago[] = ["caja", "banco", "red", "transferencia"];

export function generarDatosRentas(semilla: number | string = 20260831, base?: DatosFinanzas): DatosRentas {
  const datos = base ?? generarDatosSinteticos({ semilla });
  const rnd = new Aleatorio(`rentas|${semilla}`);
  const corteRentas = corteDe(datos, FUENTES_SINTETICAS.rentas).fechaCorte;
  const corteCoactiva = corteDe(datos, FUENTES_SINTETICAS.coactiva).fechaCorte;

  const historial: HistorialTitulo[] = [];
  const resoluciones: Resolucion[] = [];
  const movimientos: MovimientoJuicio[] = [];
  const pagosCoactiva: Pago[] = [];

  const evento = (t: Titulo, fecha: Date, anterior: EstadoTitulo | null, nuevo: EstadoTitulo, motivo: string) =>
    historial.push({
      id: `H${pad(historial.length + 1, 6)}`,
      tituloId: t.id,
      fecha,
      estadoAnterior: anterior,
      estadoNuevo: nuevo,
      motivo,
    });
  const resolucion = (t: Titulo, tipo: Resolucion["tipo"], valor: number, fecha: Date, estado: Resolucion["estado"]) =>
    resoluciones.push({
      id: `RS${pad(resoluciones.length + 1, 5)}`,
      tituloId: t.id,
      tipo,
      valorEfecto: Math.round(valor * 100) / 100,
      fecha,
      estado,
    });

  const pagosPorTitulo = new Map<string, Pago[]>();
  for (const p of datos.pagos) pagosPorTitulo.set(p.tituloId, [...(pagosPorTitulo.get(p.tituloId) ?? []), p]);
  const reversosPorPago = new Map<string, number>();
  for (const r of datos.reversos) reversosPorPago.set(r.pagoId, (reversosPorPago.get(r.pagoId) ?? 0) + Math.round(r.valor * 100));
  const juiciosPorTitulo = new Map<string, Juicio[]>();
  for (const j of datos.juicios) juiciosPorTitulo.set(j.tituloId, [...(juiciosPorTitulo.get(j.tituloId) ?? []), j]);

  const ingresoCoactiva = new Map<string, Date>();
  let ciclo = false;

  // ---- historial de estados ------------------------------------------------------------------
  for (const t of datos.titulos) {
    evento(t, t.fechaEmision, null, "emitido", "Emision del titulo");
    const fechasPago = (pagosPorTitulo.get(t.id) ?? []).map((p) => p.fechaPago).sort((a, b) => diasEntre(b, a));
    const cobranza = antes(antes(sumarDias(t.fechaVencimiento, 91), corteRentas), corteCoactiva);
    const cobranzaFecha = despues(cobranza, t.fechaEmision);

    if (t.estado === "pagado") {
      const ultima = fechasPago[fechasPago.length - 1] ?? sumarDias(t.fechaEmision, 1);
      evento(t, antes(ultima, corteRentas), "emitido", "pagado", "Cancelacion total");
    } else if (t.estado === "baja") {
      evento(t, antes(sumarDias(t.fechaEmision, rnd.entero(1, 200)), corteRentas), "emitido", "baja", "Baja por resolucion");
    } else if (t.estado === "en_cobranza") {
      evento(t, antes(cobranzaFecha, corteRentas), "emitido", "en_cobranza", "Vencido: inicia cobranza");
    } else if (t.estado === "en_coactiva") {
      const juicios = (juiciosPorTitulo.get(t.id) ?? []).slice().sort((a, b) => diasEntre(b.fecha, a.fecha));
      const primero = juicios[0];
      const ingreso = despues(cobranzaFecha, antes(primero?.fecha ?? corteCoactiva, corteCoactiva));
      const fechaCobranza = despues(t.fechaEmision, antes(cobranzaFecha, ingreso));
      evento(t, fechaCobranza, "emitido", "en_cobranza", "Vencido: inicia cobranza");
      evento(t, ingreso, "en_cobranza", "en_coactiva", "Envio a coactiva");
      ingresoCoactiva.set(t.id, ingreso);
      // Caso borde: suspension y reactivacion (ida y vuelta) en el primer titulo con varios juicios.
      if (!ciclo && juicios.length > 1) {
        const suspension = sumarDias(ingreso, 10);
        const reanuda = sumarDias(ingreso, 20);
        if (diasEntre(reanuda, corteCoactiva) >= 0) {
          evento(t, suspension, "en_coactiva", "en_cobranza", "Suspension del proceso coactivo");
          evento(t, reanuda, "en_cobranza", "en_coactiva", "Reanudacion del proceso coactivo");
          ciclo = true;
        }
      }
    }
  }

  // ---- resoluciones ---------------------------------------------------------------------------
  const abiertos = datos.titulos.filter((t) => t.estado !== "pagado" && t.estado !== "baja");
  const fechaResolucion = (t: Titulo, minDias: number) =>
    antes(sumarDias(t.fechaEmision, minDias + rnd.entero(0, 60)), corteRentas);

  for (const t of datos.titulos) {
    if (t.estado === "baja") {
      const evtBaja = historial.find((h) => h.tituloId === t.id && h.estadoNuevo === "baja");
      resolucion(t, "anulacion", t.valorEmitido, evtBaja?.fecha ?? corteRentas, "vigente");
    }
  }
  const [multiple, unica, posterior, revocada] = abiertos;
  if (multiple) {
    resolucion(multiple, "rebaja", multiple.valorEmitido * 0.1, fechaResolucion(multiple, 1), "vigente");
    resolucion(multiple, "rebaja", multiple.valorEmitido * 0.15, fechaResolucion(multiple, 61), "vigente");
    resolucion(multiple, "otro", 0, fechaResolucion(multiple, 1), "vigente");
  }
  if (unica) resolucion(unica, "rebaja", unica.valorEmitido * 0.3, fechaResolucion(unica, 1), "vigente");
  if (posterior) resolucion(posterior, "exoneracion", posterior.valorEmitido, sumarDias(corteRentas, rnd.entero(5, 30)), "vigente");
  if (revocada) resolucion(revocada, "prescripcion", revocada.valorEmitido, fechaResolucion(revocada, 1), "revocada");
  for (const t of abiertos.slice(4)) {
    if (!rnd.probabilidad(0.06)) continue;
    const tipo = rnd.elegir(["rebaja", "exoneracion"] as const);
    resolucion(t, tipo, t.valorEmitido * (0.05 + rnd.siguiente() * 0.35), fechaResolucion(t, 1), "vigente");
  }

  // ---- movimientos de juicio y pagos en coactiva ----------------------------------------------
  const movimiento = (j: Juicio, fecha: Date, tipo: MovimientoJuicio["tipo"], observacion: string, valor?: number) =>
    movimientos.push({
      id: `MJ${pad(movimientos.length + 1, 6)}`,
      juicioId: j.id,
      fecha,
      tipo,
      ...(valor === undefined ? {} : { valor }),
      observacion,
    });
  let postCorteHecho = false;
  let pagoForzado = false;
  for (const t of datos.titulos) {
    const juicios = (juiciosPorTitulo.get(t.id) ?? []).slice().sort((a, b) => diasEntre(b.fecha, a.fecha) || a.id.localeCompare(b.id));
    for (const j of juicios) {
      movimiento(j, j.fecha, "auto", "Auto de pago");
      movimiento(j, antes(sumarDias(j.fecha, rnd.entero(3, 20)), corteCoactiva), "citacion", "Citacion al coactivado");
      if (rnd.probabilidad(0.5)) {
        movimiento(j, antes(sumarDias(j.fecha, rnd.entero(21, 60)), corteCoactiva), "embargo", "Orden de embargo", Math.round(t.valorEmitido * 30) / 100);
      }
      if (j.estado === "archivado") movimiento(j, antes(sumarDias(j.fecha, rnd.entero(61, 120)), corteCoactiva), "archivo", "Archivo del juicio");
    }
    const primero = juicios[0];
    if (primero && !postCorteHecho) {
      movimiento(primero, sumarDias(corteCoactiva, 5), "otro", "Movimiento posterior al corte de coactiva");
      postCorteHecho = true;
    }

    const ingreso = ingresoCoactiva.get(t.id);
    const ultimo = juicios[juicios.length - 1];
    if (!ingreso || !ultimo || (pagoForzado && !rnd.probabilidad(0.35))) continue;
    const pagadoPrevio = (pagosPorTitulo.get(t.id) ?? []).reduce(
      (s, p) => s + Math.round(p.valorBruto * 100) - (reversosPorPago.get(p.id) ?? 0),
      0,
    );
    const pendiente = Math.round(t.valorEmitido * 100) - pagadoPrevio;
    const monto = Math.floor(pendiente * (0.2 + rnd.siguiente() * 0.3));
    const fecha = sumarDias(ingreso, rnd.entero(5, 60));
    if (monto < 100 || diasEntre(fecha, corteCoactiva) < 0) continue;
    const canal = rnd.elegir(CANALES);
    const pago: Pago = {
      id: `PC${pad(pagosCoactiva.length + 1, 6)}`,
      tituloId: t.id,
      canal,
      fechaPago: fecha,
      valorBruto: monto / 100,
      cajaId: canal === "banco" ? null : "CAJA-01",
      bancoId: canal === "banco" ? "BCO-01" : null,
    };
    pagosCoactiva.push(pago);
    movimiento(ultimo, fecha, "pago", "Pago parcial en coactiva", pago.valorBruto);
    pagoForzado = true;
  }

  return { resoluciones, historial, movimientos, pagosCoactiva };
}
