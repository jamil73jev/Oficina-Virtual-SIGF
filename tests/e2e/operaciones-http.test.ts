import { describe, expect, it } from "vitest";
import type { ContextoAcceso, RolUsuario } from "@/core/rbac";
import { crearManejadoresOperaciones, marcoSse, type ProgramarTrabajo } from "@/modules/operaciones";
import { InstantaneaOperacion, EventoTraza } from "@/orchestration/traza/eventos";
import {
  ENCARGO_CARTERA,
  ORG_A,
  ORG_B,
  eventosDeMarcos,
  leerSseHastaCerrar,
  montarOperaciones,
  parsearSse,
} from "./operaciones.soporte";

/** Cada operacion ejecuta varios agentes y calculadoras completas: con la suite en paralelo supera 5 s. */
const LENTO = 60_000;

const BASE = "http://localhost/api/operaciones";
const identidadDe = (rol: RolUsuario | null, orgId = ORG_A) => (): ContextoAcceso | null =>
  rol ? { usuarioId: `u-${rol}`, orgId, rol } : null;

const post = (cuerpo: unknown, tipo = "application/json") =>
  new Request(BASE, { method: "POST", headers: { "content-type": tipo }, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

/** Monta servicio y handlers; la identidad se elige por peticion con la cabecera x-prueba-rol/org (solo en pruebas). */
function montarHttp(opts: { programar?: ProgramarTrabajo; keepaliveMs?: number } = {}) {
  const env = montarOperaciones();
  const identidadPrueba = (req: Request): ContextoAcceso | null => {
    const rol = req.headers.get("x-prueba-rol") as RolUsuario | null;
    return identidadDe(rol, req.headers.get("x-prueba-org") ?? ORG_A)();
  };
  const h = crearManejadoresOperaciones({
    servicio: env.servicio,
    identidad: identidadPrueba,
    programar: opts.programar,
    keepaliveMs: opts.keepaliveMs,
  });
  const como = (req: Request, rol: RolUsuario | null, orgId = ORG_A) => {
    const headers = new Headers(req.headers);
    if (rol) headers.set("x-prueba-rol", rol);
    headers.set("x-prueba-org", orgId);
    return new Request(req, { headers });
  };
  const get = (ruta: string, rol: RolUsuario | null, orgId = ORG_A, extra: RequestInit = {}) =>
    como(new Request(`${BASE}/${ruta}`, extra), rol, orgId);
  const crear = async (rol: RolUsuario = "supervisor", orgId = ORG_A) => {
    const r = await h.crear(como(post({ texto: ENCARGO_CARTERA }), rol, orgId));
    expect(r.status).toBe(202);
    return ((await r.json()) as { operacionId: string }).operacionId;
  };
  return { ...env, h, get, crear, como };
}

describe("POST /api/operaciones", { timeout: LENTO }, () => {
  it("401 sin identidad y 403 (auditado) para viewer", async () => {
    const m = montarHttp();
    expect((await m.h.crear(m.como(post({ texto: "hola" }), null))).status).toBe(401);
    const r = await m.h.crear(m.como(post({ texto: "hola" }), "viewer"));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "rol_insuficiente" });
    expect(await m.acciones()).toContain("operacion.crear_denegada");
    expect(m.publicador.operacionesRetenidas).toBe(0);
  });

  it.each(["owner", "admin", "supervisor"] as const)("202 con operacionId para %s", async (rol) => {
    const m = montarHttp();
    const r = await m.h.crear(m.como(post({ texto: ENCARGO_CARTERA, idioma: "en" }), rol));
    expect(r.status).toBe(202);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const { operacionId } = (await r.json()) as { operacionId: string };
    await m.servicio.esperar(ORG_A, operacionId);
    const instantanea = await m.servicio.obtenerInstantanea(ORG_A, operacionId);
    expect(instantanea?.idioma).toBe("en");
    expect(instantanea?.estado).toBe("completada");
  });

  it("cuerpo estricto: 400 y 415", async () => {
    const m = montarHttp();
    const casos: unknown[] = [
      {},
      { texto: "" },
      { texto: "   " },
      { texto: "x".repeat(2001) },
      { texto: "ok", idioma: "fr" },
      { texto: "ok", orgId: ORG_B },
      [],
    ];
    for (const c of casos) expect((await m.h.crear(m.como(post(c), "owner"))).status, JSON.stringify(c).slice(0, 40)).toBe(400);
    expect((await m.h.crear(m.como(post("{no json"), "owner"))).status).toBe(400);
    expect((await m.h.crear(m.como(post({ texto: "ok" }, "text/plain"), "owner"))).status).toBe(415);
    expect((await m.h.crear(m.como(post({ texto: "x".repeat(2000) }), "owner"))).status).toBe(202);
  });

  it("programa la operacion en segundo plano con el programador inyectado (after en la ruta)", async () => {
    const trabajos: Array<() => Promise<void>> = [];
    const m = montarHttp({ programar: (t) => trabajos.push(t) });
    const operacionId = await m.crear();
    expect(trabajos).toHaveLength(1);
    expect((await m.servicio.obtenerInstantanea(ORG_A, operacionId))?.eventos).toHaveLength(1);
    await trabajos[0]?.();
    expect((await m.servicio.obtenerInstantanea(ORG_A, operacionId))?.estado).toBe("completada");
  });
});

