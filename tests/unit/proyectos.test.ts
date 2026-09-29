import { describe, expect, it } from "vitest";
import { Auditor, AuditoriaMemoriaRepo, verificarCadena } from "@/core/audit";
import type { ProveedorIdentidad } from "@/core/approvals";
import type { ContextoAcceso } from "@/core/rbac";
import {
  ProyectoError,
  ProyectosMemoriaRepo,
  ServicioProyectos,
  crearManejadoresProyectos,
  crearaCiclo,
} from "@/modules/proyectos";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const ctx = (rol: ContextoAcceso["rol"], orgId = ORG_A): ContextoAcceso => ({
  usuarioId: `u-${rol}`,
  orgId,
  rol,
});

function montar() {
  let n = 0;
  const auditoria = new AuditoriaMemoriaRepo();
  const auditor = new Auditor(auditoria);
  const servicio = new ServicioProyectos(new ProyectosMemoriaRepo(), auditor, {
    nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  return { servicio, auditor, auditoria };
}

const codigo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ProyectoError) return e.codigo;
    throw e;
  }
  return null;
};

async function conProyecto() {
  const m = montar();
  const proyecto = await m.servicio.crearProyecto(ctx("supervisor"), { objetivo: "Informe Q1" });
  const tarea = (deps: string[] = []) =>
    m.servicio.crearTarea(ctx("supervisor"), {
      proyectoId: proyecto.id,
      criteriosVerificacion: ["Pruebas en verde"],
      deps,
    });
  return { ...m, proyecto, tarea };
}

