import { describe, expect, it } from "vitest";
import type { ContextoAcceso } from "@/core/rbac";
import { AGENTES_AREA, crearRegistroFinanzas, fuenteSintetica, SEMILLA_SINTETICA } from "@/modules/agentes-area";
import {
  bloquesRespuesta,
  crearManejadorDemoAgente,
  etiquetaDeRuta,
  extraerSalida,
  formatearCifra,
  formatearCorte,
  limpiarRespuesta,
  mensajesAgentes,
  type LocaleAgentes,
} from "@/modules/agentes-ui";
import { LLAMADAS_DEMO } from "@/modules/agentes-ui/demo";
import { corteDe, generarDatosSinteticos, recaudacionNeta } from "@/modules/finanzas";

const ORG = "00000000-0000-4000-8000-000000000001";
const PROYECTO = "00000000-0000-4000-8000-0000000000a1";
const admin: ContextoAcceso = { usuarioId: "usuario", orgId: ORG, rol: "admin" };

const request = (id = "control-estadistica", cuerpo: Record<string, unknown> = {}) =>
  new Request(`http://local/api/agents/${id}/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proyectoId: PROYECTO, pregunta: "Informe del corte", ...cuerpo }),
  });

interface CuerpoDemo {
  resultado: {
    estado: string;
    respuesta: string;
    uso: { tokens: number };
    verificacionCifras: { verificadas: number; noVerificadas: number };
    comentario: string;
    tablas: Array<{ ruta: string; fuente: string; formula: string; filtros: string[]; filas: unknown[] }>;
  };
}

async function demo(id: string, locale?: LocaleAgentes) {
  const respuesta = await crearManejadorDemoAgente({ identidad: () => admin })(request(id, locale ? { locale } : {}), id);
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as CuerpoDemo };
}

describe("API de demo de agentes", () => {
  it("devuelve 401 sin identidad", async () => {
    const respuesta = await crearManejadorDemoAgente({ identidad: () => null })(request(), "control-estadistica");
    expect(respuesta.status).toBe(401);
  });

  it("devuelve 403 sin permiso de ejecucion", async () => {
    const respuesta = await crearManejadorDemoAgente({
      identidad: () => ({ ...admin, rol: "viewer" }),
    })(request(), "control-estadistica");
    expect(respuesta.status).toBe(403);
  });

  it.each(["inexistente", "constructor", "to-string"])("devuelve 404 para un agente inexistente (%s)", async (id) => {
    const respuesta = await crearManejadorDemoAgente({ identidad: () => admin })(request(id), id);
    expect(respuesta.status).toBe(404);
  });

  it("rechaza un locale no soportado", async () => {
    const respuesta = await crearManejadorDemoAgente({ identidad: () => admin })(request("datos", { locale: "fr" }), "datos");
    expect(respuesta.status).toBe(400);
  });

  it("devuelve 200 y las mismas cifras que la calculadora directa, legibles", async () => {
    const { status, cuerpo } = await demo("control-estadistica");
    expect(status).toBe(200);
    const datos = generarDatosSinteticos({ semilla: SEMILLA_SINTETICA });
    const directo = recaudacionNeta({
      corte: corteDe(datos, "tesoreria"),
      pagos: datos.pagos,
      reversos: datos.reversos,
    });
    expect(cuerpo.resultado.estado).toBe("completado");
    expect(cuerpo.resultado.tablas.length).toBeGreaterThan(0);
    expect(cuerpo.resultado.tablas[0]?.filas).toBeDefined();
    expect(cuerpo.resultado.respuesta).toContain(formatearCifra(directo.valor.neto, "es"));
    expect(cuerpo.resultado.respuesta).toContain(`- Fuente: ${directo.fuente}`);
    expect(cuerpo.resultado.respuesta).toContain(`- Fórmula: ${directo.formula}`);
    expect(cuerpo.resultado.respuesta).toContain(`- Filtros: ${directo.filtros.join("; ")}`);
    expect(cuerpo.resultado.tablas[0]).toMatchObject({ fuente: directo.fuente, formula: directo.formula, filtros: directo.filtros });
    expect(cuerpo.resultado.respuesta).not.toContain("datos_herramienta");
    expect(cuerpo.resultado.respuesta).not.toContain('"neto"');
    expect(cuerpo.resultado.uso.tokens).toBeGreaterThan(0);
    expect(cuerpo.resultado.verificacionCifras.noVerificadas).toBe(0);
  });

  it.each(AGENTES_AREA.map((a) => a.id))("demo de %s: 200 con cifras, fuente, formula, filtros y corte de una herramienta permitida", async (id) => {
    const llamada = LLAMADAS_DEMO[id];
    const agente = AGENTES_AREA.find((a) => a.id === id);
    expect(agente?.herramientasPermitidas).toContain(llamada.nombre);

    const { status, cuerpo } = await demo(id);
    expect(status).toBe(200);
    expect(cuerpo.resultado.estado).toBe("completado");
    const texto = cuerpo.resultado.respuesta;
    expect(texto).not.toMatch(/datos_herramienta|confiable=|\{"/);

    // La demo siempre entrega tablas deterministas con procedencia para su herramienta.
    const r = await crearRegistroFinanzas(fuenteSintetica())
      .obtener(llamada.nombre)
      ?.invocar(llamada.args, { orgId: ORG, agenteId: "a", tareaId: "t" });
    if (!r?.ok) throw new Error("invocacion directa fallida");
    const salida = r.salida as { fuente: string; formula: string; filtros: string[]; corte: unknown; valor: unknown };
    expect(cuerpo.resultado.tablas.length).toBeGreaterThan(0);
    expect(cuerpo.resultado.tablas.every((tabla) => tabla.fuente === salida.fuente)).toBe(true);
    expect(cuerpo.resultado.tablas.every((tabla) => tabla.formula === salida.formula)).toBe(true);
    expect(cuerpo.resultado.tablas.every((tabla) => tabla.filtros.join(";") === salida.filtros.join(";"))).toBe(true);
    expect(texto).toContain(`- Fuente: ${salida.fuente}`);
    expect(texto).toContain(llamada.nombre);
  });

  it("presenta la demo en ingles cuando se pide locale en", async () => {
    const { status, cuerpo } = await demo("tesorero", "en");
    expect(status).toBe(200);
    const t = mensajesAgentes.en;
    for (const clave of [t.resumenEjecutivo, t.comentarioModelo, t.fuente, t.formula, t.filtros, t.corte]) {
      expect(cuerpo.resultado.respuesta).toContain(clave);
    }
  });
});

describe("presentacion de la respuesta", () => {
  const sobre = '<datos_herramienta nombre="x" confiable="false">\n{"fuente":"f","valor":{"a":1}}\n</datos_herramienta>';

  it("extrae la salida del sobre y rechaza contenido que no lo es", () => {
    expect(extraerSalida(sobre)).toEqual({ fuente: "f", valor: { a: 1 } });
    expect(extraerSalida("texto libre")).toBeNull();
    expect(extraerSalida('<datos_herramienta nombre="x" confiable="false">\nno-json\n</datos_herramienta>')).toBeNull();
  });

  it("nunca muestra la etiqueta interna y arma bloques legibles", () => {
    expect(limpiarRespuesta(`antes ${sobre} despues`)).not.toContain("datos_herramienta");
    const bloques = bloquesRespuesta("## Cifras\n- neto: 1.234,5\n- sin etiqueta\n\nNota final\n<datos_herramienta>");
    expect(bloques).toEqual([
      { tipo: "titulo", texto: "Cifras" },
      { tipo: "lista", items: [{ etiqueta: "neto", texto: "1.234,5" }, { etiqueta: null, texto: "sin etiqueta" }] },
      { tipo: "parrafo", texto: "Nota final" },
    ]);
  });

  it("formatea cifras, rutas y cortes por idioma", () => {
    expect(etiquetaDeRuta("identificaciones.invalidas.cantidad")).toBe("identificaciones › invalidas › cantidad");
    expect(etiquetaDeRuta("reversosExtemporaneos")).toBe("reversos extemporaneos");
    expect(formatearCifra(1234.5, "en")).toBe("1,234.5");
    expect(formatearCifra(true, "es")).toBe("sí");
    expect(formatearCifra(null, "en")).toBe("not available");
    const corte = { fechaCorte: "2026-08-31T00:00:00.000Z", horaExtraccion: "23:59", periodo: "2026-08", fuente: "rentas" };
    expect(formatearCorte(corte, "es")).toBe("rentas 2026-08-31 23:59 (periodo 2026-08)");
    expect(formatearCorte([corte, { ...corte, fuente: "banco" }], "en")).toBe(
      "rentas 2026-08-31 23:59 (period 2026-08); banco 2026-08-31 23:59 (period 2026-08)",
    );
  });
});

describe("mensajes de agentes", () => {
  it("ES y EN tienen las mismas claves y ningun texto vacio", () => {
    expect(Object.keys(mensajesAgentes.es).sort()).toEqual(Object.keys(mensajesAgentes.en).sort());
    for (const locale of ["es", "en"] as const) {
      for (const [clave, texto] of Object.entries(mensajesAgentes[locale])) expect(texto.trim(), `${locale}.${clave}`).not.toBe("");
    }
    expect(mensajesAgentes.es.demoResumen).toContain("{herramienta}");
    expect(mensajesAgentes.en.demoResumen).toContain("{herramienta}");
  });
});