describe("GET /api/operaciones/[id]", { timeout: LENTO }, () => {
  it("instantanea del contrato para cualquier rol de la org; 401, 404 y aislamiento", async () => {
    const m = montarHttp();
    const operacionId = await m.crear();
    await m.servicio.esperar(ORG_A, operacionId);
    for (const rol of ["viewer", "supervisor", "admin", "owner"] as const) {
      const r = await m.h.obtener(m.get(operacionId, rol), operacionId);
      expect(r.status).toBe(200);
      const cuerpo = InstantaneaOperacion.parse(await r.json());
      expect(cuerpo.operacionId).toBe(operacionId);
      expect(cuerpo.eventos.at(-1)?.tipo).toBe("operacion_finalizada");
    }
    expect((await m.h.obtener(m.get(operacionId, null), operacionId)).status).toBe(401);
    // Otra organizacion: 404 (no revela que existe), aunque sea owner.
    expect((await m.h.obtener(m.get(operacionId, "owner", ORG_B), operacionId)).status).toBe(404);
    expect((await m.h.obtener(m.get("x", "owner"), "no-es-uuid")).status).toBe(404);
    const inexistente = "99999999-9999-4999-8999-999999999999";
    expect((await m.h.obtener(m.get(inexistente, "owner"), inexistente)).status).toBe(404);
  });

  it("entrega por defecto una instantanea ligera menor de 60 KB y conserva la completa con ?completa=1", async () => {
    const m = montarHttp();
    const operacionId = await m.crear();
    await m.servicio.esperar(ORG_A, operacionId);
    const ligeraRespuesta = await m.h.obtener(m.get(operacionId, "viewer"), operacionId);
    const completaRespuesta = await m.h.obtener(m.get(`${operacionId}?completa=1`, "viewer"), operacionId);
    const ligera = InstantaneaOperacion.parse(await ligeraRespuesta.json());
    const completa = InstantaneaOperacion.parse(await completaRespuesta.json());
    const bytesLigera = new TextEncoder().encode(JSON.stringify(ligera)).byteLength;
    const bytesCompleta = new TextEncoder().encode(JSON.stringify(completa)).byteLength;
    expect(bytesLigera).toBeLessThan(60 * 1024);
    expect(ligera.eventos).toHaveLength(completa.eventos.length);
    expect(bytesCompleta).toBeGreaterThan(bytesLigera);
    const tablaLigera = ligera.eventos.find((evento) => evento.tipo === "tabla")!;
    expect(tablaLigera.detalle).toMatchObject({ ligero: true, referencia: expect.any(String) });
    expect((tablaLigera.detalle?.tablas as Array<Record<string, unknown>>)[0]).not.toHaveProperty("filas");
    const entregableLigero = ligera.eventos.find((evento) => evento.tipo === "entregable")!;
    expect(entregableLigero.detalle).toMatchObject({ ligero: true, tamanoBytes: expect.any(Number), lineas: expect.any(Number) });
  });
});

