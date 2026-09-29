import { z } from "zod";
import { describe, expect, it } from "vitest";
import { Auditor, AuditoriaMemoriaRepo, verificarCadena } from "@/core/audit";
import {
  AprobacionError,
  AprobacionesMemoriaRepo,
  ServicioAprobaciones,
} from "@/core/approvals";
import { crearSolicitarAprobacion } from "@/core/approvals/adaptador";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import type { ContextoAcceso } from "@/core/rbac";
import { sembrarPresupuestos } from "@/orchestration/evals/fixtures";
import { orquestar } from "@/orchestration/orchestrator";
import { AlmacenArtefactosMemoria, RepositorioTareasMemoria } from "@/orchestration/memoria";
import { RuntimeAgente } from "@/orchestration/runtime/agent-runtime";
import { ModeloSimulado } from "@/orchestration/runtime/modelo";
import { definirHerramienta, RegistroHerramientas } from "@/orchestration/tools";
import type { Agente } from "@/types";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTRA_ORG = "00000000-0000-4000-8000-000000000002";
const PROYECTO = "00000000-0000-4000-8000-0000000000a1";
const ID_ORQ = "00000000-0000-4000-8000-0000000000b0";
const ID_ANALISTA = "00000000-0000-4000-8000-0000000000b1";

const supervisor: ContextoAcceso = { usuarioId: "u-sup", orgId: ORG, rol: "supervisor" };
const owner: ContextoAcceso = { usuarioId: "u-own", orgId: ORG, rol: "owner" };
const viewer: ContextoAcceso = { usuarioId: "u-view", orgId: ORG, rol: "viewer" };
const externo: ContextoAcceso = { usuarioId: "u-ext", orgId: OTRA_ORG, rol: "owner" };

const agente = (id: string, rol: string, extra: Partial<Agente> = {}): Agente => ({
  id,
  orgId: ORG,
  rol,
  skills: [],
  herramientasPermitidas: [],
  modelo: "simulado",
  presupuestoId: null,
  estado: "activo",
  promptVersion: 1,
  ...extra,
});

const PLAN = {
  tareas: [
    {
      clave: "a",
      titulo: "Investigar",
      descripcion: "Investigar el mercado",
      rol: "analista",
      criterios: ["seccion:Hallazgos", "longitud_min:20"],
      deps: [],
    },
  ],
};

type Accion = "aprobar" | "rechazar" | "expirar";

function montar(opts: { topeAgenteTokens?: number } = {}) {
  let reloj = new Date("2026-01-01T00:00:00Z");
  const ahora = () => reloj;
  const auditor = new Auditor(new AuditoriaMemoriaRepo());
  const servicio = new ServicioAprobaciones(new AprobacionesMemoriaRepo(), auditor, { ahora });

  const repoPres = new PresupuestoMemoriaRepo();
  sembrarPresupuestos(repoPres, { topeTokensAnalista: opts.topeAgenteTokens });
  const presupuesto = new ServicioPresupuesto(repoPres, {}, ahora);

  // Acciones del "humano" durante la espera: se ejecutan en cada sondeo.
  let accion: Accion = "aprobar";
  let quien: ContextoAcceso = supervisor;
  const intentosFallidos: unknown[] = [];
  const dormir = async () => {
    if (accion === "expirar") {
      reloj = new Date(reloj.getTime() + 48 * 3600_000);
      return;
    }
    const [p] = await servicio.listarPendientes(ORG);
    if (!p) return;
    try {
      await servicio.decidir(p.id, accion === "aprobar" ? "aprobada" : "rechazada", quien);
    } catch (e) {
      intentosFallidos.push(e);
      // Tras el intento denegado, un supervisor legitimo rechaza para no colgar el flujo.
      await servicio.decidir(p.id, "rechazada", supervisor);
    }
  };
  const solicitarAprobacion = crearSolicitarAprobacion(servicio, { ahora, dormir, sondeoMs: 1 });

  const efectos: string[] = [];
  const herramientas = new RegistroHerramientas().registrar(
    definirHerramienta({
      nombre: "enviar_correo",
      descripcion: "Envia un correo (irreversible)",
      riesgo: "irreversible",
      entrada: z.object({ para: z.string() }),
      ejecutar: async ({ para }) => {
        efectos.push(`correo:${para}`);
        return "enviado";
      },
    }),
  );
  const modelo = new ModeloSimulado({
    objeto: () => PLAN,
    texto: (p) =>
      p.mensajes.some((m) => m.rol === "herramienta")
        ? { tipo: "texto", texto: "## Hallazgos\nEl mercado crece un 10% anual." }
        : { tipo: "llamada_herramienta", nombre: "enviar_correo", args: { para: "jefe@x.com" } },
  });
  const almacen = new AlmacenArtefactosMemoria();
  const repo = new RepositorioTareasMemoria();
  const runtime = new RuntimeAgente({ modelo, presupuesto, herramientas, almacen, auditor, solicitarAprobacion });
  const deps = { modelo, presupuesto, runtime, repo, almacen, auditor };

  const analista = agente(ID_ANALISTA, "analista", { skills: ["analista"], herramientasPermitidas: ["enviar_correo"] });
  const correr = () =>
    orquestar(deps, {
      orgId: ORG,
      proyectoId: PROYECTO,
      objetivo: "Estudiar el mercado",
      orquestador: agente(ID_ORQ, "pm", { skills: ["pm"] }),
      agentes: [analista],
    });

  return {
    servicio, auditor, repoPres, presupuesto, efectos, almacen, repo, correr, intentosFallidos,
    configurar(a: Accion, u: ContextoAcceso = supervisor) {
      accion = a;
      quien = u;
    },
  };
}

