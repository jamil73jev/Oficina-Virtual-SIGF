import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConexionOperacion,
  cargarEntregableOperacion,
  cargarEventoOperacion,
  ResultadosOperacion,
  aplicarEvento,
  estadoInicialOperacion,
  estadosAgentes,
  entregableDeEventos,
  mensajesOperaciones,
  tablasDeEventos,
  ultimoTraspaso,
  type EventSourceOperacion,
} from "@/modules/operaciones-ui";
import type { EventoTraza, InstantaneaOperacion } from "@/orchestration/traza/eventos";

const OPERACION = "00000000-0000-4000-8000-000000000001";
const ORG = "org-prueba";
const evento = (secuencia: number, extra: Partial<EventoTraza> = {}): EventoTraza => ({
  id: `00000000-0000-4000-8000-${String(secuencia).padStart(12, "0")}`,
  orgId: ORG,
  operacionId: OPERACION,
  secuencia,
  ts: `2026-09-28T12:00:${String(secuencia).padStart(2, "0")}.000Z`,
  tipo: "agente_inicia",
  agenteId: "director",
  titulo: `Evento ${secuencia}`,
  ...extra,
});
const instantanea = (eventos: EventoTraza[]): InstantaneaOperacion => ({
  operacionId: OPERACION, texto: "Tarea sintética", idioma: "es", estado: "en_curso", creadaEn: "2026-09-28T12:00:00.000Z", eventos,
});

class FuenteFalsa implements EventSourceOperacion {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  cerrada = false;
  private listeners = new Map<string, (evento: MessageEvent<string>) => void>();
  addEventListener(tipo: string, listener: (evento: MessageEvent<string>) => void) { this.listeners.set(tipo, listener); }
  emitir(valor: EventoTraza) { this.listeners.get("traza")?.({ data: JSON.stringify(valor) } as MessageEvent<string>); }
  close() { this.cerrada = true; }
}

describe("estado visual de operaciones", () => {
  it("pasa un agente de inactivo a trabajando y completado, y resalta el traspaso correcto", () => {
    expect(estadosAgentes([]).director).toBe("inactivo");
    const inicio = evento(1);
    expect(estadosAgentes([inicio]).director).toBe("trabajando");
    const traspaso = evento(2, { tipo: "traspaso", haciaAgenteId: "cartera", estado: "completado" });
    expect(estadosAgentes([inicio, traspaso]).director).toBe("completado");
    expect(ultimoTraspaso([inicio, traspaso])).toMatchObject({ agenteId: "director", haciaAgenteId: "cartera" });
  });

  it("ignora eventos duplicados por secuencia", () => {
    const primero = aplicarEvento(estadoInicialOperacion, evento(1));
    const duplicado = aplicarEvento(primero, evento(1, { titulo: "Duplicado" }));
    expect(duplicado.eventos).toHaveLength(1);
    expect(duplicado.eventos[0]?.titulo).toBe("Evento 1");
  });
});

describe("conexion SSE de operaciones", () => {
  it("reanuda con el ultimo id y usa la instantanea como respaldo cada 3 segundos", async () => {
    const fuentes: Array<{ ultimo: string | null; fuente: FuenteFalsa }> = [];
    const tareas: Array<{ ms: number; fn: () => void }> = [];
    const respuestas = [instantanea([evento(1)]), instantanea([evento(1), evento(2, { agenteId: "cartera" }), evento(3, { agenteId: "datos" })])];
    const conexion = new ConexionOperacion(OPERACION, () => undefined, {
      fetcher: async () => Response.json(respuestas.shift() ?? instantanea([])),
      crearEventSource: (_url, ultimo) => { const fuente = new FuenteFalsa(); fuentes.push({ ultimo, fuente }); return fuente; },
      programar: (fn, ms) => { tareas.push({ fn, ms }); return tareas.length as unknown as ReturnType<typeof setTimeout>; },
      cancelar: () => undefined,
    });
    await conexion.iniciar();
    fuentes[0]!.fuente.emitir(evento(2, { agenteId: "cartera" }));
    fuentes[0]!.fuente.emitir(evento(2, { agenteId: "cartera", titulo: "duplicado" }));
    expect(conexion.obtenerVista().eventos).toHaveLength(2);
    fuentes[0]!.fuente.onerror?.();
    tareas.find((tarea) => tarea.ms === 3_000)!.fn();
    await new Promise((resolver) => setTimeout(resolver, 0));
    expect(conexion.obtenerVista().eventos.map((item) => item.secuencia)).toEqual([1, 2, 3]);
    tareas.find((tarea) => tarea.ms === 1_000)!.fn();
    expect(fuentes[1]?.ultimo).toBe("3");
    conexion.detener();
  });
});

