import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADAPTADORES,
  AGENTES_AREA,
  colisionesDeHerramientas,
  crearRegistroFinanzas,
  fuenteSintetica,
  HERRAMIENTAS_POR_MODULO,
  NOMBRES_HERRAMIENTAS_AREA,
  SEMILLA_SINTETICA,
  UMBRAL_ALERTAS_PCT,
  type IdAgenteArea,
} from "@/modules/agentes-area";
import { corteDe, CortesDistintosError, cruzarIdentificaciones, generarDatosSinteticos, recaudacionNeta, saldoCarteraPorTitulo } from "@/modules/finanzas";
import {
  balanceComprobacion,
  conciliacionContable,
  cuadreFinContPres,
  disponibilidadPartida,
  ejecucionPresupuestaria,
  generarDatosContables,
  reformasCertificaciones,
} from "@/modules/finanzas-contable";
import {
  alertasDesviacion,
  avanceVsMeta,
  comparativoInteranual,
  consolidarEntidades,
  generarDatosDireccion,
  proyeccionEscenarios,
  tableroEjecutivo,
} from "@/modules/finanzas-direccion";
import { arqueoCaja, generarDatosPagos, productividadCajas, programarPagos, resumenOrdenesPago, validarOrdenPago } from "@/modules/finanzas-pagos";
import {
  efectoResoluciones,
  emisionPorRubro,
  estadoVigenteAlCorte,
  generarDatosRentas,
  recuperacionCoactiva,
  resumenCoactiva,
} from "@/modules/finanzas-rentas";
import { ModeloNoPermitidoError } from "@/orchestration/runtime/agent-runtime";
import type { PeticionTexto } from "@/orchestration/runtime/modelo";
import {
  esperarCifras,
  fuenteEspia,
  guionConsulta,
  ModeloNube,
  montar,
  ORG,
  PROYECTO,
  salidaDe,
  type Llamada,
} from "./agentes-area.soporte";

const fin = generarDatosSinteticos({ semilla: SEMILLA_SINTETICA });
const cont = generarDatosContables(SEMILLA_SINTETICA);
const pag = generarDatosPagos(SEMILLA_SINTETICA);
const ren = generarDatosRentas(SEMILLA_SINTETICA, fin);
const dir = generarDatosDireccion(SEMILLA_SINTETICA);

const cortePres = corteDe(cont, "presupuesto");
const corteCont = corteDe(cont, "contabilidad");
const corteRentas = corteDe(fin, "rentas");
const corteCoactiva = corteDe(fin, "coactiva");
const presupuesto = { corte: cortePres, ejercicio: cont.ejercicio, partidas: cont.partidas };
const cuadreDirecto = () =>
  cuadreFinContPres({
    corte: corteCont,
    cortesFuentes: cont.cortes.filter((c) => c.fuente !== corteCont.fuente),
    filas: cont.cuadre,
    justificaciones: cont.justificaciones,
  });
const RUTAS_CUADRE = ["totales.diferenciasAbsolutas", "totales.justificadoAbsoluto", "totales.pendienteAbsoluto", "cuadra"];

async function consultarCompletado(agente: IdAgenteArea, llamadas: Llamada[]) {
  const fuente = fuenteEspia();
  const env = montar({ guion: guionConsulta(llamadas), fuente });
  const r = await env.consultar(agente);
  if (r.estado !== "completado") throw new Error(r.estado);
  // Cada herramienta permitida se ejecuto y quedo auditada; ninguna fue denegada.
  const log = await env.auditor.listar(ORG);
  expect(log.filter((e) => e.accion === "herramienta.ejecutada").map((e) => e.entidad)).toEqual(
    llamadas.map((l) => `herramienta:${l.nombre}`),
  );
  expect(log.some((e) => e.accion === "herramienta.denegada")).toBe(false);
  expect(await env.auditor.verificar(ORG)).toEqual({ valida: true, total: log.length });
  expect(r.respuesta).not.toMatch(/^- [a-z_]+: (error|denegada)/m);
  return { r, env, fuente };
}