const idAprobacion = async (e: ReturnType<typeof montar>) => {
  const s = (await e.auditor.listar(ORG)).find((x) => x.accion === "aprobacion:solicitar");
  return (s?.despues as { id: string }).id;
};

describe("e2e: oficina virtual", () => {
  it("flujo feliz: tareas, aprobacion del supervisor, artefacto por referencia, costo y auditoria integra", async () => {
    const e = montar();
    e.configurar("aprobar");
    const r = await e.correr();

    expect(r.estado).toBe("completado");
    expect(await e.repo.listarPorProyecto(ORG, PROYECTO)).toHaveLength(1);
    expect(e.efectos).toEqual(["correo:jefe@x.com"]);

    const ap = await e.servicio.obtener(ORG, await idAprobacion(e));
    expect(ap).toMatchObject({ estado: "aprobada", decididoPor: "u-sup", riesgo: "irreversible" });
    const acciones = (await e.auditor.listar(ORG)).map((x) => x.accion);
    expect(acciones).toEqual(expect.arrayContaining(["aprobacion:solicitar", "aprobacion:aprobar", "herramienta.ejecutada"]));

    const ref = r.tareas[0]?.documentoRef as string;
    expect(ref).toMatch(/^artefacto:\/\//);
    expect(await e.almacen.leer(ORG, ref)).toContain("## Hallazgos");
    expect(await e.almacen.leer(OTRA_ORG, ref)).toBeNull();

    const ag = e.repoPres.leer(ORG, { ambito: "agente", refId: ID_ANALISTA });
    const pr = e.repoPres.leer(ORG, { ambito: "proyecto", refId: PROYECTO });
    expect(ag?.consumido.tokens).toBeGreaterThan(0);
    expect(ag?.consumido.costo).toBeGreaterThan(0);
    expect(ag?.consumido.iteraciones).toBe(2);
    expect(pr?.consumido.tokens).toBeGreaterThanOrEqual(ag?.consumido.tokens ?? 0);

    expect((await e.auditor.verificar(ORG)).valida).toBe(true);
    expect(verificarCadena(ORG, await e.auditor.listar(ORG)).valida).toBe(true);
  });

  it("aprobacion rechazada detiene la accion irreversible", async () => {
    const e = montar();
    e.configurar("rechazar");
    await e.correr();
    expect(e.efectos).toEqual([]);
    expect((await e.servicio.obtener(ORG, await idAprobacion(e)))?.estado).toBe("rechazada");
    expect((await e.auditor.verificar(ORG)).valida).toBe(true);
  });

  it("aprobacion expirada equivale a rechazo", async () => {
    const e = montar();
    e.configurar("expirar");
    await e.correr();
    expect(e.efectos).toEqual([]);
    expect((await e.servicio.obtener(ORG, await idAprobacion(e)))?.estado).toBe("expirada");
    const auditoria = await e.auditor.listar(ORG);
    expect(auditoria.map((x) => x.accion)).toContain("aprobacion:expirar");
    expect(auditoria.find((x) => x.accion === "aprobacion.decidida")?.despues).toMatchObject({ decision: "expirada" });
    await expect(e.servicio.decidir(await idAprobacion(e), "aprobada", supervisor)).rejects.toBeInstanceOf(AprobacionError);
    expect((await e.auditor.verificar(ORG)).valida).toBe(true);
  });

  it("tope de presupuesto pausa y genera solicitud de ampliacion; solo el owner la decide", async () => {
    const e = montar({ topeAgenteTokens: 100 });
    const r = await e.correr();
    expect(r.estado).toBe("pausado_presupuesto");
    expect(r.solicitudAmpliacionId).toBeTruthy();
    expect(e.efectos).toEqual([]);
    const sols = e.repoPres.solicitudesDe(ORG);
    expect(sols).toHaveLength(1);
    expect(sols[0]).toMatchObject({ tipo: "ampliacion_presupuesto", estado: "pendiente" });
    expect(e.repoPres.leer(ORG, { ambito: "agente", refId: ID_ANALISTA })?.consumido.tokens).toBe(0);

    const id = sols[0]!.id;
    await expect(e.presupuesto.decidirAmpliacion(supervisor, id, { aprobar: false })).rejects.toThrow();
    await expect(e.presupuesto.decidirAmpliacion(externo, id, { aprobar: false })).rejects.toThrow();
    const ok = await e.presupuesto.decidirAmpliacion(owner, id, {
      aprobar: true,
      nuevosTopes: { tokens: 100000, costo: 10, iteraciones: 100 },
    });
    expect(ok.estado).toBe("aprobada");
    expect((await e.auditor.verificar(ORG)).valida).toBe(true);
  });

  it("usuario de otra organizacion no puede decidir", async () => {
    const e = montar();
    e.configurar("aprobar", externo);
    await e.correr();
    expect(e.intentosFallidos).toHaveLength(1);
    expect((e.intentosFallidos[0] as AprobacionError).codigo).toBe("no_encontrada");
    expect(e.efectos).toEqual([]);
    expect((await e.servicio.obtener(ORG, await idAprobacion(e)))?.decididoPor).toBe("u-sup");
    expect(await e.auditor.listar(OTRA_ORG)).toHaveLength(0);
  });

  it("viewer no puede decidir y el intento queda auditado", async () => {
    const e = montar();
    e.configurar("aprobar", viewer);
    await e.correr();
    expect((e.intentosFallidos[0] as AprobacionError).codigo).toBe("rol_insuficiente");
    expect(e.efectos).toEqual([]);
    expect((await e.auditor.listar(ORG)).map((x) => x.accion)).toContain("aprobacion:decision_denegada");
    expect((await e.auditor.verificar(ORG)).valida).toBe(true);
  });
});
