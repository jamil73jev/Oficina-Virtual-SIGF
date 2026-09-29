import type {
  CanalPago,
  Contribuyente,
  Corte,
  DatosFinanzas,
  Deposito,
  EstadoTitulo,
  Juicio,
  Pago,
  Reverso,
  Rubro,
  TipoIdentificacion,
  Titulo,
} from "./domain";
import { diasEntre } from "./comun";
import { digitoVerificadorCedula, normalizarIdentificacion } from "./identificacion";
import { Aleatorio } from "./prng";

/**
 * Datos SINTETICOS y deterministas para desarrollar sin datos reales. Nombres, identificaciones,
 * parroquias y coordenadas son inventados. Incluye a proposito casos borde para las calculadoras.
 */

export interface OpcionesGenerador {
  semilla?: number | string;
  contribuyentes?: number;
  titulos?: number;
  /** Fecha de corte de rentas y tesoreria (por defecto 2026-08-31). */
  fechaCorte?: Date | string;
}

export const FUENTES_SINTETICAS = {
  rentas: "rentas",
  tesoreria: "tesoreria",
  banco: "banco",
  coactiva: "coactiva",
} as const;

const RUBROS: Rubro[] = [
  { id: "RB01", nombre: "Impuesto predial urbano", tipo: "tributario", origen: "propio" },
  { id: "RB02", nombre: "Impuesto de patente municipal", tipo: "tributario", origen: "propio" },
  { id: "RB03", nombre: "Impuesto 1.5 por mil sobre activos totales", tipo: "tributario", origen: "propio" },
  { id: "RB04", nombre: "Tasa por servicios administrativos", tipo: "no_tributario", origen: "propio" },
  { id: "RB05", nombre: "Contribucion especial de mejoras", tipo: "tributario", origen: "propio" },
  { id: "RB06", nombre: "Tasa recaudada para entidad de bomberos", tipo: "tributario", origen: "tercero" },
  { id: "RB07", nombre: "Tasa recaudada para empresa de servicios", tipo: "no_tributario", origen: "tercero" },
  { id: "RB08", nombre: "Arriendo de locales municipales", tipo: "no_tributario", origen: "propio" },
];

const PARROQUIAS = Array.from({ length: 12 }, (_, i) => `Parroquia Sintetica ${String(i + 1).padStart(2, "0")}`);
const BANCOS = ["BCO-01", "BCO-02", "BCO-03", "BCO-04"];
const CAJAS = ["CAJA-01", "CAJA-02", "CAJA-03", "CAJA-04", "CAJA-05", "CAJA-06"];
const JUZGADOS = ["Juzgado de coactiva 01", "Juzgado de coactiva 02", "Juzgado de coactiva 03"];
const ESTADOS_JUICIO = ["en_tramite", "con_medidas", "suspendido", "archivado"];
const CANALES: CanalPago[] = ["caja", "caja", "banco", "banco", "red", "transferencia"];

const MS_DIA = 86_400_000;
const sumarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * MS_DIA);
const minimo = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);
const pad = (n: number, largo: number) => String(n).padStart(largo, "0");

function aFechaUTC(valor: Date | string): Date {
  const d = new Date(valor);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function cedula(rnd: Aleatorio): string {
  const provincia = rnd.probabilidad(0.6) ? 9 : rnd.entero(1, 24);
  const base = pad(provincia, 2) + String(rnd.entero(0, 5)) + pad(rnd.entero(0, 999_999), 6);
  return base + String(digitoVerificadorCedula(base));
}

function rucSociedad(rnd: Aleatorio): string {
  const coef = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = pad(rnd.probabilidad(0.6) ? 9 : rnd.entero(1, 24), 2) + "9" + pad(rnd.entero(0, 999_999), 6);
    const resto = base.split("").reduce((acc, d, i) => acc + Number(d) * (coef[i] ?? 0), 0) % 11;
    const verificador = resto === 0 ? 0 : 11 - resto;
    if (verificador !== 10) return base + String(verificador) + "001";
  }
}

/** Rompe una identificacion valida: altera el verificador o recorta la longitud. */
function invalidar(rnd: Aleatorio, identificacion: string): string {
  if (rnd.probabilidad(0.5)) return identificacion.slice(0, -1);
  const pos = identificacion.length >= 13 ? 9 : identificacion.length - 1;
  const digito = (Number(identificacion[pos]) + 1 + rnd.entero(0, 7)) % 10;
  return identificacion.slice(0, pos) + String(digito) + identificacion.slice(pos + 1);
}