describe("agentes nuevos: cifras iguales a las calculadoras directas", () => {
  it("presupuestista: ejecucion, disponibilidad con solicitud simulada, reformas y cuadre", async () => {
    const solicitudes = [{ id: "S1", partidaId: "PG002", valor: 100 }];
    const llamadas: Llamada[] = [
      { nombre: "ejecucion_presupuestaria", args: {}, cifras: ["totales.gasto.codificado", "totales.gasto.devengado", "totales.ingreso.codificado", "totales.ingreso.recaudadoOPagado"] },
      { nombre: "disponibilidad_partida", args: { solicitudes }, cifras: ["alertas.0.disponible", "solicitudes.0.resultado", "solicitudes.0.disponibleAntes"] },
      { nombre: "reformas_certificaciones", args: {}, cifras: ["reformas.traspasosNeto", "reformas.netoIngresos", "reformas.netoGastos", "certificaciones.vigentes.valor"] },
      { nombre: "cuadre_fin_cont_pres", args: {}, cifras: RUTAS_CUADRE },
    ];
    const { r, fuente } = await consultarCompletado("presupuestista", llamadas);
    esperarCifras(r.respuesta, "ejecucion_presupuestaria", ejecucionPresupuestaria(presupuesto), llamadas[0]!.cifras);
    esperarCifras(r.respuesta, "disponibilidad_partida", disponibilidadPartida({ ...presupuesto, solicitudes }), llamadas[1]!.cifras);
    esperarCifras(r.respuesta, "reformas_certificaciones", reformasCertificaciones({ ...presupuesto, certificaciones: cont.certificaciones }), llamadas[2]!.cifras);
    esperarCifras(r.respuesta, "cuadre_fin_cont_pres", cuadreDirecto(), RUTAS_CUADRE);
    expect(fuente.cargas).toBe(4);
  });

  it("contador: conciliacion contable, balance de comprobacion y cuadre", async () => {
    const llamadas: Llamada[] = [
      { nombre: "conciliacion_contable", args: {}, cifras: ["totalContabilizado", "totalSubsistemas", "diferenciaTotal", "cuadra"] },
      { nombre: "balance_comprobacion", args: {}, cifras: ["totalDebe", "totalHaber", "diferencia", "cuadra", "cantidadAsientos"] },
      { nombre: "cuadre_fin_cont_pres", args: {}, cifras: RUTAS_CUADRE },
    ];
    const { r } = await consultarCompletado("contador", llamadas);
    esperarCifras(r.respuesta, "conciliacion_contable", conciliacionContable({ corte: corteCont, asientos: cont.asientos, subsistemas: cont.subsistemas }), llamadas[0]!.cifras);
    esperarCifras(r.respuesta, "balance_comprobacion", balanceComprobacion({ corte: corteCont, cuentas: cont.cuentas, asientos: cont.asientos }), llamadas[1]!.cifras);
    esperarCifras(r.respuesta, "cuadre_fin_cont_pres", cuadreDirecto(), RUTAS_CUADRE);
  });

  it("pagador: validacion, programacion con tope explicito y resumen de ordenes", async () => {
    const llamadas: Llamada[] = [
      { nombre: "validar_orden_pago", args: {}, cifras: ["totalOrdenes", "candidatas", "observadas"] },
      { nombre: "programar_pagos", args: { topeLiquidez: 3000 }, cifras: ["topeLiquidez", "totalPropuesto", "liquidezRestante"] },
      { nombre: "resumen_ordenes_pago", args: {}, cifras: ["total.cantidad", "total.valor", "porEstado.validada.valor", "porEstado.solicitada.cantidad"] },
    ];
    const { r } = await consultarCompletado("pagador", llamadas);
    const { corte, ordenes } = pag;
    esperarCifras(r.respuesta, "validar_orden_pago", validarOrdenPago({ corte, ordenes, beneficiarios: pag.beneficiarios, disponibilidades: pag.disponibilidades }), llamadas[0]!.cifras);
    esperarCifras(r.respuesta, "programar_pagos", programarPagos({ corte, ordenes, topeLiquidez: 3000 }), llamadas[1]!.cifras);
    esperarCifras(r.respuesta, "resumen_ordenes_pago", resumenOrdenesPago({ corte, ordenes }), llamadas[2]!.cifras);
  });

  it("cajero-mayor: arqueo, productividad y recaudacion neta", async () => {
    const llamadas: Llamada[] = [
      { nombre: "arqueo_caja", args: {}, cifras: ["totalTurnos", "cerrados", "sobrante", "faltante", "cuadre"] },
      { nombre: "productividad_cajas", args: {}, cifras: ["totalOperaciones", "valorTotal", "porSede.0.clave", "porSede.0.valor"] },
      { nombre: "recaudacion_neta", args: {}, cifras: ["bruto", "reversosExtemporaneos", "neto"] },
    ];
    const { r } = await consultarCompletado("cajero-mayor", llamadas);
    esperarCifras(r.respuesta, "arqueo_caja", arqueoCaja({ corte: pag.corte, turnos: pag.turnos, novedades: pag.novedades }), llamadas[0]!.cifras);
    esperarCifras(r.respuesta, "productividad_cajas", productividadCajas({ corte: pag.corte, cajas: pag.cajas, turnos: pag.turnos }), llamadas[1]!.cifras);
    esperarCifras(r.respuesta, "recaudacion_neta", recaudacionNeta({ corte: corteDe(fin, "tesoreria"), pagos: fin.pagos, reversos: fin.reversos }), llamadas[2]!.cifras);
  });

  it("rentas: emision, resoluciones, estado a una fecha pasada y saldo por titulo", async () => {
    const llamadas: Llamada[] = [
      { nombre: "emision_por_rubro", args: {}, cifras: ["totalTitulos", "totalValorEmitido", "titulosPosterioresAlCorte"] },
      { nombre: "efecto_resoluciones", args: {}, cifras: ["totalEfectoAplicado", "totalSaldoAntes", "totalSaldoDespues"] },
      { nombre: "estado_vigente_al_corte", args: { fecha: "2025-06-30" }, cifras: ["sinHistorial", "cambiaronDespuesDelCorte", "historialSinTitulo"] },
      { nombre: "saldo_cartera_por_titulo", args: {}, cifras: ["totalSaldo", "cantidadTitulos"] },
    ];
    const { r } = await consultarCompletado("rentas", llamadas);
    esperarCifras(r.respuesta, "emision_por_rubro", emisionPorRubro({ corte: corteRentas, titulos: fin.titulos, rubros: fin.rubros }), llamadas[0]!.cifras);
    esperarCifras(
      r.respuesta,
      "efecto_resoluciones",
      efectoResoluciones({ corte: corteRentas, titulos: fin.titulos, resoluciones: ren.resoluciones, pagos: fin.pagos, reversos: fin.reversos, historial: ren.historial }),
      llamadas[1]!.cifras,
    );
    const pasado = { ...corteRentas, fechaCorte: new Date("2025-06-30") };
    esperarCifras(r.respuesta, "estado_vigente_al_corte", estadoVigenteAlCorte({ corte: pasado, titulos: fin.titulos, historial: ren.historial }), llamadas[2]!.cifras);
    esperarCifras(r.respuesta, "saldo_cartera_por_titulo", saldoCarteraPorTitulo({ corte: corteRentas, titulos: fin.titulos, pagos: fin.pagos, reversos: fin.reversos, juicios: fin.juicios }), llamadas[3]!.cifras);
  });

  it("coactiva: resumen, recuperacion, estado al corte y cruce de identificaciones", async () => {
    const llamadas: Llamada[] = [
      { nombre: "resumen_coactiva", args: {}, cifras: ["cantidadTitulos", "cantidadJuicios", "titulosConVariosJuicios", "totalValorTitulos"] },
      { nombre: "recuperacion_coactiva", args: {}, cifras: ["cantidadTitulos", "totalBaseCoactiva", "totalRecuperado", "porcentajeRecuperado"] },
      { nombre: "estado_vigente_al_corte", args: {}, cifras: ["sinHistorial", "cambiaronDespuesDelCorte"] },
      { nombre: "cruzar_identificaciones", args: {}, cifras: ["totalPares", "conteos.coincidentes", "conteos.diferentes"] },
    ];
    const { r } = await consultarCompletado("coactiva", llamadas);
    esperarCifras(r.respuesta, "resumen_coactiva", resumenCoactiva({ corte: corteCoactiva, titulos: fin.titulos, juicios: fin.juicios, movimientos: ren.movimientos }), llamadas[0]!.cifras);
    esperarCifras(
      r.respuesta,
      "recuperacion_coactiva",
      recuperacionCoactiva({
        corte: corteCoactiva,
        titulos: fin.titulos,
        pagos: [...fin.pagos, ...ren.pagosCoactiva],
        reversos: fin.reversos,
        juicios: fin.juicios,
        historial: ren.historial,
        resoluciones: ren.resoluciones,
      }),
      llamadas[1]!.cifras,
    );
    esperarCifras(r.respuesta, "estado_vigente_al_corte", estadoVigenteAlCorte({ corte: corteRentas, titulos: fin.titulos, historial: ren.historial }), llamadas[2]!.cifras);
    esperarCifras(r.respuesta, "cruzar_identificaciones", cruzarIdentificaciones({ corte: corteCoactiva, ...fin }), llamadas[3]!.cifras);
  });

  it("director: tablero, avance contra meta, interanual y alertas", async () => {
    const llamadas: Llamada[] = [
      { nombre: "tablero_ejecutivo", args: {}, cifras: ["totalIndicadores", "totalAlertas", "compromisosAbiertos", "indicadores.0.valor"] },
      { nombre: "avance_vs_meta", args: {}, cifras: ["filas.0.avancePct", "filas.0.brecha", "filas.2.avancePct"] },
      { nombre: "comparativo_interanual", args: {}, cifras: ["filas.0.variacionAbsoluta", "filas.0.variacionPct"] },
      { nombre: "alertas_desviacion", args: { umbralPct: 5 }, cifras: ["total"] },
    ];
    const { r } = await consultarCompletado("director", llamadas);
    const entradaAlertas = { corte: dir.corte, metas: dir.metas, observados: dir.observados, compromisos: dir.compromisos };
    const alertas = alertasDesviacion({ ...entradaAlertas, umbralPct: UMBRAL_ALERTAS_PCT }).valor.alertas;
    const tablero = tableroEjecutivo({ indicadores: dir.indicadores, alertas, compromisos: dir.compromisos });
    // El adaptador declara en los filtros el umbral con que se calcularon las alertas del tablero.
    esperarCifras(r.respuesta, "tablero_ejecutivo", { ...tablero, filtros: [...tablero.filtros, `alertas de alertas_desviacion con umbral = ${UMBRAL_ALERTAS_PCT}%`] }, llamadas[0]!.cifras);
    esperarCifras(r.respuesta, "avance_vs_meta", avanceVsMeta({ corte: dir.corte, metas: dir.metas, observados: dir.observados }), llamadas[1]!.cifras);
    esperarCifras(r.respuesta, "comparativo_interanual", comparativoInteranual({ corte: dir.corte, observados: dir.observados }), llamadas[2]!.cifras);
    esperarCifras(r.respuesta, "alertas_desviacion", alertasDesviacion({ ...entradaAlertas, umbralPct: 5 }), ["total"]);
  });

  it("planificacion: consolidacion con cortes distintos se informa; escenarios, interanual y alertas", async () => {
    const escenarios = {
      base: { crecimientoIngresos: 0.02, crecimientoGastos: 0.02 },
      optimista: { crecimientoIngresos: 0.05, crecimientoGastos: 0.01 },
      pesimista: { crecimientoIngresos: -0.03, crecimientoGastos: 0.04 },
    };
    const proyeccion = { ingresosBase: 100_000, gastosBase: 90_000, liquidezBase: 20_000, periodos: 3, escenarios };
    const llamadas: Llamada[] = [
      { nombre: "consolidar_entidades", args: {}, cifras: [] },
      { nombre: "proyeccion_escenarios", args: proyeccion, cifras: ["escenarios.0.periodos.2.liquidez", "escenarios.1.periodos.2.liquidez", "escenarios.2.periodos.2.liquidez"] },
      { nombre: "comparativo_interanual", args: {}, cifras: ["filas.0.variacionPct"] },
      { nombre: "alertas_desviacion", args: {}, cifras: ["total"] },
    ];
    const env = montar({ guion: guionConsulta(llamadas) });
    const r = await env.consultar("planificacion");
    if (r.estado !== "completado") throw new Error(r.estado);

    expect(() => consolidarEntidades({ corte: dir.corte, entidades: dir.entidades, reportes: dir.reportes })).toThrow(CortesDistintosError);
    expect(r.respuesta).toContain("- consolidar_entidades: error cortes_distintos");
    esperarCifras(r.respuesta, "proyeccion_escenarios", proyeccionEscenarios({ corte: dir.corte, ...proyeccion }), llamadas[1]!.cifras);
    esperarCifras(r.respuesta, "comparativo_interanual", comparativoInteranual({ corte: dir.corte, observados: dir.observados }), llamadas[2]!.cifras);
    esperarCifras(
      r.respuesta,
      "alertas_desviacion",
      alertasDesviacion({ corte: dir.corte, metas: dir.metas, observados: dir.observados, compromisos: dir.compromisos, umbralPct: UMBRAL_ALERTAS_PCT }),
      ["total"],
    );
  });
});

