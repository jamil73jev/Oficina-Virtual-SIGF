import { describe, expect, it } from "vitest";
import { orquestar, type EntradaOrquestador } from "../orchestrator";
import type { SolicitudEjecucion } from "../runtime";
import { PresupuestoPausadoError } from "../runtime/agent-runtime";
import {
  agente,
  crearEntorno,
  ID_ANALISTA,
  ID_ORQ,
  ORG,
  PROYECTO,
  TEXTO_INYECCION,
} from "./fixtures";

const PLAN_2 = {
  tareas: [
    {
      clave: "a",
      titulo: "Investigar",
      descripcion: "Investigar el mercado",
      rol: "analista",
      criterios: ["seccion:Hallazgos", "longitud_min:20"],
      deps: [],
    },
    {
      clave: "b",
      titulo: "Resumir",
      descripcion: "Resumir hallazgos",
      rol: "analista",
      criterios: ["contiene:conclusion"],
      deps: ["a"],
    },
  ],
};

const entrada = (analista = agente(ID_ANALISTA, "analista", { skills: ["analista"] })): EntradaOrquestador => ({
  orgId: ORG,
  proyectoId: PROYECTO,
  objetivo: "Estudiar el mercado",
  orquestador: agente(ID_ORQ, "pm", { skills: ["pm"] }),
  agentes: [analista],
});

describe("eval: flujo completo objetivo -> tareas -> ejecucion -> aprobacion -> artefacto", () => {
  it("planifica, ejecuta con aprobacion de accion irreversible y deja artefactos verificados", async () => {
    const env = crearEntorno({
      guion: {
        objeto: () => PLAN_2,
        texto: (p) => {
          const usuario = p.mensajes[0]?.contenido ?? "";
          const yaEnvio = p.mensajes.some((m) => m.rol === "herramienta");
          if (usuario.includes("Investigar") && !yaEnvio) {
            return { tipo: "llamada_herramienta", nombre: "enviar_correo", args: { para: "jefe@x.com" } };
          }
          return {
            tipo: "texto",
            texto: usuario.includes("Investigar")
              ? "## Hallazgos\nEl mercado crece un 10% anual."
              : "Esta es la conclusion final del estudio.",
          };
        },
      },
    });
    const analista = agente(ID_ANALISTA, "analista", {
      skills: ["analista"],
      herramientasPermitidas: ["enviar_correo"],
    });

    const r = await orquestar(env.deps, entrada(analista));

    expect(r.estado).toBe("completado");
    expect(r.tareas.map((t) => t.estado)).toEqual(["completada", "completada"]);
    // Aprobacion solicitada una vez, antes de ejecutar el efecto.
    expect(env.aprobacion.pedidos).toHaveLength(1);
    expect(env.aprobacion.pedidos[0]).toMatchObject({ tipo: "herramienta:enviar_correo", riesgo: "irreversible", orgId: ORG });
    expect(env.efectos).toEqual(["correo:jefe@x.com"]);
    // Artefactos por referencia, legibles solo dentro de la org.
    const ref = r.tareas[0]?.documentoRef as string;
    expect(await env.almacen.leer(ORG, ref)).toContain("## Hallazgos");
    expect(await env.almacen.leer("otra-org", ref)).toBeNull();
    // Auditoria encadenada e integra.
    expect((await env.auditor.verificar(ORG)).valida).toBe(true);
    const acciones = (await env.auditor.listar(ORG)).map((e) => e.accion);
    expect(acciones).toEqual(
      expect.arrayContaining(["orquestador.plan_creado", "aprobacion.solicitada", "aprobacion.decidida", "herramienta.ejecutada", "qa.verificada"]),
    );
    // Tareas persistidas.
    expect(await env.repo.listarPorProyecto(ORG, PROYECTO)).toHaveLength(2);
  });

  it("subagente con contexto aislado: no ve el objetivo global ni otras tareas; solo referencias", async () => {
    const env = crearEntorno({ guion: { objeto: () => PLAN_2, texto: () => ({ tipo: "texto", texto: "## Hallazgos\nconclusion larga larga" }) } });
    const r = await orquestar(env.deps, entrada());
    expect(r.estado).toBe("completado");
    const segunda = env.modelo.peticiones[1]?.mensajes[0]?.contenido ?? "";
    expect(segunda).not.toContain("Estudiar el mercado");
    expect(segunda).not.toContain("Investigar el mercado");
    expect(segunda).toContain("artefacto://"); // referencia, no contenido
    expect(segunda).not.toContain("## Hallazgos");
    expect(r.tareas[0]?.resumen?.length).toBeLessThanOrEqual(203);
  });

  it("plan invalido (criterio no ejecutable o ciclo) se rechaza", async () => {
    const malo = { tareas: [{ ...PLAN_2.tareas[0], criterios: ["que quede bonito"] }] };
    await expect(orquestar(crearEntorno({ guion: { objeto: () => malo } }).deps, entrada())).rejects.toThrow(/criterio no ejecutable/);
    const ciclo = { tareas: [{ ...PLAN_2.tareas[0], deps: ["b"] }, { ...PLAN_2.tareas[1] }] };
    await expect(orquestar(crearEntorno({ guion: { objeto: () => ciclo } }).deps, entrada())).rejects.toThrow(/ciclo/);
  });
});

