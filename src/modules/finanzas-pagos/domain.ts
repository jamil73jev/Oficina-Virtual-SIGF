import { z } from "zod";
import { Corte } from "@/modules/finanzas";

const texto = z.string().min(1);
const fecha = z.coerce.date();
const dinero = z.number().finite();

export const EstadoOrdenPago = z.enum(["solicitada", "validada", "programada", "pagada", "rechazada"]);

export const OrdenPago = z.object({
  id: texto,
  beneficiarioId: texto,
  concepto: texto,
  valor: dinero,
  partidaId: z.string().nullish(),
  estado: EstadoOrdenPago,
  fechaSolicitud: fecha,
  fechaProgramada: fecha.optional(),
  comprobante: z.string().optional(),
});

export const Beneficiario = z.object({
  id: texto,
  identificacion: texto,
  nombre: texto,
  cuentaBancaria: z.string().nullish(),
});

export const Caja = z.object({ id: texto, sede: texto, nombre: texto });

export const Turno = z.object({
  id: texto,
  cajaId: texto,
  cajeroId: texto,
  apertura: fecha,
  cierre: fecha.optional(),
  fondoInicial: dinero,
  recaudadoSistema: dinero,
  contadoFisico: dinero.optional(),
});

export const NovedadCaja = z.object({
  id: texto,
  turnoId: texto,
  tipo: texto,
  valor: dinero,
  observacion: texto,
});

export type EstadoOrdenPago = z.infer<typeof EstadoOrdenPago>;
export type OrdenPago = z.infer<typeof OrdenPago>;
export type Beneficiario = z.infer<typeof Beneficiario>;
export type Caja = z.infer<typeof Caja>;
export type Turno = z.infer<typeof Turno>;
export type NovedadCaja = z.infer<typeof NovedadCaja>;

export interface DatosPagos {
  ordenes: OrdenPago[];
  beneficiarios: Beneficiario[];
  cajas: Caja[];
  turnos: Turno[];
  novedades: NovedadCaja[];
  /** Disponibilidad en dólares por partida; las calculadoras convierten a centavos. */
  disponibilidades: Record<string, number>;
  corte: z.infer<typeof Corte>;
}