function generarContribuyentes(rnd: Aleatorio, n: number): Contribuyente[] {
  const lista: Contribuyente[] = [];
  for (let i = 0; i < n; i++) {
    const tirada = rnd.siguiente();
    let tipo: TipoIdentificacion = tirada < 0.8 ? "cedula" : tirada < 0.95 ? "ruc" : "otro";
    let identificacion: string;
    let nombre = `Contribuyente Sintetico ${pad(i + 1, 5)}`;
    if (tipo === "cedula") identificacion = cedula(rnd);
    else if (tipo === "ruc" && rnd.probabilidad(0.5)) identificacion = cedula(rnd) + "001";
    else if (tipo === "ruc") {
      identificacion = rucSociedad(rnd);
      nombre = `Empresa Sintetica ${pad(i + 1, 5)} S.A.`;
    } else identificacion = `PX${pad(rnd.entero(0, 99_999_999), 8)}`;

    // Casos borde forzados en los primeros indices y repartidos por tasa en el resto.
    const anterior = lista[rnd.entero(0, Math.max(0, i - 1))];
    if (anterior && (i === 1 || rnd.probabilidad(0.02))) {
      tipo = anterior.tipoIdentificacion;
      identificacion = anterior.identificacion;
    } else if (tipo !== "otro" && (i === 2 || rnd.probabilidad(0.03))) {
      identificacion = invalidar(rnd, identificacion);
    }

    const sinUbicacion = i === 5 || i === 6 || rnd.probabilidad(0.08);
    let latitud: number | null = Math.round((-2.3 + rnd.siguiente() * 0.25) * 1e6) / 1e6;
    let longitud: number | null = Math.round((-79.99 + rnd.siguiente() * 0.12) * 1e6) / 1e6;
    if (sinUbicacion) {
      const caso = i === 5 ? 0 : i === 6 ? 2 : rnd.entero(0, 2);
      if (caso === 0) longitud = null;
      else if (caso === 1) latitud = longitud = null;
      else latitud = longitud = 0;
    }

    lista.push({
      id: `C${pad(i + 1, 5)}`,
      tipoIdentificacion: tipo,
      identificacion,
      nombre,
      parroquia: i === 3 || rnd.probabilidad(0.05) ? null : rnd.elegir(PARROQUIAS),
      sector: i === 4 || rnd.probabilidad(0.05) ? null : `Sector ${pad(rnd.entero(1, 40), 2)}`,
      latitud,
      longitud,
    });
  }
  return lista;
}

type CasoDemandado = "coincide" | "difiere" | "falta" | "vacia" | "espacios" | "longitud";

/**
 * Llena `identificacionDemandado` con un generador propio (derivado de la semilla) para no alterar
 * el resto de la secuencia. La mayoria coincide con la del contribuyente del titulo (a veces con
 * guiones o espacios); otras difieren, faltan o son inutilizables (vacia, solo espacios, longitud
 * imposible). Los titulos con varios juicios pueden tener identificaciones distintas entre si.
 */
function asignarIdentificacionesDemandado(
  semilla: number | string,
  contribuyentes: readonly Contribuyente[],
  titulos: readonly Titulo[],
  juicios: Juicio[],
): void {
  const rnd = new Aleatorio(`${semilla}:identificacion-demandado`);
  const contribuyentePorId = new Map(contribuyentes.map((c) => [c.id, c]));
  const tituloPorId = new Map(titulos.map((t) => [t.id, t]));
  const ordenEnTitulo = new Map<string, number>();

  const distinta = (actual: string): string => {
    for (let intento = 0; intento < 20; intento++) {
      const otra = rnd.elegir(contribuyentes).identificacion;
      if (normalizarIdentificacion(otra) !== normalizarIdentificacion(actual)) return otra;
    }
    return invalidar(rnd, actual.length > 1 ? actual : "0000000000");
  };
  const conFormato = (identificacion: string): string => {
    const formato = rnd.entero(0, 5);
    if (formato === 0) return `${identificacion.slice(0, -1)}-${identificacion.slice(-1)}`;
    if (formato === 1) return ` ${identificacion} `;
    if (formato === 2) return `${identificacion.slice(0, 5)} ${identificacion.slice(5)}`;
    return identificacion;
  };
  const elegirCaso = (orden: number): CasoDemandado => {
    const t = rnd.siguiente();
    if (orden > 0 && t < 0.4) return "difiere";
    if (t < 0.85) return "coincide";
    if (t < 0.92) return "difiere";
    if (t < 0.95) return "falta";
    if (t < 0.97) return "vacia";
    if (t < 0.985) return "espacios";
    return "longitud";
  };
  // Casos forzados en los primeros juicios para que existan en cualquier tamano.
  const FORZADOS: Record<number, CasoDemandado> = { 0: "coincide", 1: "difiere", 3: "falta", 4: "vacia", 5: "espacios", 6: "longitud" };

  juicios.forEach((juicio, i) => {
    const orden = ordenEnTitulo.get(juicio.tituloId) ?? 0;
    ordenEnTitulo.set(juicio.tituloId, orden + 1);
    const propia = contribuyentePorId.get(tituloPorId.get(juicio.tituloId)?.contribuyenteId ?? "")?.identificacion ?? "";
    const caso = FORZADOS[i] ?? elegirCaso(orden);

    if (caso === "coincide") juicio.identificacionDemandado = conFormato(propia);
    else if (caso === "difiere") juicio.identificacionDemandado = distinta(propia);
    else if (caso === "vacia") juicio.identificacionDemandado = "";
    else if (caso === "espacios") juicio.identificacionDemandado = "   ";
    else if (caso === "longitud") juicio.identificacionDemandado = rnd.probabilidad(0.5) ? "12" : "1".repeat(25);
    // "falta": el campo no se informa.
  });
}