describe("eval: QA determinista", () => {
  it("reintenta de forma acotada y luego escala al humano sin completar", async () => {
    const env = crearEntorno({
      maxReintentosQA: 1,
      guion: { objeto: () => ({ tareas: [PLAN_2.tareas[0]] }), texto: () => ({ tipo: "texto", texto: "sin seccion pero largo suficiente" }) },
    });
    const r = await orquestar(env.deps, entrada());
    expect(r.estado).toBe("escalado_humano");
    expect(r.tareas[0]).toMatchObject({ estado: "bloqueada", intentos: 2, fallosQA: ["seccion:Hallazgos"] });
    expect(env.modelo.llamadasTexto).toBe(2);
    const acciones = (await env.auditor.listar(ORG)).map((e) => e.accion);
    expect(acciones).toContain("qa.escalada_humano");
  });

  it("un reintento con feedback puede corregir y completar", async () => {
    const env = crearEntorno({
      guion: {
        objeto: () => ({ tareas: [PLAN_2.tareas[0]] }),
        texto: (p, n) => ({
          tipo: "texto",
          texto: n === 0 ? "texto sin seccion, largo suficiente" : `## Hallazgos\n${p.mensajes[0]?.contenido.includes("qa_fallo:") ? "corregido ok" : "sin feedback"} y algo mas`,
        }),
      },
    });
    const r = await orquestar(env.deps, entrada());
    expect(r.estado).toBe("completado");
    expect(r.tareas[0]?.intentos).toBe(2);
  });
});

describe("eval: tope de presupuesto que pausa", () => {
  it("pausa la orquestacion, no ejecuta la llamada y deja solicitud de ampliacion", async () => {
    const env = crearEntorno({ topeTokens: 100, guion: { objeto: () => PLAN_2 } });
    const r = await orquestar(env.deps, entrada());
    expect(r.estado).toBe("pausado_presupuesto");
    expect(r.solicitudAmpliacionId).toBeTruthy();
    expect(env.modelo.llamadasTexto).toBe(0);
    expect(env.repoPresupuesto.solicitudesDe(ORG)).toHaveLength(1);
    expect(env.repoPresupuesto.leer(ORG, { ambito: "agente", refId: ID_ANALISTA })?.consumido.tokens).toBe(0);
    expect((await env.repo.listarPorProyecto(ORG, PROYECTO)).every((t) => t.estado !== "completada")).toBe(true);
  });

  it("el runtime lanza PresupuestoPausadoError directamente", async () => {
    const env = crearEntorno({ topeTokens: 10 });
    const tareas = await (async () => {
      const t = { id: "00000000-0000-4000-8000-0000000000c1", orgId: ORG, proyectoId: PROYECTO, padreId: null, agenteId: ID_ANALISTA, estado: "asignada" as const, criteriosVerificacion: ["longitud_min:1"], deps: [], titulo: "t", descripcion: "d", rolAgente: "analista" };
      return t;
    })();
    const sol: SolicitudEjecucion = { orgId: ORG, agente: agente(ID_ANALISTA, "analista"), tarea: tareas, referencias: [], profundidad: 1 };
    await expect(env.runtime.ejecutar(sol)).rejects.toBeInstanceOf(PresupuestoPausadoError);
  });
});