describe("detalle pesado bajo demanda", { timeout: LENTO }, () => {
  it("devuelve el evento completo y el entregable Markdown exacto", async () => {
    const m = montarHttp();
    const operacionId = await m.crear();
    await m.servicio.esperar(ORG_A, operacionId);
    const completos = await m.publicador.listar(ORG_A, operacionId);
    const tabla = completos.find((evento) => evento.tipo === "tabla")!;
    const evento = await m.h.evento(m.get(`${operacionId}/eventos/${tabla.secuencia}`, "viewer"), operacionId, String(tabla.secuencia));
    expect(EventoTraza.parse(await evento.json())).toEqual(tabla);
    const original = completos.find((item) => item.tipo === "entregable")?.detalle?.markdown;
    const entregable = await m.h.entregable(m.get(`${operacionId}/entregable?descargar=1`, "viewer"), operacionId);
    expect(entregable.headers.get("content-type")).toMatch(/^text\/markdown/);
    expect(entregable.headers.get("content-disposition")).toContain("entregable.md");
    expect(await entregable.text()).toBe(original);
  });

  it("aplica identidad, permiso, aislamiento y 404 a ambas lecturas", async () => {
    const m = montarHttp({ programar: () => {} });
    const operacionId = await m.crear();
    const rutas = [
      () => m.h.evento(m.get(`${operacionId}/eventos/1`, null), operacionId, "1"),
      () => m.h.entregable(m.get(`${operacionId}/entregable`, null), operacionId),
    ];
    for (const pedir of rutas) expect((await pedir()).status).toBe(401);
    expect((await m.h.evento(m.get(`${operacionId}/eventos/1`, "invalido" as RolUsuario), operacionId, "1")).status).toBe(403);
    expect((await m.h.entregable(m.get(`${operacionId}/entregable`, "invalido" as RolUsuario), operacionId)).status).toBe(403);
    expect((await m.h.evento(m.get(`${operacionId}/eventos/1`, "owner", ORG_B), operacionId, "1")).status).toBe(404);
    expect((await m.h.entregable(m.get(`${operacionId}/entregable`, "owner", ORG_B), operacionId)).status).toBe(404);
    expect((await m.h.evento(m.get(`${operacionId}/eventos/999`, "viewer"), operacionId, "999")).status).toBe(404);
    expect((await m.h.entregable(m.get(`${operacionId}/entregable`, "viewer"), operacionId)).status).toBe(404);
  });
});