describe("proyectos y tareas", () => {
  it("crea proyecto con objetivo y tarea con criterios", async () => {
    const { servicio, proyecto, tarea } = await conProyecto();
    expect(proyecto).toMatchObject({ orgId: ORG_A, objetivo: "Informe Q1", ownerId: "u-supervisor" });
    const t = await tarea();
    expect(t).toMatchObject({ estado: "pendiente", agenteId: null, criteriosVerificacion: ["Pruebas en verde"] });
    expect(await servicio.listarTareas(ctx("viewer"), proyecto.id)).toHaveLength(1);
  });

  it("rechaza objetivo vacio y tarea sin criterios", async () => {
    const { servicio, proyecto } = await conProyecto();
    expect(await codigo(servicio.crearProyecto(ctx("owner"), { objetivo: "  " }))).toBe("solicitud_invalida");
    expect(
      await codigo(
        servicio.crearTarea(ctx("owner"), { proyectoId: proyecto.id, criteriosVerificacion: [" "] }),
      ),
    ).toBe("solicitud_invalida");
  });

  it("asigna y mueve por el tablero respetando transiciones", async () => {
    const { servicio, tarea } = await conProyecto();
    const t = await tarea();
    // Sin agente no se puede pasar a en_curso.
    expect(await codigo(servicio.moverTarea(ctx("supervisor"), t.id, "en_curso"))).toBe("transicion_invalida");
    const asignada = await servicio.asignarTarea(ctx("supervisor"), t.id, "agente-1");
    expect(asignada).toMatchObject({ estado: "asignada", agenteId: "agente-1" });
    await servicio.moverTarea(ctx("supervisor"), t.id, "en_curso");
    await servicio.moverTarea(ctx("supervisor"), t.id, "en_verificacion");
    const fin = await servicio.moverTarea(ctx("supervisor"), t.id, "completada");
    expect(fin.estado).toBe("completada");
    // Estado terminal.
    expect(await codigo(servicio.moverTarea(ctx("supervisor"), t.id, "en_curso"))).toBe("transicion_invalida");
  });

  it("exige dependencias completadas para avanzar", async () => {
    const { servicio, tarea } = await conProyecto();
    const a = await tarea();
    const b = await tarea([a.id]);
    await servicio.asignarTarea(ctx("supervisor"), b.id, "agente-1");
    expect(await codigo(servicio.moverTarea(ctx("supervisor"), b.id, "en_curso"))).toBe("dependencias_incompletas");
    await servicio.asignarTarea(ctx("supervisor"), a.id, "agente-1");
    await servicio.moverTarea(ctx("supervisor"), a.id, "en_curso");
    await servicio.moverTarea(ctx("supervisor"), a.id, "en_verificacion");
    await servicio.moverTarea(ctx("supervisor"), a.id, "completada");
    expect((await servicio.moverTarea(ctx("supervisor"), b.id, "en_curso")).estado).toBe("en_curso");
  });

  it("rechaza ciclos de dependencias (directos, transitivos y autorreferencia)", async () => {
    const { servicio, auditor, tarea } = await conProyecto();
    const a = await tarea();
    const b = await tarea([a.id]);
    const c = await tarea([b.id]);
    expect(await codigo(servicio.agregarDependencia(ctx("supervisor"), a.id, b.id))).toBe("ciclo_dependencias");
    expect(await codigo(servicio.agregarDependencia(ctx("supervisor"), a.id, c.id))).toBe("ciclo_dependencias");
    expect(await codigo(servicio.agregarDependencia(ctx("supervisor"), a.id, a.id))).toBe("ciclo_dependencias");
    // El grafo no cambio y el rechazo quedo auditado.
    const [tas] = await Promise.all([servicio.listarTareas(ctx("viewer"), a.proyectoId)]);
    expect(tas.find((t) => t.id === a.id)?.deps).toEqual([]);
    expect((await auditor.listar(ORG_A)).map((e) => e.accion)).toContain("tarea:dependencia_rechazada");
    // Una dependencia valida (diamante) si se admite y luego se puede quitar.
    const d = await tarea();
    expect((await servicio.agregarDependencia(ctx("supervisor"), c.id, d.id)).deps).toContain(d.id);
    expect((await servicio.quitarDependencia(ctx("supervisor"), c.id, d.id)).deps).not.toContain(d.id);
  });

  it("detecta ciclos con la funcion pura", () => {
    const g = [
      { id: "a", deps: ["b"] },
      { id: "b", deps: ["c"] },
      { id: "c", deps: [] },
    ];
    expect(crearaCiclo(g, "c", "a")).toBe(true);
    expect(crearaCiclo(g, "a", "c")).toBe(false);
  });

  it("no permite dependencias hacia tareas inexistentes o de otro proyecto", async () => {
    const { servicio, proyecto, tarea } = await conProyecto();
    const otro = await servicio.crearProyecto(ctx("owner"), { objetivo: "Otro" });
    const ajena = await servicio.crearTarea(ctx("owner"), {
      proyectoId: otro.id,
      criteriosVerificacion: ["x"],
    });
    const propia = await tarea();
    expect(await codigo(servicio.agregarDependencia(ctx("owner"), propia.id, ajena.id))).toBe("no_encontrado");
    expect(
      await codigo(
        servicio.crearTarea(ctx("owner"), {
          proyectoId: proyecto.id,
          criteriosVerificacion: ["x"],
          deps: [ajena.id],
        }),
      ),
    ).toBe("no_encontrado");
  });

  it("actualiza criterios de verificacion", async () => {
    const { servicio, tarea } = await conProyecto();
    const t = await tarea();
    const r = await servicio.definirCriterios(ctx("supervisor"), t.id, [" A ", "B"]);
    expect(r.criteriosVerificacion).toEqual(["A", "B"]);
    expect(await codigo(servicio.definirCriterios(ctx("supervisor"), t.id, []))).toBe("solicitud_invalida");
  });
});

