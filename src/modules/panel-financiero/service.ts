import {
  antiguedadCartera,
  calidadDatos,
  conciliarBanco,
  corteDe,
  cruzarIdentificaciones,
  FUENTES_SINTETICAS,
  partidasPorContribuyente,
  recaudacionNeta,
  saldoCarteraPorTitulo,
  segmentarPareto,
  type Corte,
  type DatosFinanzas,
} from "@/modules/finanzas";
import type { FuenteDatos, OpcionesPanelFinanciero, PanelFinanciero } from "./domain";
import { FuenteDatosSintetica } from "./fuente";

function resolverCorte(datos: DatosFinanzas, fuente: string): Corte {
  try {
    return corteDe(datos, fuente);
  } catch {
    return (
      datos.cortes.find((c) => c.fuente === fuente) ??
      datos.cortes[0] ?? {
        fechaCorte: new Date("2026-08-31"),
        horaExtraccion: "23:59",
        periodo: "2026-08",
        fuente,
      }
    );
  }
}

export class ServicioPanelFinanciero {
  private readonly fuente: FuenteDatos;

  constructor(fuente?: FuenteDatos) {
    this.fuente = fuente ?? new FuenteDatosSintetica();
  }

  async obtenerPanel(opciones?: OpcionesPanelFinanciero): Promise<PanelFinanciero> {
    const datos = await this.fuente.obtenerDatos();

    const corteTesoreria = resolverCorte(datos, FUENTES_SINTETICAS.tesoreria);
    const corteRentas = resolverCorte(datos, FUENTES_SINTETICAS.rentas);
    const corteCoactiva = resolverCorte(datos, FUENTES_SINTETICAS.coactiva);

    // 1. Recaudación neta (bruto, reversos normales, reversos extemporáneos aparte, neto)
    const recaudacion = recaudacionNeta({
      corte: corteTesoreria,
      pagos: datos.pagos,
      reversos: datos.reversos,
    });

    // 2. Saldo de cartera total sumado por título único
    const saldoCartera = saldoCarteraPorTitulo({
      corte: corteRentas,
      titulos: datos.titulos,
      pagos: datos.pagos,
      reversos: datos.reversos,
      juicios: datos.juicios,
    });

    // 3. Cartera por antigüedad en tramos
    const antiguedad = antiguedadCartera({
      corte: corteRentas,
      titulos: datos.titulos,
      pagos: datos.pagos,
      reversos: datos.reversos,
      juicios: datos.juicios,
    });

    // 4. Concentración Pareto (segmentación ABC sobre partidas de contribuyente)
    const partidas = partidasPorContribuyente(saldoCartera.valor.titulos);
    const pareto = segmentarPareto({
      corte: corteRentas,
      partidas,
      umbrales: opciones?.umbralesPareto,
    });

    // 5. Conciliación bancaria (conciliado y pendiente)
    const transaccionesConciliacion =
      opciones?.transaccionesConciliacion ?? datos.pagos.filter((p) => p.canal !== "caja");
    const conciliacion = conciliarBanco({
      corte: corteTesoreria,
      transacciones: transaccionesConciliacion,
      depositos: datos.depositos,
    });

    // 6. Calidad de datos (sin excluir registros del totalGeneral)
    const calidad = calidadDatos({
      corte: corteRentas,
      contribuyentes: datos.contribuyentes,
    });

    // 7. Cruce de identificaciones de título contra juicio (coincidentes, diferentes, no utilizables)
    const cruce = cruzarIdentificaciones({
      corte: corteCoactiva,
      titulos: datos.titulos,
      contribuyentes: datos.contribuyentes,
      juicios: datos.juicios,
    });

    return {
      recaudacion,
      saldoCartera,
      antiguedadCartera: antiguedad,
      pareto,
      conciliacion,
      calidadDatos: calidad,
      cruceIdentificaciones: cruce,
      esSintetico: true,
      calculadoEn: new Date().toISOString(),
    };
  }
}