describe("agentes nuevos: seguridad", () => {
  it.each([
    { agente: "pagador", ajena: "arqueo_caja" },
    { agente: "contador", ajena: "ejecucion_presupuestaria" },
    { agente: "director", ajena: "consolidar_entidades" },
    { agente: "coactiva", ajena: "emision_por_rubro" },
  ] as const)("$agente: deniega y audita $ajena (fuera de su lista) sin leer datos", async ({ agente, ajena }) => {
    const fuente = fuenteEspia();
    const env = montar({
      fuente,
      guion: {
        texto: (_p, n) =>
          n === 0
            ? { tipo: "llamada_herramienta", nombre: ajena, args: {} }
            : { tipo: "texto", texto: "## Resumen ejecutivo\nSin herramientas permitidas para esa consulta." },
      },
    });
    const r = await env.consultar(agente);
    expect(r.estado).toBe("completado");
    expect(fuente.cargas).toBe(0);

    const log = await env.auditor.listar(ORG);
    const denegadas = log.filter((e) => e.accion === "herramienta.denegada");
    expect(denegadas.map((e) => e.entidad)).toEqual([`herramienta:${ajena}`]);
    expect(denegadas[0]?.despues).toEqual({ motivo: "no_permitida" });
    expect(log.some((e) => e.accion === "herramienta.ejecutada")).toBe(false);
    const ultima = env.modelo.peticiones.at(-1) as PeticionTexto;
    expect(ultima.mensajes.filter((m) => m.rol === "herramienta").map((m) => salidaDe(m.contenido))).toEqual([{ estado: "denegada" }]);
    expect(await env.auditor.verificar(ORG)).toEqual({ valida: true, total: log.length });
  });

  it.each(["presupuestista", "rentas", "pagador", "planificacion"] as const)(
    "%s: fuente no sintetica con modelo en la nube se rechaza sin llamar al modelo",
    async (agente) => {
      const fuente = fuenteEspia({ tipo: "real" });
      const modelo = new ModeloNube();
      const env = montar({ modelo, fuente });
      const err = await env.consultar(agente).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ModeloNoPermitidoError);
      expect(modelo.llamadasTexto).toBe(0);
      expect(fuente.cargas).toBe(0);
      expect(await env.tareas.listarPorProyecto(ORG, PROYECTO)).toEqual([]);
      const log = await env.auditor.listar(ORG);
      expect(log.map((e) => e.accion)).toEqual(["modelo.rechazado_politica_datos"]);
      expect(log[0]?.despues).toMatchObject({ modoDatos: "real", alojamiento: "nube" });
    },
  );

  it("una fuente real sin el modulo no recibe datos sinteticos: la herramienta lo informa como faltante", async () => {
    const fuente = fuenteEspia({ tipo: "real", soloFinanzas: true });
    const env = montar({
      fuente,
      guion: guionConsulta([{ nombre: "balance_comprobacion", args: {}, cifras: ["totalDebe"] }]),
    });
    const r = await env.consultar("contador");
    if (r.estado !== "completado") throw new Error(r.estado);
    expect(r.respuesta).toContain("- balance_comprobacion: error modulo_no_disponible");
    const consulta = (await env.auditor.listar(ORG)).find((e) => e.accion === "agente_area.consulta");
    expect(consulta?.despues).toMatchObject({ modoDatos: "real" });

    // Una fuente sintetica sin cargadores propios usa los generadores con semilla fija.
    const sintetica = montar({
      fuente: fuenteEspia({ soloFinanzas: true }),
      guion: guionConsulta([{ nombre: "balance_comprobacion", args: {}, cifras: ["totalDebe"] }]),
    });
    const s = await sintetica.consultar("contador");
    if (s.estado !== "completado") throw new Error(s.estado);
    esperarCifras(s.respuesta, "balance_comprobacion", balanceComprobacion({ corte: corteCont, cuentas: cont.cuentas, asientos: cont.asientos }), ["totalDebe"]);
  });

  it("estado_vigente_al_corte rechaza como dato una fecha posterior al corte de la fuente", async () => {
    const registro = crearRegistroFinanzas(fuenteSintetica());
    const r = await registro.obtener("estado_vigente_al_corte")?.invocar({ fecha: "2099-01-01" }, { orgId: ORG, agenteId: "a", tareaId: "t" });
    expect(r?.ok && r.salida).toMatchObject({ error: "entrada_invalida" });
  });
});