describe("aislamiento y roles", () => {
  it("aisla estrictamente entre organizaciones", async () => {
    const { servicio, proyecto, tarea } = await conProyecto();
    const t = await tarea();
    const intruso = ctx("owner", ORG_B);
    expect(await servicio.listarProyectos(intruso)).toEqual([]);
    expect(await codigo(servicio.obtenerProyecto(intruso, proyecto.id))).toBe("no_encontrado");
    expect(await codigo(servicio.listarTareas(intruso, proyecto.id))).toBe("no_encontrado");
    expect(await codigo(servicio.moverTarea(intruso, t.id, "asignada"))).toBe("no_encontrado");
    expect(await codigo(servicio.asignarTarea(intruso, t.id, "x"))).toBe("no_encontrado");
    expect(await codigo(servicio.agregarDependencia(intruso, t.id, t.id))).toBe("no_encontrado");
    expect(
      await codigo(servicio.crearTarea(intruso, { proyectoId: proyecto.id, criteriosVerificacion: ["x"] })),
    ).toBe("no_encontrado");
    // Nada cambio en la org original.
    expect((await servicio.listarTareas(ctx("viewer"), proyecto.id))[0]?.estado).toBe("pendiente");
  });

  it("el viewer no puede escribir y la denegacion se audita", async () => {
    const { servicio, auditor, proyecto, tarea } = await conProyecto();
    const t = await tarea();
    const v = ctx("viewer");
    expect(await codigo(servicio.crearProyecto(v, { objetivo: "x" }))).toBe("rol_insuficiente");
    expect(await codigo(servicio.crearTarea(v, { proyectoId: proyecto.id, criteriosVerificacion: ["x"] }))).toBe(
      "rol_insuficiente",
    );
    expect(await codigo(servicio.moverTarea(v, t.id, "asignada"))).toBe("rol_insuficiente");
    expect(await codigo(servicio.asignarTarea(v, t.id, "a"))).toBe("rol_insuficiente");
    expect(await codigo(servicio.agregarDependencia(v, t.id, t.id))).toBe("rol_insuficiente");
    expect(await codigo(servicio.definirCriterios(v, t.id, ["x"]))).toBe("rol_insuficiente");
    // Puede leer.
    expect(await servicio.listarProyectos(v)).toHaveLength(1);
    const denegadas = (await auditor.listar(ORG_A)).filter((e) => e.accion.endsWith("_denegada"));
    expect(denegadas).toHaveLength(6);
    expect(denegadas.every((e) => e.actor === "u-viewer")).toBe(true);
    expect((await servicio.listarTareas(v, proyecto.id))[0]?.estado).toBe("pendiente");
  });

  it("el supervisor puede asignar tareas", async () => {
    const { servicio, tarea } = await conProyecto();
    const t = await tarea();
    expect((await servicio.asignarTarea(ctx("supervisor"), t.id, "a")).agenteId).toBe("a");
  });
});

describe("auditoria", () => {
  it("audita cada mutacion y la cadena es integra", async () => {
    const { servicio, auditor, tarea } = await conProyecto();
    const a = await tarea();
    const b = await tarea([a.id]);
    await servicio.asignarTarea(ctx("supervisor"), a.id, "ag");
    await servicio.moverTarea(ctx("supervisor"), a.id, "en_curso");
    await servicio.definirCriterios(ctx("supervisor"), a.id, ["ok"]);
    await servicio.quitarDependencia(ctx("supervisor"), b.id, a.id);
    await servicio.agregarDependencia(ctx("supervisor"), b.id, a.id);
    const acciones = (await auditor.listar(ORG_A)).map((e) => e.accion);
    expect(acciones).toEqual([
      "proyecto:crear",
      "tarea:crear",
      "tarea:crear",
      "tarea:asignar",
      "tarea:mover",
      "tarea:criterios",
      "tarea:dependencia_quitar",
      "tarea:dependencia_agregar",
    ]);
    const entrada = (await auditor.listar(ORG_A)).find((e) => e.accion === "tarea:mover");
    expect(entrada).toMatchObject({
      actor: "u-supervisor",
      entidad: `tarea:${a.id}`,
      antes: { estado: "asignada" },
      despues: { estado: "en_curso" },
    });
    expect(await auditor.verificar(ORG_A)).toEqual({ valida: true, total: acciones.length });
  });

  it("la auditoria de una org no contiene otra y detecta manipulacion", async () => {
    const { servicio, auditor, auditoria } = await conProyecto();
    await servicio.crearProyecto(ctx("owner", ORG_B), { objetivo: "B" });
    expect((await auditor.listar(ORG_B)).every((e) => e.orgId === ORG_B)).toBe(true);
    expect((await auditor.verificar(ORG_B)).valida).toBe(true);
    const interna = auditoria._internoParaPruebas(ORG_A);
    (interna[0] as { actor: string }).actor = "falsificado";
    expect(verificarCadena(ORG_A, interna, undefined)).toMatchObject({ valida: false, motivo: "hash" });
  });
});

