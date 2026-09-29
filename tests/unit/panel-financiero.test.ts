import { describe, expect, it } from "vitest";
import {
  antiguedadCartera,
  calidadDatos,
  conciliarBanco,
  corteDe,
  cruzarIdentificaciones,
  FUENTES_SINTETICAS,
  generarDatosSinteticos,
  partidasPorContribuyente,
  recaudacionNeta,
  saldoCarteraPorTitulo,
  segmentarPareto,
} from "@/modules/finanzas";
import {
  FuenteDatosSintetica,
  mensajesPanelFinanciero,
  ServicioPanelFinanciero,
  type FuenteDatos,
} from "@/modules/panel-financiero";

describe("ServicioPanelFinanciero - Cifras idénticas a calculadoras oficiales", () => {
  it("cada cifra del servicio es IGUAL a la de la calculadora correspondiente sobre los mismos datos", async () => {
    const fuente = new FuenteDatosSintetica(20260831);
    const datos = fuente.obtenerDatos();
    const servicio = new ServicioPanelFinanciero(fuente);
    const panel = await servicio.obtenerPanel();

    const corteTesoreria = corteDe(datos, FUENTES_SINTETICAS.tesoreria);
    const corteRentas = corteDe(datos, FUENTES_SINTETICAS.rentas);
    const corteCoactiva = corteDe(datos, FUENTES_SINTETICAS.coactiva);

    // 1. Recaudación neta
    const calcRecaudacion = recaudacionNeta({
      corte: corteTesoreria,
      pagos: datos.pagos,
      reversos: datos.reversos,
    });
    expect(panel.recaudacion.valor.bruto).toBe(calcRecaudacion.valor.bruto);
    expect(panel.recaudacion.valor.reversosNormales).toBe(calcRecaudacion.valor.reversosNormales);
    expect(panel.recaudacion.valor.reversosExtemporaneos).toBe(
      calcRecaudacion.valor.reversosExtemporaneos,
    );
    expect(panel.recaudacion.valor.neto).toBe(calcRecaudacion.valor.neto);
    expect(panel.recaudacion.valor.cantidadPagos).toBe(calcRecaudacion.valor.cantidadPagos);
    expect(panel.recaudacion.valor.cantidadReversosNormales).toBe(
      calcRecaudacion.valor.cantidadReversosNormales,
    );
    expect(panel.recaudacion.valor.cantidadReversosExtemporaneos).toBe(
      calcRecaudacion.valor.cantidadReversosExtemporaneos,
    );
    expect(panel.recaudacion.formula).toBe(calcRecaudacion.formula);
    expect(panel.recaudacion.fuente).toBe(calcRecaudacion.fuente);

    // 2. Saldo de cartera por título
    const calcSaldo = saldoCarteraPorTitulo({
      corte: corteRentas,
      titulos: datos.titulos,
      pagos: datos.pagos,
      reversos: datos.reversos,
      juicios: datos.juicios,
    });
    expect(panel.saldoCartera.valor.totalSaldo).toBe(calcSaldo.valor.totalSaldo);
    expect(panel.saldoCartera.valor.totalSaldoAFavor).toBe(calcSaldo.valor.totalSaldoAFavor);
    expect(panel.saldoCartera.valor.cantidadTitulos).toBe(calcSaldo.valor.cantidadTitulos);
    expect(panel.saldoCartera.valor.titulosConJuicio).toBe(calcSaldo.valor.titulosConJuicio);
    expect(panel.saldoCartera.valor.titulosConVariosJuicios).toBe(
      calcSaldo.valor.titulosConVariosJuicios,
    );
    expect(panel.saldoCartera.formula).toBe(calcSaldo.formula);

    // 3. Cartera por antigüedad
    const calcAntiguedad = antiguedadCartera({
      corte: corteRentas,
      titulos: datos.titulos,
      pagos: datos.pagos,
      reversos: datos.reversos,
      juicios: datos.juicios,
    });
    expect(panel.antiguedadCartera.valor.totalSaldo).toBe(calcAntiguedad.valor.totalSaldo);
    expect(panel.antiguedadCartera.valor.cuadra).toBe(calcAntiguedad.valor.cuadra);
    expect(panel.antiguedadCartera.valor.tramos).toEqual(calcAntiguedad.valor.tramos);
    expect(panel.antiguedadCartera.valor.porVencer).toEqual(calcAntiguedad.valor.porVencer);

    // 4. Concentración Pareto
    const calcPareto = segmentarPareto({
      corte: corteRentas,
      partidas: partidasPorContribuyente(calcSaldo.valor.titulos),
    });
    expect(panel.pareto.valor.total).toBe(calcPareto.valor.total);
    expect(panel.pareto.valor.cantidadClaves).toBe(calcPareto.valor.cantidadClaves);
    expect(panel.pareto.valor.concentracionTop20).toBe(calcPareto.valor.concentracionTop20);
    expect(panel.pareto.valor.segmentos).toEqual(calcPareto.valor.segmentos);

    // 5. Conciliación bancaria
    const bancarios = datos.pagos.filter((p) => p.canal !== "caja");
    const calcConciliacion = conciliarBanco({
      corte: corteTesoreria,
      transacciones: bancarios,
      depositos: datos.depositos,
    });
    expect(panel.conciliacion.valor.conciliado).toEqual(calcConciliacion.valor.conciliado);
    expect(panel.conciliacion.valor.pendiente).toEqual(calcConciliacion.valor.pendiente);
    expect(panel.conciliacion.valor.diferencias).toEqual(calcConciliacion.valor.diferencias);
    expect(panel.conciliacion.valor.depositosSinTransaccion).toEqual(
      calcConciliacion.valor.depositosSinTransaccion,
    );
    expect(panel.conciliacion.valor.cuadra).toBe(calcConciliacion.valor.cuadra);

    // 6. Calidad de datos
    const calcCalidad = calidadDatos({
      corte: corteRentas,
      contribuyentes: datos.contribuyentes,
    });
    expect(panel.calidadDatos.valor.totalGeneral).toBe(calcCalidad.valor.totalGeneral);
    expect(panel.calidadDatos.valor.identificaciones.validas.cantidad).toBe(
      calcCalidad.valor.identificaciones.validas.cantidad,
    );
    expect(panel.calidadDatos.valor.identificaciones.invalidas.cantidad).toBe(
      calcCalidad.valor.identificaciones.invalidas.cantidad,
    );
    expect(panel.calidadDatos.valor.identificaciones.duplicadas).toEqual(
      calcCalidad.valor.identificaciones.duplicadas,
    );
    expect(panel.calidadDatos.valor.sinParroquia.cantidad).toBe(
      calcCalidad.valor.sinParroquia.cantidad,
    );
    expect(panel.calidadDatos.valor.sinSector.cantidad).toBe(calcCalidad.valor.sinSector.cantidad);
    expect(panel.calidadDatos.valor.sinUbicacionSuficiente.cantidad).toBe(
      calcCalidad.valor.sinUbicacionSuficiente.cantidad,
    );
    expect(panel.calidadDatos.valor.cuadra).toBe(calcCalidad.valor.cuadra);

    // 7. Cruce de identificaciones
    const calcCruces = cruzarIdentificaciones({
      corte: corteCoactiva,
      titulos: datos.titulos,
      contribuyentes: datos.contribuyentes,
      juicios: datos.juicios,
    });
    expect(panel.cruceIdentificaciones.valor.totalPares).toBe(calcCruces.valor.totalPares);
    expect(panel.cruceIdentificaciones.valor.conteos).toEqual(calcCruces.valor.conteos);
    expect(panel.cruceIdentificaciones.valor.titulosConJuicio).toBe(
      calcCruces.valor.titulosConJuicio,
    );
    expect(panel.cruceIdentificaciones.valor.valorTitulosConJuicio).toBe(
      calcCruces.valor.valorTitulosConJuicio,
    );
    expect(panel.cruceIdentificaciones.valor.cuadra).toBe(calcCruces.valor.cuadra);
  });

  it("el total de calidad de datos no excluye registros (totalGeneral === contribuyentes.length)", async () => {
    const fuente = new FuenteDatosSintetica(999);
    const datos = fuente.obtenerDatos();
    const servicio = new ServicioPanelFinanciero(fuente);
    const panel = await servicio.obtenerPanel();

    expect(panel.calidadDatos.valor.totalGeneral).toBe(datos.contribuyentes.length);
    expect(panel.calidadDatos.valor.totalGeneral).toBe(500);

    // La suma de válidas, inválidas y no verificables es exactamente totalGeneral
    const idTotal =
      panel.calidadDatos.valor.identificaciones.validas.cantidad +
      panel.calidadDatos.valor.identificaciones.invalidas.cantidad +
      panel.calidadDatos.valor.identificaciones.noVerificables.cantidad;
    expect(idTotal).toBe(panel.calidadDatos.valor.totalGeneral);
  });

  it("el cruce de identificaciones cuenta todos los pares de juicios sin exclusión", async () => {
    const fuente = new FuenteDatosSintetica(20260831);
    const datos = fuente.obtenerDatos();
    const servicio = new ServicioPanelFinanciero(fuente);
    const panel = await servicio.obtenerPanel();

    const { totalPares, conteos } = panel.cruceIdentificaciones.valor;
    expect(totalPares).toBe(
      conteos.coincidentes + conteos.diferentes + conteos.noUtilizables,
    );
    expect(totalPares).toBe(datos.juicios.length);
    expect(panel.cruceIdentificaciones.valor.cuadra).toBe(true);
  });

  it("admite la inyeccion de una FuenteDatos personalizada", async () => {
    const datosPersonalizados = generarDatosSinteticos({
      semilla: 42,
      contribuyentes: 15,
      titulos: 30,
    });
    const fuenteCustom: FuenteDatos = {
      obtenerDatos: () => datosPersonalizados,
    };
    const servicio = new ServicioPanelFinanciero(fuenteCustom);
    const panel = await servicio.obtenerPanel();

    expect(panel.calidadDatos.valor.totalGeneral).toBe(15);
    // La calculadora puede excluir títulos (p. ej. dados de baja o posteriores al corte).
    const esperado = saldoCarteraPorTitulo({
      corte: corteDe(datosPersonalizados, FUENTES_SINTETICAS.rentas),
      titulos: datosPersonalizados.titulos,
      pagos: datosPersonalizados.pagos,
      reversos: datosPersonalizados.reversos,
      juicios: datosPersonalizados.juicios,
    });
    expect(datosPersonalizados.titulos).toHaveLength(30);
    expect(panel.saldoCartera.valor.cantidadTitulos).toBe(esperado.valor.cantidadTitulos);
    expect(panel.esSintetico).toBe(true);
  });
});

describe("Diccionario bilingüe mensajesPanelFinanciero", () => {
  it("ES y EN tienen exactamente las mismas claves", () => {
    const clavesEs = Object.keys(mensajesPanelFinanciero.es).sort();
    const clavesEn = Object.keys(mensajesPanelFinanciero.en).sort();
    expect(clavesEs).toEqual(clavesEn);
    expect(clavesEs.length).toBeGreaterThan(40);
  });
});