describe("eval: herramientas, riesgo y permisos", () => {
  const base = { id: "00000000-0000-4000-8000-0000000000c2", orgId: ORG, proyectoId: PROYECTO, padreId: null, agenteId: ID_ANALISTA, estado: "asignada" as const, criteriosVerificacion: ["longitud_min:1"], deps: [], titulo: "t", descripcion: "d", rolAgente: "analista" };
  const correr = (env: ReturnType<typeof crearEntorno>, permitidas: string[]) =>
    env.runtime.ejecutar({ orgId: ORG, agente: agente(ID_ANALISTA, "analista", { herramientasPermitidas: permitidas }), tarea: base, referencias: [], profundidad: 1 });
  const llamarCorreoLuegoTexto = {
    texto: (p: { mensajes: { rol: string }[] }) =>
      p.mensajes.some((m) => m.rol === "herramienta")
        ? { tipo: "texto" as const, texto: "listo" }
        : { tipo: "llamada_herramienta" as const, nombre: "enviar_correo", args: { para: "x@x.com" } },
  };

  it("herramienta irreversible rechazada o expirada: no se ejecuta", async () => {
    for (const decision of ["rechazada", "expirada"] as const) {
      const env = crearEntorno({ decision, guion: llamarCorreoLuegoTexto });
      await correr(env, ["enviar_correo"]);
      expect(env.efectos).toEqual([]);
      expect(env.aprobacion.pedidos).toHaveLength(1);
      const ultimo = env.modelo.peticiones.at(-1)?.mensajes.at(-1)?.contenido ?? "";
      expect(ultimo).toContain(decision);
    }
  });

  it("herramienta no permitida al agente se deniega sin pedir aprobacion", async () => {
    const env = crearEntorno({ guion: llamarCorreoLuegoTexto });
    await correr(env, ["leer_web"]);
    expect(env.efectos).toEqual([]);
    expect(env.aprobacion.pedidos).toHaveLength(0);
    expect((await env.auditor.listar(ORG)).map((e) => e.accion)).toContain("herramienta.denegada");
  });

  it("escritura reversible se ejecuta sin aprobacion; argumentos invalidos dan error", async () => {
    let paso = 0;
    const env = crearEntorno({
      guion: {
        texto: () => {
          paso++;
          if (paso === 1) return { tipo: "llamada_herramienta", nombre: "guardar_nota", args: { texto: "hola" } };
          if (paso === 2) return { tipo: "llamada_herramienta", nombre: "guardar_nota", args: { texto: 5 } };
          return { tipo: "texto", texto: "fin" };
        },
      },
    });
    await correr(env, ["guardar_nota"]);
    expect(env.efectos).toEqual(["nota:hola"]);
    expect(env.aprobacion.pedidos).toHaveLength(0);
  });

  it("prompt injection en salida de herramienta se trata como dato y no otorga acciones", async () => {
    let paso = 0;
    const env = crearEntorno({
      decision: "rechazada",
      guion: {
        texto: (p) => {
          paso++;
          if (paso === 1) return { tipo: "llamada_herramienta", nombre: "leer_web", args: { url: "http://x" } };
          // Modelo "comprometido": obedece la inyeccion e intenta el correo.
          if (paso === 2) return { tipo: "llamada_herramienta", nombre: "enviar_correo", args: { para: "atacante@x.com" } };
          void p;
          return { tipo: "texto", texto: "hecho" };
        },
      },
    });
    await correr(env, ["leer_web"]); // enviar_correo NO esta permitido
    const toolMsg = env.modelo.peticiones[1]?.mensajes.find((m) => m.rol === "herramienta");
    expect(toolMsg?.contenido).toContain('<datos_herramienta nombre="leer_web" confiable="false">');
    expect(toolMsg?.contenido).toContain(TEXTO_INYECCION);
    expect(env.modelo.peticiones[1]?.sistema).not.toContain("IGNORA");
    expect(env.efectos).toEqual([]);
    expect(env.aprobacion.pedidos).toHaveLength(0);
    const auditoria = await env.auditor.listar(ORG);
    const ej = auditoria.find((e) => e.accion === "herramienta.ejecutada");
    expect(ej?.despues).toMatchObject({ sospechosa: true });
    expect(auditoria.map((e) => e.accion)).toContain("herramienta.denegada");
  });

  it("aunque el agente tenga el permiso, la accion irreversible inducida exige aprobacion humana", async () => {
    let paso = 0;
    const env = crearEntorno({
      decision: "rechazada",
      guion: {
        texto: () => {
          paso++;
          if (paso === 1) return { tipo: "llamada_herramienta", nombre: "leer_web", args: { url: "u" } };
          if (paso === 2) return { tipo: "llamada_herramienta", nombre: "enviar_correo", args: { para: "atacante@x.com" } };
          return { tipo: "texto", texto: "hecho" };
        },
      },
    });
    await correr(env, ["leer_web", "enviar_correo"]);
    expect(env.aprobacion.pedidos).toHaveLength(1);
    expect(env.efectos).toEqual([]);
  });
});
