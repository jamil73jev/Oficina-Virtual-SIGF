import { z } from "zod";
import { EstadoTitulo, type Pago } from "@/modules/finanzas";

/**
 * Dominio de Rentas (M02) y Coactiva (M04.4). Extiende el de finanzas sin duplicarlo: Titulo,
 * Juicio, Pago, Rubro y Corte se importan de `@/modules/finanzas`.
 */

const texto = z.string().min(1);
const fecha = z.coerce.date();

export const TipoResolucion = z.enum(["anulacion", "rebaja", "exoneracion", "prescripcion", "otro"]);
/** Solo las resoluciones `vigente` producen efecto; las demas se informan aparte. */
export const EstadoResolucion = z.enum(["vigente", "revocada", "pendiente"]);
export const TipoMovimientoJuicio = z.enum(["auto", "citacion", "embargo", "pago", "archivo", "otro"]);

/** `valorEfecto`: monto que la resolucion resta a la obligacion (0 si no cambia el valor). */
export const Resolucion = z.object({
  id: texto,
  tituloId: texto,
  tipo: TipoResolucion,
  valorEfecto: z.number().finite().nonnegative(),
  fecha,
  estado: EstadoResolucion,
});

/** `estadoAnterior` es nulo en el primer registro del titulo (emision). */
export const HistorialTitulo = z.object({
  id: texto,
  tituloId: texto,
  fecha,
  estadoAnterior: EstadoTitulo.nullish(),
  estadoNuevo: EstadoTitulo,
  motivo: z.string(),
});

export const MovimientoJuicio = z.object({
  id: texto,
  juicioId: texto,
  fecha,
  tipo: TipoMovimientoJuicio,
  valor: z.number().finite().nonnegative().optional(),
  observacion: z.string(),
});

export type TipoResolucion = z.infer<typeof TipoResolucion>;
export type EstadoResolucion = z.infer<typeof EstadoResolucion>;
export type TipoMovimientoJuicio = z.infer<typeof TipoMovimientoJuicio>;
export type Resolucion = z.infer<typeof Resolucion>;
export type HistorialTitulo = z.infer<typeof HistorialTitulo>;
export type MovimientoJuicio = z.infer<typeof MovimientoJuicio>;

/** Datos propios de Rentas/Coactiva; se combinan con `DatosFinanzas` (titulos, juicios, pagos). */
export interface DatosRentas {
  resoluciones: Resolucion[];
  historial: HistorialTitulo[];
  movimientos: MovimientoJuicio[];
  /** Pagos posteriores al ingreso a coactiva; no estan en `DatosFinanzas.pagos`. */
  pagosCoactiva: Pago[];
}
