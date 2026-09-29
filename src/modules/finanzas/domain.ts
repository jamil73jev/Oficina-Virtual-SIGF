import { z } from "zod";

/**
 * Dominio de la Direccion Financiera (rentas, cartera, coactiva, tesoreria, control y estadistica).
 * Los esquemas aceptan datos imperfectos a proposito (identificaciones invalidas, ubicacion
 * faltante): la calidad se mide con `calidadDatos`, no se rechaza en la carga.
 */

const texto = z.string().min(1);
const fecha = z.coerce.date();
const dinero = z.number().finite();
const dineroNoNegativo = dinero.nonnegative();

export const TipoIdentificacion = z.enum(["cedula", "ruc", "otro"]);
export const TipoRubro = z.enum(["tributario", "no_tributario"]);
export const OrigenRubro = z.enum(["propio", "tercero"]);
export const EstadoTitulo = z.enum(["emitido", "pagado", "baja", "en_cobranza", "en_coactiva"]);
export const CanalPago = z.enum(["caja", "banco", "red", "transferencia"]);

export const Contribuyente = z.object({
  id: texto,
  tipoIdentificacion: TipoIdentificacion,
  // Sin validar formato: las invalidas deben poder cargarse para reportarlas.
  identificacion: z.string(),
  nombre: z.string(),
  parroquia: z.string().nullish(),
  sector: z.string().nullish(),
  latitud: z.number().nullish(),
  longitud: z.number().nullish(),
});

export const Rubro = z.object({
  id: texto,
  nombre: texto,
  tipo: TipoRubro,
  origen: OrigenRubro,
});

/** `id` es la llave unica del titulo: nunca se suma dos veces el mismo id. */
export const Titulo = z.object({
  id: texto,
  contribuyenteId: texto,
  rubroId: texto,
  valorEmitido: dineroNoNegativo,
  fechaEmision: fecha,
  fechaVencimiento: fecha,
  estado: EstadoTitulo,
});

export const Pago = z.object({
  id: texto,
  tituloId: texto,
  canal: CanalPago,
  fechaPago: fecha,
  valorBruto: dineroNoNegativo,
  cajaId: z.string().nullish(),
  bancoId: z.string().nullish(),
});

/** `extemporaneo`: registrado fuera del periodo del pago; se informa aparte y no se resta otra vez. */
export const Reverso = z.object({
  id: texto,
  pagoId: texto,
  valor: dineroNoNegativo,
  fecha,
  extemporaneo: z.boolean(),
});

/**
 * Relacion 1 titulo a N juicios: el juicio nunca aporta valor, solo referencia al titulo.
 * `identificacionDemandado` es la que figura en el juicio; puede faltar o ser inutilizable y se
 * compara con la del contribuyente del titulo en `cruzarIdentificaciones`.
 */
export const Juicio = z.object({
  id: texto,
  codigo: texto,
  tituloId: texto,
  juzgado: texto,
  estado: texto,
  fecha,
  identificacionDemandado: z.string().nullish(),
});

/** Deposito bancario; `referencia` apunta al `Pago.id` cuando el banco la informa. */
export const Deposito = z.object({
  id: texto,
  bancoId: z.string().nullish(),
  fecha,
  valor: dinero,
  referencia: z.string().nullish(),
});

export const Corte = z.object({
  fechaCorte: fecha,
  horaExtraccion: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato HH:MM o HH:MM:SS"),
  periodo: texto,
  fuente: texto,
});

export type TipoIdentificacion = z.infer<typeof TipoIdentificacion>;
export type TipoRubro = z.infer<typeof TipoRubro>;
export type OrigenRubro = z.infer<typeof OrigenRubro>;
export type EstadoTitulo = z.infer<typeof EstadoTitulo>;
export type CanalPago = z.infer<typeof CanalPago>;
export type Contribuyente = z.infer<typeof Contribuyente>;
export type Rubro = z.infer<typeof Rubro>;
export type Titulo = z.infer<typeof Titulo>;
export type Pago = z.infer<typeof Pago>;
export type Reverso = z.infer<typeof Reverso>;
export type Juicio = z.infer<typeof Juicio>;
export type Deposito = z.infer<typeof Deposito>;
export type Corte = z.infer<typeof Corte>;

/** Conjunto completo de datos de la Direccion Financiera, con el corte de cada fuente. */
export interface DatosFinanzas {
  contribuyentes: Contribuyente[];
  rubros: Rubro[];
  titulos: Titulo[];
  pagos: Pago[];
  reversos: Reverso[];
  juicios: Juicio[];
  depositos: Deposito[];
  cortes: Corte[];
}

/** Todo resultado de calculadora declara de donde sale, como se calcula y a que corte pertenece. */
export interface ResultadoCalculo<T> {
  valor: T;
  fuente: string;
  formula: string;
  filtros: string[];
  corte: Corte | Corte[];
}

export type CodigoErrorFinanzas =
  | "cortes_distintos"
  | "titulo_duplicado_conflictivo"
  | "umbrales_invalidos"
  | "entrada_invalida";

export class FinanzasError extends Error {
  constructor(
    readonly codigo: CodigoErrorFinanzas,
    mensaje?: string,
  ) {
    super(`Finanzas: ${codigo}${mensaje ? ` (${mensaje})` : ""}`);
    this.name = "FinanzasError";
  }
}

export interface DiferenciaCorte {
  campo: "fechaCorte" | "horaExtraccion" | "periodo";
  fuentes: { fuente: string; valor: string }[];
}

/** Se lanza al comparar como simultaneas fuentes cuyo corte no coincide. */
export class CortesDistintosError extends FinanzasError {
  constructor(readonly diferencias: DiferenciaCorte[]) {
    super(
      "cortes_distintos",
      diferencias.map((d) => `${d.campo}: ${d.fuentes.map((f) => `${f.fuente}=${f.valor}`).join(", ")}`).join("; "),
    );
    this.name = "CortesDistintosError";
  }
}