describe("http", () => {
  const montarHttp = (identidad: ProveedorIdentidad) => {
    const { servicio } = montar();
    return { servicio, h: crearManejadoresProyectos({ servicio, identidad }) };
  };
  const post = (cuerpo: unknown, tipo = "application/json") =>
    new Request("http://x/api/projects", {
      method: "POST",
      headers: { "content-type": tipo },
      body: JSON.stringify(cuerpo),
    });

  it("401 sin identidad y 403 para viewer", async () => {
    const { h } = montarHttp(() => null);
    expect((await h.listarProyectos(new Request("http://x"))).status).toBe(401);
    const { h: hv } = montarHttp(() => ctx("viewer"));
    expect((await hv.crearProyecto(post({ objetivo: "x" }))).status).toBe(403);
    const lista = await hv.listarProyectos(new Request("http://x"));
    expect(lista.status).toBe(200);
    expect((await lista.json()).permisos.crearProyecto).toBe(false);
  });

  it("valida el cuerpo con Zod y el tipo de contenido", async () => {
    const { h } = montarHttp(() => ctx("supervisor"));
    expect((await h.crearProyecto(post({ objetivo: "" }))).status).toBe(400);
    expect((await h.crearProyecto(post({ objetivo: "x", extra: 1 }))).status).toBe(400);
    expect((await h.crearProyecto(post({ objetivo: "x" }, "text/plain"))).status).toBe(415);
    const ok = await h.crearProyecto(post({ objetivo: "Meta" }));
    expect(ok.status).toBe(201);
    const { proyecto } = await ok.json();
    const vista = await h.obtenerProyecto(new Request("http://x"), proyecto.id);
    expect((await vista.json()).tareas).toEqual([]);
    expect((await h.obtenerProyecto(new Request("http://x"), "no-uuid")).status).toBe(400);
  });

  it("mapea el ciclo a 409 y usa la org de la identidad", async () => {
    let actual = ctx("supervisor");
    const { h } = montarHttp(() => actual);
    const { proyecto } = await (await h.crearProyecto(post({ objetivo: "Meta" }))).json();
    const nueva = async (deps: string[]) =>
      (
        await (
          await h.crearTarea(post({ criteriosVerificacion: ["c"], deps }), proyecto.id)
        ).json()
      ).tarea;
    const a = await nueva([]);
    const b = await nueva([a.id]);
    const patch = (cuerpo: unknown) =>
      new Request("http://x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
    const r = await h.actualizarTarea(patch({ accion: "dependencia_agregar", depId: b.id }), a.id);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("ciclo_dependencias");
    const mv = await h.actualizarTarea(patch({ accion: "mover", estado: "asignada" }), a.id);
    expect(mv.status).toBe(409);
    // Otra org: 404.
    actual = ctx("owner", ORG_B);
    expect((await h.actualizarTarea(patch({ accion: "mover", estado: "asignada" }), a.id)).status).toBe(404);
    expect((await h.obtenerProyecto(new Request("http://x"), proyecto.id)).status).toBe(404);
  });
});