describe("GET /api/operaciones/[id]/eventos (SSE)", { timeout: LENTO }, () => {
  it("de punta a punta: formato del contrato, secuencias contiguas y cierre tras operacion_finalizada", async () => {
    const trabajos: Array<() => Promise<void>> = [];
    const m = montarHttp({ programar: (t) => trabajos.push(t) });
    const operacionId = await m.crear();
    const respuesta = await m.h.eventos(m.get(`${operacionId}/eventos`, "viewer"), operacionId);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const lectura = leerSseHastaCerrar(respuesta);
    await trabajos[0]?.();
    const marcos = await lectura;
    const eventos = eventosDeMarcos(marcos);
    expect(eventos.length).toBeGreaterThan(10);
    expect(eventos.map((e) => e.secuencia)).toEqual(eventos.map((_, i) => i + 1));
    for (const m2 of marcos.filter((x) => x.event === "traza")) {
      const e = EventoTraza.parse(JSON.parse(m2.data as string));
      expect(m2.id).toBe(String(e.secuencia));
    }
    expect(eventos[0]?.tipo).toBe("operacion_creada");
    expect(eventos.at(-1)?.tipo).toBe("operacion_finalizada");
    expect(eventos.filter((e) => e.tipo === "traspaso").length).toBeGreaterThanOrEqual(3);
    expect(m.publicador.suscriptoresActivos()).toBe(0);
  });

  it("reanuda con Last-Event-ID, con ?desde y con ?ultimoEventoId; si ya tenia el cierre, cierra sin enviar", async () => {
    const m = montarHttp();
    const operacionId = await m.crear();
    await m.servicio.esperar(ORG_A, operacionId);
    const total = (await m.publicador.listar(ORG_A, operacionId)).length;

    const conCabecera = await m.h.eventos(
      m.get(`${operacionId}/eventos`, "viewer", ORG_A, { headers: { "Last-Event-ID": "3" } }),
      operacionId,
    );
    const ids = eventosDeMarcos(await leerSseHastaCerrar(conCabecera)).map((e) => e.secuencia);
    expect(ids).toEqual(Array.from({ length: total - 3 }, (_, i) => i + 4));

    for (const q of ["desde=5", "ultimoEventoId=5"]) {
      const r = await m.h.eventos(m.get(`${operacionId}/eventos?${q}`, "viewer"), operacionId);
      expect(eventosDeMarcos(await leerSseHastaCerrar(r))[0]?.secuencia).toBe(6);
    }
    // La cabecera Last-Event-ID prevalece sobre el parametro.
    const ambos = await m.h.eventos(
      m.get(`${operacionId}/eventos?desde=1`, "viewer", ORG_A, { headers: { "Last-Event-ID": String(total - 1) } }),
      operacionId,
    );
    expect(eventosDeMarcos(await leerSseHastaCerrar(ambos)).map((e) => e.secuencia)).toEqual([total]);

    const alDia = await m.h.eventos(
      m.get(`${operacionId}/eventos`, "viewer", ORG_A, { headers: { "Last-Event-ID": String(total) } }),
      operacionId,
    );
    expect(eventosDeMarcos(await leerSseHastaCerrar(alDia))).toEqual([]);
    expect(m.publicador.suscriptoresActivos()).toBe(0);

    const invalido = await m.h.eventos(m.get(`${operacionId}/eventos?desde=abc`, "viewer"), operacionId);
    expect(invalido.status).toBe(400);
  });

  it("401, 404 para otra organizacion y sin fugas", async () => {
    const m = montarHttp({ programar: () => {} });
    const operacionId = await m.crear();
    expect((await m.h.eventos(m.get(`${operacionId}/eventos`, null), operacionId)).status).toBe(401);
    const ajena = await m.h.eventos(m.get(`${operacionId}/eventos`, "owner", ORG_B), operacionId);
    expect(ajena.status).toBe(404);
    expect(m.publicador.suscriptoresActivos()).toBe(0);
  });

  it("entrega en vivo, envia keepalive y cancela la suscripcion al desconectarse el cliente", async () => {
    const m = montarHttp({ programar: () => {}, keepaliveMs: 5 });
    const operacionId = await m.crear();
    const respuesta = await m.h.eventos(m.get(`${operacionId}/eventos`, "viewer"), operacionId);
    const lector = (respuesta.body as ReadableStream<Uint8Array>).getReader();
    const decodificador = new TextDecoder();
    let texto = "";
    const leerHasta = async (condicion: () => boolean) => {
      while (!condicion()) {
        const { value, done } = await lector.read();
        if (done) throw new Error("cerrado antes de tiempo");
        texto += decodificador.decode(value, { stream: true });
      }
    };
    await leerHasta(() => texto.includes("id: 1\n"));
    expect(m.publicador.suscriptoresActivos(ORG_A, operacionId)).toBe(1);

    // Evento publicado despues de conectar: llega en vivo.
    await m.publicador.publicar({ orgId: ORG_A, operacionId, tipo: "comentario", titulo: "en vivo" });
    await leerHasta(() => texto.includes("id: 2\n"));
    await leerHasta(() => texto.includes(": keepalive"));
    expect(parsearSse(texto).some((x) => x.comentario === "keepalive")).toBe(true);

    await lector.cancel();
    expect(m.publicador.suscriptoresActivos()).toBe(0);
    // Publicar tras la desconexion no falla ni reabre nada.
    await m.publicador.publicar({ orgId: ORG_A, operacionId, tipo: "comentario", titulo: "despues" });
    expect(m.publicador.suscriptoresActivos()).toBe(0);
  });

  it("abortar la peticion libera la suscripcion y el temporizador", async () => {
    const m = montarHttp({ programar: () => {}, keepaliveMs: 5 });
    const operacionId = await m.crear();
    const control = new AbortController();
    const respuesta = await m.h.eventos(m.get(`${operacionId}/eventos`, "viewer", ORG_A, { signal: control.signal }), operacionId);
    const lector = (respuesta.body as ReadableStream<Uint8Array>).getReader();
    await lector.read();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.publicador.suscriptoresActivos()).toBe(1);
    control.abort();
    expect(m.publicador.suscriptoresActivos()).toBe(0);
    // El flujo termina (cerrado por el servidor) en lugar de quedar colgado.
    for (;;) if ((await lector.read()).done) break;
  });

  it("un cliente de otra org suscrito a la misma operacionId no recibe nada", async () => {
    const m = montarHttp({ programar: () => {} });
    const operacionId = await m.crear();
    const recibidos: unknown[] = [];
    const cancelar = m.publicador.suscribir(ORG_B, operacionId, (e) => recibidos.push(e));
    await m.publicador.publicar({ orgId: ORG_A, operacionId, tipo: "comentario", titulo: "privado" });
    expect(recibidos).toEqual([]);
    cancelar();
  });

  it("marcoSse sigue el formato del contrato", async () => {
    const m = montarHttp({ programar: () => {} });
    const operacionId = await m.crear();
    const [e] = await m.publicador.listar(ORG_A, operacionId);
    const marco = marcoSse(e as EventoTraza);
    expect(marco).toBe(`id: 1\nevent: traza\ndata: ${JSON.stringify(e)}\n\n`);
  });
});