describe("resultados de operaciones", () => {
  const tabla = {
    titulo: "Cartera exacta", columnas: [{ clave: "saldo", etiqueta: "Saldo" }],
    filas: [{ celdas: [{ columna: "saldo", texto: "31.032,78", valorExacto: 31032.78 }] }],
    fuente: "rentas", formula: "SUM(saldo)", filtros: ["corte vigente"], corte: "2026-08-31",
  };
  const eventos = [
    evento(1, { tipo: "tabla", detalle: { tabla } }),
    evento(2, { tipo: "entregable", detalle: { markdown: "# Entregable exacto\nSaldo validado." } }),
  ];

  it("extrae y muestra una tabla y el entregable con sus datos exactos", () => {
    expect(tablasDeEventos(eventos)[0]?.filas[0]?.celdas[0]?.valorExacto).toBe(31032.78);
    expect(entregableDeEventos(eventos)).toBe("# Entregable exacto\nSaldo validado.");
    const html = renderToStaticMarkup(React.createElement(ResultadosOperacion, { eventos, idioma: "es" }));
    expect(html).toContain("31.032,78");
    expect(html).toContain("SUM(saldo)");
    expect(html).toContain("Ver entregable");
    expect(html).not.toContain("Saldo validado.");
  });

  it("mantiene las mismas claves en ES y EN", () => {
    expect(Object.keys(mensajesOperaciones.es).sort()).toEqual(Object.keys(mensajesOperaciones.en).sort());
  });

  it("presenta carga perezosa accesible y propaga errores de red", async () => {
    const ligera = evento(4, {
      tipo: "tabla",
      detalle: { ligero: true, referencia: `/api/operaciones/${OPERACION}/eventos/4`, tablas: [{ titulo: "Cartera", filasVisibles: 200, filasTotales: 1500 }] },
    });
    const entregaLigera = evento(5, { tipo: "entregable", detalle: { ligero: true, referencia: `/api/operaciones/${OPERACION}/entregable`, tamanoBytes: 1234, lineas: 20 } });
    const html = renderToStaticMarkup(React.createElement(ResultadosOperacion, { eventos: [ligera, entregaLigera], idioma: "es", operacionId: OPERACION }));
    expect(html).toContain("Cargando detalle de tablas");
    expect(html).toContain('role="status"');
    expect(html).toContain("Ver entregable");
    const falla = async () => new Response("", { status: 503 });
    await expect(cargarEventoOperacion(OPERACION, 4, falla)).rejects.toThrow("evento_503");
    await expect(cargarEntregableOperacion(OPERACION, falla)).rejects.toThrow("entregable_503");
  });

  it("muestra junto al comentario cada cifra no verificada", () => {
    const comentario = evento(3, {
      tipo: "comentario",
      detalle: { comentario: "Resumen sin cifras.", cifrasNoVerificadas: [{ texto: "65,55%" }, { texto: "92,4%" }] },
    });
    const html = renderToStaticMarkup(React.createElement(ResultadosOperacion, { eventos: [comentario], idioma: "es" }));
    expect(html).toContain("Cifras no verificadas");
    expect(html).toContain("65,55%");
    expect(html).toContain("92,4%");
    expect(html).toContain('role="alert"');
  });
});