export function generarDatosSinteticos(opciones: OpcionesGenerador = {}): DatosFinanzas {
  const rnd = new Aleatorio(opciones.semilla ?? 20260831);
  const nContribuyentes = Math.max(1, Math.floor(opciones.contribuyentes ?? 500));
  const nTitulos = Math.max(0, Math.floor(opciones.titulos ?? 1500));
  const fechaCorte = aFechaUTC(opciones.fechaCorte ?? "2026-08-31");
  const periodo = fechaCorte.toISOString().slice(0, 7);
  const corteCoactiva = sumarDias(fechaCorte, -3);

  const contribuyentes = generarContribuyentes(rnd, nContribuyentes);
  const titulos: Titulo[] = [];
  const pagos: Pago[] = [];
  const reversos: Reverso[] = [];
  const juicios: Juicio[] = [];
  const depositos: Deposito[] = [];
  let hayExtemporaneo = false;
  let hayPagoSinDeposito = false;
  let hayVariosJuicios = false;

  const nuevoJuicio = (titulo: Titulo, desde: Date) => {
    const fecha = minimo(sumarDias(desde, rnd.entero(0, 120)), corteCoactiva);
    juicios.push({
      id: `J${pad(juicios.length + 1, 5)}`,
      codigo: `JC-${fecha.getUTCFullYear()}-${pad(juicios.length + 1, 5)}`,
      tituloId: titulo.id,
      juzgado: rnd.elegir(JUZGADOS),
      estado: rnd.elegir(ESTADOS_JUICIO),
      fecha,
    });
  };

  for (let i = 0; i < nTitulos; i++) {
    // Sesgo cuadratico: pocos contribuyentes concentran muchos titulos (util para Pareto).
    const contribuyente = contribuyentes[Math.floor(nContribuyentes * rnd.siguiente() ** 2)] ?? contribuyentes[0];
    const fechaEmision = sumarDias(fechaCorte, -rnd.entero(0, 900));
    const fechaVencimiento = sumarDias(fechaEmision, rnd.elegir([30, 60, 90]));
    const valorCentavos = 2_000 + Math.floor(rnd.siguiente() ** 3 * 500_000);
    const titulo: Titulo = {
      id: `T${pad(i + 1, 6)}`,
      contribuyenteId: contribuyente?.id ?? "C00001",
      rubroId: rnd.elegir(RUBROS).id,
      valorEmitido: valorCentavos / 100,
      fechaEmision,
      fechaVencimiento,
      estado: "emitido",
    };

    let pagadoNeto = 0;
    if (rnd.probabilidad(0.45)) {
      const mitad = Math.floor(valorCentavos / 2);
      const cuotas = rnd.probabilidad(0.15)
        ? [mitad, valorCentavos - mitad]
        : [rnd.probabilidad(0.15) ? Math.floor(valorCentavos * 0.4) : valorCentavos];
      for (const [c, valor] of cuotas.entries()) {
        const fechaPago = minimo(sumarDias(fechaEmision, rnd.entero(0, 120) + c * 30), fechaCorte);
        const canal = rnd.elegir(CANALES);
        const bancario = canal !== "caja";
        const pago: Pago = {
          id: `P${pad(pagos.length + 1, 6)}`,
          tituloId: titulo.id,
          canal,
          fechaPago,
          valorBruto: valor / 100,
          cajaId: bancario ? null : rnd.elegir(CAJAS),
          bancoId: bancario ? rnd.elegir(BANCOS) : null,
        };
        pagos.push(pago);
        pagadoNeto += valor;

        const margen = diasEntre(fechaPago, fechaCorte);
        const forzarExtemporaneo: boolean = !hayExtemporaneo && margen >= 40 && pagos.length >= 3;
        if (forzarExtemporaneo || rnd.probabilidad(0.04)) {
          const extemporaneo: boolean = forzarExtemporaneo || (margen >= 40 && rnd.probabilidad(0.35));
          hayExtemporaneo ||= extemporaneo;
          reversos.push({
            id: `R${pad(reversos.length + 1, 5)}`,
            pagoId: pago.id,
            valor: pago.valorBruto,
            fecha: minimo(sumarDias(fechaPago, extemporaneo ? rnd.entero(35, 90) : rnd.entero(0, 5)), fechaCorte),
            extemporaneo,
          });
          pagadoNeto -= valor;
        }

        if (bancario) {
          const sinDeposito = !hayPagoSinDeposito || rnd.probabilidad(0.05);
          hayPagoSinDeposito = true;
          if (!sinDeposito) {
            const conReferencia = !rnd.probabilidad(0.1);
            const diferencia = rnd.probabilidad(0.02) ? rnd.elegir([-100, -1, 50]) : 0;
            depositos.push({
              id: `D${pad(depositos.length + 1, 6)}`,
              bancoId: pago.bancoId,
              fecha: conReferencia ? minimo(sumarDias(fechaPago, rnd.entero(0, 2)), fechaCorte) : fechaPago,
              valor: (valor + diferencia) / 100,
              referencia: conReferencia ? pago.id : null,
            });
          }
        }
      }
    }

    const diasVencido = diasEntre(fechaVencimiento, fechaCorte);
    let estado: EstadoTitulo = "emitido";
    if (rnd.probabilidad(0.03)) estado = "baja";
    else if (pagadoNeto >= valorCentavos) estado = "pagado";
    else if (diasVencido > 360 && rnd.probabilidad(0.4)) estado = "en_coactiva";
    else if (diasVencido > 90 && rnd.probabilidad(0.4)) estado = "en_cobranza";
    titulo.estado = estado;
    titulos.push(titulo);

    if (estado === "en_coactiva") {
      const cantidad: number = !hayVariosJuicios ? 3 : rnd.probabilidad(0.1) ? 3 : rnd.probabilidad(0.2) ? 2 : 1;
      hayVariosJuicios ||= cantidad > 1;
      for (let j = 0; j < cantidad; j++) nuevoJuicio(titulo, sumarDias(fechaVencimiento, 360));
    }
  }

  // Tamanos pequenos: garantiza al menos un titulo con varios juicios.
  if (!hayVariosJuicios) {
    const titulo = titulos.find((t) => t.estado !== "pagado" && t.estado !== "baja");
    if (titulo) {
      titulo.estado = "en_coactiva";
      for (let j = 0; j < 3; j++) nuevoJuicio(titulo, titulo.fechaVencimiento);
    }
  }

  asignarIdentificacionesDemandado(opciones.semilla ?? 20260831, contribuyentes, titulos, juicios);

  // Deposito que el banco informa sin transaccion asociada.
  if (pagos.length > 0) {
    depositos.push({
      id: `D${pad(depositos.length + 1, 6)}`,
      bancoId: rnd.elegir(BANCOS),
      fecha: sumarDias(fechaCorte, -1),
      valor: 123.45,
      referencia: "P-SIN-REGISTRO",
    });
  }

  const cortes: Corte[] = [
    { fechaCorte, horaExtraccion: "23:59", periodo, fuente: FUENTES_SINTETICAS.rentas },
    { fechaCorte, horaExtraccion: "23:59", periodo, fuente: FUENTES_SINTETICAS.tesoreria },
    { fechaCorte, horaExtraccion: "18:00", periodo, fuente: FUENTES_SINTETICAS.banco },
    { fechaCorte: corteCoactiva, horaExtraccion: "08:00", periodo, fuente: FUENTES_SINTETICAS.coactiva },
  ];

  return { contribuyentes, rubros: RUBROS.map((r) => ({ ...r })), titulos, pagos, reversos, juicios, depositos, cortes };
}

/** Corte de una fuente del conjunto; lanza si no existe. */
export function corteDe(datos: Pick<DatosFinanzas, "cortes">, fuente: string): Corte {
  const corte = datos.cortes.find((c) => c.fuente === fuente);
  if (!corte) throw new Error(`Sin corte para la fuente ${fuente}`);
  return corte;
}
