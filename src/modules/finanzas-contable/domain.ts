import { z } from "zod";
import { Corte } from "@/modules/finanzas";

/**
 * Dominio presupuestario (M05.2) y contable (M05.1, cuadre M05.3). Los esquemas no asumen datos
 * sinteticos: aceptan asientos descuadrados, reformas que dejan codificado negativo o
 * certificaciones sin disponibilidad, porque las calculadoras deben detectarlos, no rechazarlos.
 */

const texto = z.string().min(1);
const fecha = z.coerce.date();
const dinero = z.number().finite();
const dineroNoNegativo = dinero.nonnegative();

export const TipoPartida = z.enum(["ingreso", "gasto"]);
export const TipoReforma = z.enum(["aumento", "disminucion", "traspaso"]);
/** `emitida`: certificada y aun sin comprometer; `anulada` no cuenta como certificado. */
export const EstadoCertificacion = z.enum(["emitida", "comprometida", "anulada"]);
export const NaturalezaCuenta = z.enum(["deudora", "acreedora"]);
export const OrigenAsiento = z.enum(["recaudacion", "pago", "ajuste", "cierre"]);

/**
 * `aumento` y `disminucion` llevan `valor` >= 0 y el tipo da el signo. `traspaso` lleva signo:
 * positivo si la partida recibe, negativo si cede. `referencia` agrupa los movimientos de una
 * misma resolucion de reforma.
 */
export const Reforma = z
  .object({
    id: texto,
    partidaId: texto,
    tipo: TipoReforma,
    valor: dinero,
    fecha,
    referencia: z.string().nullish(),
  })
  .superRefine((r, ctx) => {
    if (r.tipo !== "traspaso" && r.valor < 0) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "aumento/disminucion usan valor >= 0; el tipo da el signo" });
    }
    if (r.tipo === "traspaso" && r.valor === 0) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "un traspaso no puede valer 0" });
    }
  });

/** Cifras de ejecucion acumuladas al corte. `recaudadoOPagado`: recaudado (ingreso) o pagado (gasto). */
export const PartidaPresupuestaria = z.object({
  id: texto,
  codigo: texto,
  nombre: texto,
  tipo: TipoPartida,
  asignadoInicial: dineroNoNegativo,
  reformas: z.array(Reforma),
  certificado: dineroNoNegativo,
  comprometido: dineroNoNegativo,
  devengado: dineroNoNegativo,
  recaudadoOPagado: dineroNoNegativo,
  ejercicio: z.number().int(),
});

export const Certificacion = z.object({
  id: texto,
  partidaId: texto,
  valor: dineroNoNegativo,
  estado: EstadoCertificacion,
  fecha: fecha.nullish(),
});

export const CuentaContable = z.object({
  id: texto,
  codigo: texto,
  nombre: texto,
  naturaleza: NaturalezaCuenta,
});

export const LineaAsiento = z.object({
  cuentaId: texto,
  debe: dineroNoNegativo,
  haber: dineroNoNegativo,
});

export const Asiento = z.object({
  id: texto,
  fecha,
  glosa: z.string(),
  lineas: z.array(LineaAsiento).min(1),
  origen: OrigenAsiento,
  referencia: z.string().nullish(),
});

export type TipoPartida = z.infer<typeof TipoPartida>;
export type TipoReforma = z.infer<typeof TipoReforma>;
export type EstadoCertificacion = z.infer<typeof EstadoCertificacion>;
export type NaturalezaCuenta = z.infer<typeof NaturalezaCuenta>;
export type OrigenAsiento = z.infer<typeof OrigenAsiento>;
export type Reforma = z.infer<typeof Reforma>;
export type PartidaPresupuestaria = z.infer<typeof PartidaPresupuestaria>;
export type Certificacion = z.infer<typeof Certificacion>;
export type CuentaContable = z.infer<typeof CuentaContable>;
export type LineaAsiento = z.infer<typeof LineaAsiento>;
export type Asiento = z.infer<typeof Asiento>;

export const ORIGENES_ASIENTO = OrigenAsiento.options;

/** Total que informa un subsistema (tesoreria, rentas...) para un origen contable, con su corte. */
export const TotalSubsistema = z.object({
  origen: OrigenAsiento,
  fuente: texto,
  total: dinero,
  corte: Corte,
});

/** Tramos de la matriz de cuadre: cada uno compara dos columnas consecutivas. */
export const TramoCuadre = z.enum(["fuente_conciliado", "conciliado_contabilizado", "contabilizado_presupuestario"]);

/**
 * Fila de la matriz de cuadre financiero-contable-presupuestario por concepto. Una columna en
 * null significa que el dato no se entrego: se informa como faltante, nunca se asume en cero.
 */
export const FilaCuadre = z.object({
  concepto: texto,
  fuente: texto,
  valorFuente: dinero,
  valorConciliado: dinero.nullish(),
  valorContabilizado: dinero.nullish(),
  valorPresupuestario: dinero.nullish(),
});

/** Explicacion documentada de (parte de) una diferencia de un tramo. */
export const JustificacionCuadre = z.object({
  id: texto,
  concepto: texto,
  tramo: TramoCuadre,
  valor: dinero,
  motivo: texto,
  documento: z.string().nullish(),
});

export type TotalSubsistema = z.infer<typeof TotalSubsistema>;
export type TramoCuadre = z.infer<typeof TramoCuadre>;
export type FilaCuadre = z.infer<typeof FilaCuadre>;
export type JustificacionCuadre = z.infer<typeof JustificacionCuadre>;

/** Conjunto de datos presupuestarios y contables de un ejercicio, con el corte de cada fuente. */
export interface DatosContables {
  ejercicio: number;
  partidas: PartidaPresupuestaria[];
  certificaciones: Certificacion[];
  cuentas: CuentaContable[];
  asientos: Asiento[];
  subsistemas: TotalSubsistema[];
  cuadre: FilaCuadre[];
  justificaciones: JustificacionCuadre[];
  cortes: Corte[];
}