describe("rutas de Next cableadas", { timeout: LENTO }, () => {
  it("sin identidad de desarrollo responden 401", async () => {
    const anterior = process.env.APPROVALS_DEV_IDENTITY;
    delete process.env.APPROVALS_DEV_IDENTITY;
    try {
      const { POST } = await import("@/app/api/operaciones/route");
      const { GET: obtener } = await import("@/app/api/operaciones/[id]/route");
      const { GET: eventos } = await import("@/app/api/operaciones/[id]/eventos/route");
      const { GET: evento } = await import("@/app/api/operaciones/[id]/eventos/[secuencia]/route");
      const { GET: entregable } = await import("@/app/api/operaciones/[id]/entregable/route");
      const id = "99999999-9999-4999-8999-999999999999";
      const params = { params: Promise.resolve({ id }) };
      expect((await POST(post({ texto: "hola" }))).status).toBe(401);
      expect((await obtener(new Request(`${BASE}/${id}`), params)).status).toBe(401);
      expect((await eventos(new Request(`${BASE}/${id}/eventos`), params)).status).toBe(401);
      expect((await evento(new Request(`${BASE}/${id}/eventos/1`), { params: Promise.resolve({ id, secuencia: "1" }) })).status).toBe(401);
      expect((await entregable(new Request(`${BASE}/${id}/entregable`), params)).status).toBe(401);
    } finally {
      if (anterior !== undefined) process.env.APPROVALS_DEV_IDENTITY = anterior;
    }
  });
});