describe("catalogo de 12 agentes, skills y registro de herramientas", () => {
  const skillDe = (id: string) => readFile(path.join(process.cwd(), "src", "orchestration", "skills", `${id}.md`), "utf8");

  it("el catalogo tiene los 12 agentes con ids, agenteId y skills unicos", () => {
    expect(AGENTES_AREA.map((a) => a.id).sort()).toEqual(
      ["cajero-mayor", "cartera", "coactiva", "contador", "control-estadistica", "datos", "director", "pagador", "planificacion", "presupuestista", "rentas", "tesorero"],
    );
    expect(new Set(AGENTES_AREA.map((a) => a.agenteId)).size).toBe(12);
    for (const a of AGENTES_AREA) {
      expect(a.skill).toBe(a.id);
      expect(a.alojamiento).toBe("local");
      expect(new Set(a.herramientasPermitidas).size, a.id).toBe(a.herramientasPermitidas.length);
    }
  });

  it.each(AGENTES_AREA.map((a) => a.id))("la skill de %s menciona exactamente las herramientas de su lista del catalogo", async (id) => {
    const agente = AGENTES_AREA.find((a) => a.id === id);
    const texto = await skillDe(id);
    const mencionadas = NOMBRES_HERRAMIENTAS_AREA.filter((n) => new RegExp(`\\b${n}\\b`).test(texto));
    expect(new Set(mencionadas)).toEqual(new Set(agente?.herramientasPermitidas));
    // Todo identificador snake_case entre comillas invertidas es una herramienta de su lista.
    for (const [, m] of texto.matchAll(/`([a-z0-9]+(?:_[a-z0-9]+)+)`/g)) {
      expect(agente?.herramientasPermitidas, `${id} menciona ${m}`).toContain(m);
    }
  });

  it("no hay nombres de herramienta duplicados entre modulos y cada adaptador lee de su modulo", () => {
    expect(colisionesDeHerramientas(HERRAMIENTAS_POR_MODULO)).toEqual([]);
    const total = Object.values(HERRAMIENTAS_POR_MODULO).reduce((s, n) => s + n.length, 0);
    expect(NOMBRES_HERRAMIENTAS_AREA).toHaveLength(total);
    expect(new Set(NOMBRES_HERRAMIENTAS_AREA).size).toBe(total);
    for (const [modulo, nombres] of Object.entries(HERRAMIENTAS_POR_MODULO)) {
      for (const n of nombres) expect(ADAPTADORES[n].modulo, n).toBe(modulo);
    }
    // El detector si encuentra una colision.
    expect(colisionesDeHerramientas({ a: ["x", "y"], b: ["y"], c: ["x"] })).toEqual(["x", "y"]);
  });

  it.each(AGENTES_AREA.map((a) => a.id))("%s: solo ve sus herramientas y la skill va al prompt de sistema, no a la tarea", async (id) => {
    const env = montar({});
    await env.consultar(id, "Pregunta de prueba");
    const agente = AGENTES_AREA.find((a) => a.id === id);
    const p = env.modelo.peticiones[0] as PeticionTexto;
    expect(p.herramientas.map((h) => h.nombre).sort()).toEqual([...(agente?.herramientasPermitidas ?? [])].sort());
    const encabezado = (await skillDe(id)).split("\n")[0] ?? "";
    expect(p.sistema).toContain(encabezado);
    expect(p.mensajes.map((m) => m.contenido).join("\n")).not.toContain(encabezado);
    const [tarea] = await env.tareas.listarPorProyecto(ORG, PROYECTO);
    expect(tarea?.descripcion).toBe("Pregunta de prueba");
  });
});
