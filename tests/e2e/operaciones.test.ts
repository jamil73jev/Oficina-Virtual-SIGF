import { describe, expect, it } from "vitest";
import {
  ModuloNoDisponibleError,
  fuenteSintetica,
  partidasPorContribuyente,
  puedeTraspasar,
  renderizarTablas,
  tablasAMarkdown,
  SEMILLA_SINTETICA,
  UMBRAL_ALERTAS_PCT,
  type FuenteDatos,
  type TablaHerramienta,
} from "@/modules/agentes-area";
import {
  antiguedadCartera,
  corteDe,
  generarDatosSinteticos,
  saldoCarteraPorTitulo,
  segmentarPareto,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import { alertasDesviacion, generarDatosDireccion, tableroEjecutivo } from "@/modules/finanzas-direccion";
import {
  emisionPorRubro,
  estadoVigenteAlCorte,
  generarDatosRentas,
  recuperacionCoactiva,
  resumenCoactiva,
} from "@/modules/finanzas-rentas";
import {
  MAX_RESUMEN_TRASPASO,
  TraspasoNoPermitidoError,
  agentesPorPalabrasClave,
  cadenaValida,
  modeloSimuladoDePaso,
  planDeterminista,
  preguntaDePaso,
  type PasoOperacion,
} from "@/modules/operaciones";
import { estimarTokens, ModeloSimulado } from "@/orchestration/runtime/modelo";
import { EventoTraza, InstantaneaOperacion } from "@/orchestration/traza/eventos";
import { CTX_A, CTX_B, ENCARGO_CARTERA, ORG_A, ORG_B, deTipo, montarOperaciones } from "./operaciones.soporte";

/** Cada operacion ejecuta varios agentes y calculadoras completas: con la suite en paralelo supera 5 s. */
const LENTO = 60_000;

const fin = generarDatosSinteticos({ semilla: SEMILLA_SINTETICA });
const ren = generarDatosRentas(SEMILLA_SINTETICA, fin);
const dir = generarDatosDireccion(SEMILLA_SINTETICA);
const corteRentas = corteDe(fin, "rentas");
const corteCoactiva = corteDe(fin, "coactiva");
const cartera = { corte: corteRentas, titulos: fin.titulos, pagos: fin.pagos, reversos: fin.reversos, juicios: fin.juicios };
const alertas = (umbralPct: number) =>
  alertasDesviacion({ corte: dir.corte, metas: dir.metas, observados: dir.observados, compromisos: dir.compromisos, umbralPct });

/** Calculadoras invocadas directamente (sin agente ni runtime) para cada herramienta del plan. */
const DIRECTO: Record<string, () => ResultadoCalculo<unknown>> = {
  emision_por_rubro: () => emisionPorRubro({ corte: corteRentas, titulos: fin.titulos, rubros: fin.rubros }),
  estado_vigente_al_corte: () => estadoVigenteAlCorte({ corte: corteRentas, titulos: fin.titulos, historial: ren.historial }),
  saldo_cartera_por_titulo: () => saldoCarteraPorTitulo(cartera),
  antiguedad_cartera: () => antiguedadCartera(cartera),
  segmentar_pareto: () => segmentarPareto({ corte: corteRentas, partidas: partidasPorContribuyente(fin) }),
  resumen_coactiva: () =>
    resumenCoactiva({ corte: corteCoactiva, titulos: fin.titulos, juicios: fin.juicios, movimientos: ren.movimientos }),
  recuperacion_coactiva: () =>
    recuperacionCoactiva({
      corte: corteCoactiva,
      titulos: fin.titulos,
      pagos: [...fin.pagos, ...ren.pagosCoactiva],
      reversos: fin.reversos,
      juicios: fin.juicios,
      historial: ren.historial,
      resoluciones: ren.resoluciones,
    }),
  alertas_desviacion: () => alertas(UMBRAL_ALERTAS_PCT),
  tablero_ejecutivo: () => {
    const r = tableroEjecutivo({
      indicadores: dir.indicadores,
      alertas: alertas(UMBRAL_ALERTAS_PCT).valor.alertas,
      compromisos: dir.compromisos,
    });
    return { ...r, filtros: [...r.filtros, `alertas de alertas_desviacion con umbral = ${UMBRAL_ALERTAS_PCT}%`] };
  },
};

const comoJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const tablasDirectas = (herramienta: string): TablaHerramienta[] => {
  const r = (DIRECTO[herramienta] as () => ResultadoCalculo<unknown>)();
  return comoJson(
    renderizarTablas(
      [{ herramienta, tipoDatos: "sintetico", fuente: r.fuente, formula: r.formula, filtros: r.filtros, corte: r.corte, valor: r.valor }],
      "es",
    ).map((tabla) => {
      const publica = { ...tabla };
      delete publica.filasCompletas;
      return publica;
    }),
  );
};
const tablasDeEventos = (eventos: readonly EventoTraza[], herramienta?: string) =>
  deTipo(eventos, "tabla")
    .filter((e) => herramienta === undefined || e.detalle?.herramienta === herramienta)
    .flatMap((e) => Array.isArray(e.detalle?.tablas) ? e.detalle.tablas as unknown as TablaHerramienta[] : []);

/** Fuente sintetica sin el modulo de rentas (resoluciones, historial, coactiva): esos pasos quedan sin datos. */
function fuenteSinRentas(): FuenteDatos {
  const base = fuenteSintetica();
  return {
    ...base,
    descripcion: "sintetica sin modulo de rentas",
    cargar: (orgId) => base.cargar(orgId),
    cargarRentas: async () => {
      throw new ModuloNoDisponibleError("rentas");
    },
  };
}

function fuenteVacia(): FuenteDatos {
  const sinModulo = async () => { throw new ModuloNoDisponibleError("rentas"); };
  return {
    tipo: "sintetico",
    descripcion: "fuente vacia",
    cargar: sinModulo,
    cargarContable: sinModulo,
    cargarPagos: sinModulo,
    cargarRentas: sinModulo,
    cargarDireccion: sinModulo,
  };
}

const planModelo = (roles: string[]) => ({
  tareas: roles.map((rol, i) => ({
    clave: `t${i + 1}`,
    titulo: `Paso ${rol}`,
    descripcion: `Analisis de ${rol}`,
    rol,
    criterios: ["contiene:Resumen"],
    deps: i === 0 ? [] : [`t${i}`],
  })),
});

describe("operaciones: planificador determinista", { timeout: LENTO }, () => {
  it("elige agentes por palabras clave y arma una cadena valida que termina en el Director", () => {
    expect(agentesPorPalabrasClave(ENCARGO_CARTERA)).toEqual(["rentas", "cartera", "coactiva"]);
    const casos = [
      "Revisa la ejecución del presupuesto",
      "Programa los pagos de la semana",
      "Arqueo de caja y conciliación bancaria",
      "Evalúa la calidad de datos",
      "Proyección de escenarios para 2027",
      "Recaudación del mes",
      "Algo sin palabras clave",
    ];
    for (const texto of casos) {
      const plan = planDeterminista(texto, "es", "prueba");
      const cadena = plan.pasos.map((p) => p.agenteId);
      expect(plan.respaldo).toBe(true);
      expect(cadena.at(-1)).toBe("director");
      expect(cadena.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < cadena.length; i++) expect(puedeTraspasar(cadena[i - 1] as string, cadena[i] as string), texto).toBe(true);
    }
  });

  it("usa caminos del grafo o al Director como intermediario", () => {
    expect(cadenaValida(["pagador", "presupuestista"])).toEqual(["pagador", "tesorero", "contador", "presupuestista", "director"]);
    expect(cadenaValida(["coactiva", "planificacion"])).toEqual(["coactiva", "director", "planificacion", "director"]);
  });
});

describe("operaciones: encargo de extremo a extremo con modelo simulado", { timeout: LENTO }, () => {
  it("cartera vencida y cobranza: plan, traspasos, tablas iguales a las calculadoras, entregable y cierre", async () => {
    const env = montarOperaciones();
    const { operacionId, eventos } = await env.correr();

    // Contrato y secuencias contiguas.
    for (const e of eventos) expect(EventoTraza.safeParse(e).success).toBe(true);
    expect(eventos.map((e) => e.secuencia)).toEqual(eventos.map((_, i) => i + 1));
    expect(eventos.every((e) => e.orgId === ORG_A && e.operacionId === operacionId)).toBe(true);
    expect(eventos[0]?.tipo).toBe("operacion_creada");
    expect(eventos.at(-1)?.tipo).toBe("operacion_finalizada");
    expect(eventos.at(-1)?.detalle?.estado).toBe("completada");
    expect(deTipo(eventos, "error")).toEqual([]);
    expect(eventos.length).toBeLessThan(150);

    // Plan (respaldo determinista con el modelo simulado).
    const [plan] = deTipo(eventos, "plan_creado");
    expect(plan?.detalle).toMatchObject({ respaldo: true, motivoRespaldo: "modelo_simulado", cadena: ["rentas", "cartera", "coactiva", "director"] });

    // Al menos 3 traspasos entre agentes distintos, todos permitidos por el grafo.
    const traspasos = deTipo(eventos, "traspaso");
    expect(traspasos.length).toBeGreaterThanOrEqual(3);
    for (const t of traspasos) {
      expect(t.agenteId).not.toBe(t.haciaAgenteId);
      expect(puedeTraspasar(t.agenteId as string, t.haciaAgenteId as string)).toBe(true);
      // Resumen y referencias, nunca el historial completo.
      expect(Object.keys(t.detalle ?? {}).sort()).toEqual(["estadoPaso", "pasoSiguiente", "referencias", "resumen"]);
      expect((t.detalle?.resumen as string).length).toBeLessThanOrEqual(MAX_RESUMEN_TRASPASO);
      expect(t.detalle?.referencias).toMatchObject({ ejecucionId: expect.any(String), tablas: expect.any(Array) });
    }
    expect(new Set(traspasos.flatMap((t) => [t.agenteId, t.haciaAgenteId])).size).toBeGreaterThanOrEqual(4);
    expect(deTipo(eventos, "agente_inicia").map((e) => e.agenteId)).toEqual(["rentas", "cartera", "coactiva", "director"]);

    // Cada tabla es igual a la de su calculadora invocada directamente.
    const herramientas = Object.keys(DIRECTO);
    expect(new Set(deTipo(eventos, "herramienta").map((e) => e.detalle?.herramienta))).toEqual(new Set(herramientas));
    for (const h of herramientas) {
      const esperadas = tablasDirectas(h);
      expect(esperadas.length, h).toBeGreaterThan(0);
      expect(tablasDeEventos(eventos, h), h).toEqual(esperadas);
    }

    // Comentarios por paso completados, sin cifras no verificadas.
    const comentarios = deTipo(eventos, "comentario");
    expect(comentarios.map((c) => c.estado)).toEqual(["completado", "completado", "completado", "completado"]);
    for (const c of comentarios) expect(c.detalle?.cifrasNoVerificadas).toEqual([]);
    for (const c of comentarios) expect(c.detalle?.duracionMs).toMatchObject({ herramientas: expect.any(Number), comentario: expect.any(Number), total: expect.any(Number) });
    expect(eventos.at(-1)?.detalle?.duracionMs).toEqual(expect.any(Number));

    // Entregable: tablas deterministas de todos los pasos y comentario verificado.
    const [entregable] = deTipo(eventos, "entregable");
    const markdown = entregable?.detalle?.markdown as string;
    expect(Buffer.byteLength(markdown, "utf8")).toBeLessThan(200 * 1024);
    for (const h of herramientas) {
      for (const tabla of tablasDirectas(h)) expect(markdown).toContain(tablasAMarkdown([tabla], "es").split("\n")[1] as string);
    }
    expect(entregable?.detalle?.cifrasNoVerificadas).toEqual([]);
    expect((entregable?.detalle?.verificacion as { verificadas: number }).verificadas).toBeGreaterThan(0);

    // Instantanea, auditoria y sin suscripciones colgadas.
    const instantanea = await env.servicio.obtenerInstantanea(ORG_A, operacionId);
    expect(InstantaneaOperacion.parse(instantanea).estado).toBe("completada");
    expect(instantanea?.eventos).toHaveLength(eventos.length);
    const acciones = await env.acciones();
    for (const a of ["operacion.creada", "operacion.plan_creado", "operacion.traspaso", "operacion.entregable", "operacion.finalizada"]) {
      expect(acciones).toContain(a);
    }
    expect(acciones.filter((a) => a === "operacion.traspaso")).toHaveLength(traspasos.length);
    expect(env.publicador.suscriptoresActivos()).toBe(0);
  });

  it("devuelve el operacionId de inmediato y ejecuta en segundo plano", async () => {
    let pendiente: (() => Promise<void>) | null = null;
    const env = montarOperaciones({ programar: (t) => (pendiente = t) });
    const { operacionId } = await env.servicio.encargar(ENCARGO_CARTERA, undefined, CTX_A);
    const antes = await env.servicio.obtenerInstantanea(ORG_A, operacionId);
    expect(antes?.estado).toBe("en_curso");
    expect(antes?.idioma).toBe("es");
    expect(antes?.eventos.map((e) => e.tipo)).toEqual(["operacion_creada"]);
    await (pendiente as unknown as () => Promise<void>)();
    expect((await env.servicio.obtenerInstantanea(ORG_A, operacionId))?.estado).toBe("completada");
  });

  it("rechaza entradas invalidas sin crear operaciones", async () => {
    const env = montarOperaciones();
    await expect(env.servicio.encargar("  ", "es", CTX_A)).rejects.toThrow("invalida");
    await expect(env.servicio.encargar("x".repeat(2001), "es", CTX_A)).rejects.toThrow("invalida");
    await expect(env.servicio.encargar("ok", "fr" as "es", CTX_A)).rejects.toThrow("invalida");
    expect(env.publicador.operacionesRetenidas).toBe(0);
  });

  it("un paso sin datos queda en sin_datos sin ocultar las tablas de los demas pasos", async () => {
    const env = montarOperaciones({ fuente: fuenteSinRentas() });
    const { eventos } = await env.correr();
    const estados = Object.fromEntries(deTipo(eventos, "comentario").map((c) => [c.agenteId, c.estado]));
    expect(estados).toEqual({ rentas: "sin_datos", cartera: "completado", coactiva: "sin_datos", director: "completado" });
    // Las tablas de cartera y director siguen siendo las de sus calculadoras.
    for (const h of ["saldo_cartera_por_titulo", "antiguedad_cartera", "segmentar_pareto", "tablero_ejecutivo", "alertas_desviacion"]) {
      expect(tablasDeEventos(eventos, h), h).toEqual(tablasDirectas(h));
    }
    // Los pasos sin datos muestran sus errores como tabla, y la cadena de traspasos continua.
    expect(tablasDeEventos(eventos, "resumen_coactiva").length).toBeGreaterThan(0);
    expect(deTipo(eventos, "traspaso")).toHaveLength(3);
    const markdown = deTipo(eventos, "entregable")[0]?.detalle?.markdown as string;
    expect(markdown).toContain("Sin datos");
    expect(markdown).toContain(tablasDirectas("saldo_cartera_por_titulo")[0]?.titulo);
    expect(eventos.at(-1)?.detalle?.estado).toBe("parcial");
    expect(await env.acciones()).toContain("operacion.paso_sin_datos");
  });

  it("un modelo que no llama herramientas no impide la ejecución determinista", async () => {
    const env = montarOperaciones({ fuente: fuenteSinRentas() });
    const { eventos } = await env.correr("Revisa los juicios coactivos");
    // coactiva y su cadena dependen de rentas; el Director si tiene datos.
    expect(deTipo(eventos, "plan_creado")[0]?.detalle?.cadena).toEqual(["cartera", "coactiva", "director"]);
    const soloSinDatos = montarOperaciones({
      modeloDePaso: () => new ModeloSimulado({ texto: () => ({ tipo: "texto", texto: "Sin herramientas." }) }),
    });
    const r = await soloSinDatos.correr();
    expect(deTipo(r.eventos, "comentario").every((c) => c.estado === "completado")).toBe(true);
    expect(r.eventos.at(-1)?.detalle?.estado).toBe("completada");
    expect(deTipo(r.eventos, "entregable")).toHaveLength(1);
  });

  it("termina sin_datos cuando ninguna herramienta obligatoria obtiene datos", async () => {
    const env = montarOperaciones({
      fuente: fuenteVacia(),
      modeloDePaso: () => new ModeloSimulado({ texto: () => ({ tipo: "texto", texto: "Sin cifras." }) }),
    });
    const { eventos } = await env.correr();
    expect(deTipo(eventos, "comentario").every((evento) => evento.estado === "sin_datos")).toBe(true);
    expect(eventos.at(-1)?.detalle?.estado).toBe("sin_datos");
  });

  it("un fallo del modelo tras las herramientas conserva las tablas del paso", async () => {
    const env = montarOperaciones({
      modeloDePaso: (paso, salidas) => {
        const base = modeloSimuladoDePaso(paso, salidas, "es");
        if (paso.agenteId !== "cartera") return base;
        return new ModeloSimulado({
          texto: (_p, n) => {
            const llamada = paso.herramientas[n];
            if (llamada) return { tipo: "llamada_herramienta", nombre: llamada.nombre, args: llamada.args };
            throw new Error("modelo inalcanzable");
          },
        });
      },
    });
    const { eventos } = await env.correr();
    expect(tablasDeEventos(eventos, "antiguedad_cartera")).toEqual(tablasDirectas("antiguedad_cartera"));
    const cartera = deTipo(eventos, "comentario").find((c) => c.agenteId === "cartera");
    expect(cartera?.estado).toBe("completado");
    expect(cartera?.detalle?.comentario).toContain("No hay comentario del modelo");
  });

  it("el traspaso lleva resumen y referencias; el siguiente agente no recibe el historial completo", async () => {
    const modelos: Array<{ paso: PasoOperacion; modelo: ModeloSimulado }> = [];
    const env = montarOperaciones({
      modeloDePaso: (paso, salidas) => {
        const modelo = modeloSimuladoDePaso(paso, salidas, "es") as ModeloSimulado;
        modelos.push({ paso, modelo });
        return modelo;
      },
    });
    const { eventos } = await env.correr();
    const [primero, segundo] = modelos;
    for (const item of modelos) expect(item.modelo.llamadasTexto).toBe(1);
    for (const item of modelos) {
      const peticion = item.modelo.peticiones[0]!;
      const entrada = peticion.sistema + peticion.mensajes.map((mensaje) => mensaje.contenido).join("\n");
      expect(estimarTokens(entrada), item.paso.agenteId).toBeLessThan(1_000);
      expect(peticion.sistema).toContain("120 palabras");
      expect(peticion.sistema).toContain("NO inventes porcentajes");
    }
    const entradaSegundo = segundo?.modelo.peticiones[0]?.mensajes[0]?.contenido ?? "";
    const traspaso = deTipo(eventos, "traspaso")[0];
    expect(entradaSegundo).toContain("Traspaso de rentas");
    expect(entradaSegundo).toContain(`ejecucion ${String((traspaso?.detalle?.referencias as { ejecucionId: string }).ejecucionId)}`);
    // El comentario completo del paso anterior (su ultima seccion) no viaja al siguiente agente.
    const comentarioPrimero = deTipo(eventos, "comentario")[0]?.detalle?.comentario as string;
    expect(primero?.paso.agenteId).toBe("rentas");
    expect(comentarioPrimero).toContain("Validar los hallazgos");
    expect(entradaSegundo).not.toContain("Validar los hallazgos");
    expect(entradaSegundo).toContain("<datos_herramienta");
    expect(preguntaDePaso(segundo?.paso as PasoOperacion, null)).not.toContain("Traspaso");
  });

  it("comentario del Director con una cifra inventada: queda marcada y auditada", async () => {
    const env = montarOperaciones({
      modelo: new ModeloSimulado({ texto: () => ({ tipo: "texto", texto: "La cartera suma 123456789.99 y crece 77.7%." }) }),
      modeloDePaso: (paso, salidas) => modeloSimuladoDePaso(paso, salidas, "es"),
      planificarConModelo: false,
    });
    const { eventos } = await env.correr();
    const entregable = deTipo(eventos, "entregable")[0];
    expect((entregable?.detalle?.cifrasNoVerificadas as Array<{ texto: string }>).map((c) => c.texto)).toEqual([
      "123456789.99",
      "77.7%",
    ]);
    expect(entregable?.detalle?.markdown).toContain("Cifras no verificadas por las herramientas");
    expect(await env.acciones()).toContain("operacion.cifras_no_verificadas");
  });

  it("verifica en cartera una cifra real emitida por el paso anterior sin aceptar una inventada", async () => {
    const env = montarOperaciones({
      modeloDePaso: (paso) => new ModeloSimulado({
        texto: () => ({
          tipo: "texto",
          texto: paso.agenteId === "cartera"
            ? "Resumen ejecutivo: el valor emitido previo fue 1,855,231.81; 9,999,999.99 no tiene respaldo."
            : "Resumen ejecutivo sin cifras.",
        }),
      }),
    });
    const { eventos } = await env.correr();
    const cartera = deTipo(eventos, "comentario").find((evento) => evento.agenteId === "cartera");
    expect((cartera?.detalle?.cifrasNoVerificadas as Array<{ texto: string }>).map((cifra) => cifra.texto)).toEqual(["9,999,999.99"]);
  });
});

describe("operaciones: plan del Director con el modelo", { timeout: LENTO }, () => {
  const conModelo = (objeto: () => unknown) =>
    montarOperaciones({
      modelo: new ModeloSimulado({ objeto, texto: () => ({ tipo: "texto", texto: "Consolidado sin cifras." }) }),
      planificarConModelo: true,
      modeloDePaso: (paso, salidas) => modeloSimuladoDePaso(paso, salidas, "es"),
    });

  it("usa el plan valido del modelo restringido a los 12 agentes", async () => {
    const env = conModelo(() => planModelo(["rentas", "cartera", "coactiva", "director"]));
    const { eventos } = await env.correr();
    expect(deTipo(eventos, "plan_creado")[0]?.detalle).toMatchObject({ respaldo: false, cadena: ["rentas", "cartera", "coactiva", "director"] });
    expect(deTipo(eventos, "traspaso")).toHaveLength(3);
    expect(eventos.at(-1)?.detalle?.estado).toBe("completada");
  });

  it.each([
    ["esquema invalido", () => ({ tareas: "no es una lista" }), "plan_invalido_esquema"],
    ["rol fuera de los 12 agentes", () => planModelo(["cartera", "hacker", "director"]), "plan_invalido_esquema"],
    ["no termina en el Director", () => planModelo(["rentas", "cartera"]), "plan_invalido"],
    ["criterios no ejecutables", () => ({ tareas: [{ ...planModelo(["director"]).tareas[0], criterios: ["bonito"] }] }), "plan_invalido"],
    [
      "dependencias no lineales",
      () => ({ tareas: planModelo(["cartera", "director"]).tareas.map((t) => ({ ...t, deps: [] })) }),
      "plan_invalido",
    ],
  ])("plan de respaldo cuando el modelo devuelve un plan invalido: %s", async (_caso, objeto, motivo) => {
    const env = conModelo(objeto);
    const { eventos } = await env.correr();
    const plan = deTipo(eventos, "plan_creado")[0];
    expect(plan?.detalle).toMatchObject({ respaldo: true, motivoRespaldo: motivo, cadena: ["rentas", "cartera", "coactiva", "director"] });
    expect(plan?.titulo).toContain("respaldo");
    expect(await env.acciones()).toEqual(expect.arrayContaining(["operacion.plan_rechazado", "operacion.plan_respaldo"]));
    expect(eventos.at(-1)?.detalle?.estado).toBe("completada");
  });

  it("un traspaso a un agente no colaborador se rechaza, se audita y se usa el plan de respaldo", async () => {
    // rentas solo colabora con cartera y coactiva.
    const env = conModelo(() => planModelo(["rentas", "director"]));
    const { eventos } = await env.correr();
    const rechazo = deTipo(eventos, "error").find((e) => e.detalle?.codigo === "traspaso_no_permitido");
    expect(rechazo?.detalle).toMatchObject({ desde: "rentas", hacia: "director", origen: "plan_director" });
    const auditoria = (await env.auditoria.listar(ORG_A)).find((e) => e.accion === "operacion.traspaso_rechazado");
    expect(auditoria?.despues).toMatchObject({ desde: "rentas", hacia: "director" });
    expect(deTipo(eventos, "plan_creado")[0]?.detalle).toMatchObject({ respaldo: true, motivoRespaldo: "traspaso_no_permitido" });
    expect(deTipo(eventos, "traspaso").some((t) => t.agenteId === "rentas" && t.haciaAgenteId === "director")).toBe(false);
  });

  it("exigirTraspaso rechaza y audita fuera del grafo, y permite a los colaboradores", async () => {
    const env = montarOperaciones({ programar: () => {} });
    const { operacionId } = await env.servicio.encargar("Arqueo de caja", "es", CTX_A);
    const registro = { orgId: ORG_A, operacionId, idioma: "es" as const };
    await expect(env.servicio.exigirTraspaso(registro, "cartera", "coactiva", "ejecucion")).resolves.toBeUndefined();
    await expect(env.servicio.exigirTraspaso(registro, "cajero-mayor", "director", "ejecucion")).rejects.toBeInstanceOf(
      TraspasoNoPermitidoError,
    );
    await expect(env.servicio.exigirTraspaso(registro, "director", "director", "ejecucion")).rejects.toBeInstanceOf(
      TraspasoNoPermitidoError,
    );
    const rechazos = (await env.auditoria.listar(ORG_A)).filter((e) => e.accion === "operacion.traspaso_rechazado");
    expect(rechazos).toHaveLength(2);
    const eventos = await env.publicador.listar(ORG_A, operacionId);
    expect(eventos.map((e) => e.secuencia)).toEqual([1, 2, 3]);
  });

  it("con datos reales y modelo en la nube, la politica de datos falla la operacion sin llamar al modelo", async () => {
    class ModeloNube extends ModeloSimulado {
      override readonly alojamiento = "nube" as const;
    }
    const modelo = new ModeloNube({ objeto: () => planModelo(["cartera", "director"]) });
    const env = montarOperaciones({ modelo, fuente: { ...fuenteSintetica(), tipo: "real" }, planificarConModelo: true });
    const { eventos } = await env.correr();
    expect(modelo.llamadasObjeto).toBe(0);
    expect(modelo.llamadasTexto).toBe(0);
    expect(deTipo(eventos, "error")[0]?.detalle?.codigo).toBe("modelo_no_permitido");
    expect(eventos.at(-1)?.detalle?.estado).toBe("fallida");
    expect(await env.acciones()).toContain("modelo.rechazado_politica_datos");
  });

  it("respeta los topes de presupuesto: una pausa corta la operacion como fallida", async () => {
    const env = montarOperaciones({ topeAgenteTokens: 1 });
    const { eventos } = await env.correr();
    const pausa = deTipo(eventos, "error")[0];
    expect(pausa?.detalle?.codigo).toBe("presupuesto_pausado");
    expect(eventos.at(-1)?.detalle).toMatchObject({ estado: "fallida", motivo: "presupuesto_pausado" });
    expect(deTipo(eventos, "operacion_finalizada")).toHaveLength(1);
  });
});

describe("operaciones: aislamiento entre organizaciones", { timeout: LENTO }, () => {
  it("otra organizacion no lista, no recibe en vivo ni obtiene la instantanea", async () => {
    let trabajo: (() => Promise<void>) | null = null;
    const env = montarOperaciones({ programar: (t) => (trabajo = t) });
    const { operacionId } = await env.servicio.encargar(ENCARGO_CARTERA, "es", CTX_A);
    const recibidosB: unknown[] = [];
    const recibidosA: unknown[] = [];
    const cancelarB = env.publicador.suscribir(ORG_B, operacionId, (e) => recibidosB.push(e));
    const cancelarA = env.publicador.suscribir(ORG_A, operacionId, (e) => recibidosA.push(e));
    await (trabajo as unknown as () => Promise<void>)();
    cancelarA();
    cancelarB();
    expect(recibidosA.length).toBeGreaterThan(10);
    expect(recibidosB).toEqual([]);
    expect(await env.publicador.listar(ORG_B, operacionId)).toEqual([]);
    expect(await env.servicio.obtenerInstantanea(ORG_B, operacionId)).toBeNull();
    expect(await env.servicio.obtenerRegistro(ORG_B, operacionId)).toBeNull();
    expect((await env.auditoria.listar(ORG_B)).filter((e) => e.accion.startsWith("operacion."))).toEqual([]);
    expect(env.publicador.suscriptoresActivos()).toBe(0);
  });

  it("operaciones concurrentes de dos organizaciones mantienen secuencias propias", async () => {
    const env = montarOperaciones();
    const [a, b] = await Promise.all([env.correr(ENCARGO_CARTERA, "es", CTX_A), env.correr("Review the budget execution", "en", CTX_B)]);
    for (const r of [a, b]) expect(r.eventos.map((e) => e.secuencia)).toEqual(r.eventos.map((_, i) => i + 1));
    expect(a.eventos.every((e) => e.orgId === ORG_A)).toBe(true);
    expect(b.eventos.every((e) => e.orgId === ORG_B)).toBe(true);
    expect(b.eventos[0]?.titulo).toBe("Operation requested");
    expect(deTipo(b.eventos, "plan_creado")[0]?.detalle?.cadena).toEqual(["presupuestista", "director"]);
  });
});
