import { z } from "zod";
import { Corte } from "@/modules/finanzas";

const texto = z.string().min(1);
const dinero = z.number().finite();
const fecha = z.coerce.date();

export const TipoMeta = z.enum(["anual", "mensual", "acumulada"]);
export const Meta = z.object({ id: texto, indicador: texto, periodo: texto, tipo: TipoMeta, valor: dinero });
export const Observado = z.object({ indicador: texto, periodo: texto, valor: dinero, fuente: texto, corte: Corte });
export const TipoEntidad = z.enum(["adscrita", "empresa", "otra"]);
export const EntidadVinculada = z.object({ id: texto, nombre: texto, tipo: TipoEntidad });
export const ReporteEntidad = z.object({
  id: texto,
  entidadId: texto,
  corte: Corte,
  ingresos: dinero,
  gastos: dinero,
  transferenciasRecibidas: dinero,
  transferenciasEntregadas: dinero,
  liquidez: dinero,
});
export const EstadoCompromiso = z.enum(["abierto", "cumplido", "vencido"]);
export const Compromiso = z.object({
  id: texto,
  responsable: texto,
  decision: texto,
  fechaLimite: fecha,
  estado: EstadoCompromiso,
});
export const IndicadorTablero = z.object({
  nombre: texto,
  valor: dinero,
  unidad: texto,
  fuente: texto,
  formula: texto,
  filtros: z.array(z.string()),
  corte: Corte,
});

export type Meta = z.infer<typeof Meta>;
export type Observado = z.infer<typeof Observado>;
export type EntidadVinculada = z.infer<typeof EntidadVinculada>;
export type ReporteEntidad = z.infer<typeof ReporteEntidad>;
export type Compromiso = z.infer<typeof Compromiso>;
export type IndicadorTablero = z.infer<typeof IndicadorTablero>;

export interface DatosDireccion {
  metas: Meta[];
  observados: Observado[];
  entidades: EntidadVinculada[];
  reportes: ReporteEntidad[];
  compromisos: Compromiso[];
  indicadores: IndicadorTablero[];
  corte: z.infer<typeof Corte>;
}

