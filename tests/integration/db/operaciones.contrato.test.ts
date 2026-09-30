import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RepositorioOperacionesMemoria, type RegistroOperacion, type RepositorioOperaciones } from "@/modules/operaciones";
import { RepositorioOperacionesDrizzle } from "@/modules/operaciones/repo-drizzle";
import { EventoTraza, type PublicadorTraza } from "@/orchestration/traza/eventos";
import { PublicadorTrazaMemoria } from "@/orchestration/traza/memoria";
import { PublicadorTrazaPostgres } from "@/orchestration/traza/postgres";
import { TIMEOUT_ARRANQUE, crearBdPrueba, orgEnMemoria, type OrgSembrada } from "./pglite";

interface Montaje {
  repo: RepositorioOperaciones;
  publicador: PublicadorTraza;
  nuevaOrg(): Promise<OrgSembrada>;
  cerrar(): Promise<void>;
}

/** Sondeo corto en pruebas (en produccion 500 ms). */
const INTERVALO = 15;

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => ({
      repo: new RepositorioOperacionesMemoria(),
      publicador: new PublicadorTrazaMemoria(),
      nuevaOrg: orgEnMemoria,
      cerrar: async () => {},
    }),
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      const publicador = new PublicadorTrazaPostgres(bd.db, { intervaloSondeoMs: INTERVALO });
      return {
        repo: new RepositorioOperacionesDrizzle(bd.db),
        publicador,
        nuevaOrg: bd.nuevaOrg,
        cerrar: async () => {
          publicador.cancelarTodas();
          await bd.cerrar();
        },
      };
    },
  },
];

const registro = (orgId: string, over: Partial<RegistroOperacion> = {}): RegistroOperacion => ({
  operacionId: randomUUID(),
  orgId,
  usuarioId: "usuario-a",
  texto: "Analiza la cartera vencida — ñandú ✓",
  idioma: "es",
  estado: "en_curso",
  creadaEn: new Date(Date.UTC(2026, 8, 30, 12, 0, 0, 123)).toISOString(),
  ...over,
});

const evento = (orgId: string, operacionId: string, titulo = "paso") =>
  ({ orgId, operacionId, tipo: "agente_inicia", titulo, agenteId: "cartera" }) as const;

/** Espera activa acotada (la suscripcion por sondeo entrega de forma asincrona). */
async function esperarHasta(condicion: () => boolean, ms = 3000) {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error("tiempo de espera agotado");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.each(implementaciones)("contrato operaciones y traza: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  const nuevaOperacion = async (orgId: string) => {
    const r = registro(orgId);
    await m.repo.crear(r);
    return r;
  };

  it("repositorio: crea, obtiene, actualiza estado; duplicado y ajena rechazados", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const r = await nuevaOperacion(a.orgId);
    expect(await m.repo.obtener(a.orgId, r.operacionId)).toEqual(r);
    await expect(m.repo.crear(r)).rejects.toThrow();
    await m.repo.actualizarEstado(a.orgId, r.operacionId, "completada");
    expect((await m.repo.obtener(a.orgId, r.operacionId))?.estado).toBe("completada");
    expect(await m.repo.obtener(b.orgId, r.operacionId)).toBeNull();
    await expect(m.repo.actualizarEstado(b.orgId, r.operacionId, "fallida")).rejects.toThrow("Operacion inexistente");
    await expect(m.repo.actualizarEstado(a.orgId, randomUUID(), "fallida")).rejects.toThrow("Operacion inexistente");
    expect((await m.repo.obtener(a.orgId, r.operacionId))?.estado).toBe("completada");
  });

  it("publicar asigna id, ts y secuencia contigua por operacion (cumple el contrato)", async () => {
    const o = await m.nuevaOrg();
    const op1 = await nuevaOperacion(o.orgId);
    const op2 = await nuevaOperacion(o.orgId);
    for (let i = 1; i <= 3; i++) await m.publicador.publicar(evento(o.orgId, op1.operacionId, `paso ${i}`));
    for (let i = 1; i <= 2; i++) await m.publicador.publicar(evento(o.orgId, op2.operacionId, `paso ${i}`));
    const eventos = await m.publicador.listar(o.orgId, op1.operacionId);
    expect(eventos.map((e) => e.secuencia)).toEqual([1, 2, 3]);
    expect((await m.publicador.listar(o.orgId, op2.operacionId)).map((e) => e.secuencia)).toEqual([1, 2]);
    for (const e of eventos) expect(EventoTraza.safeParse(e).success).toBe(true);
    expect(new Set(eventos.map((e) => e.id)).size).toBe(3);
  });

  it("fidelidad de campos opcionales, detalle anidado y tokens", async () => {
    const o = await m.nuevaOrg();
    const op = await nuevaOperacion(o.orgId);
    const publicado = await m.publicador.publicar({
      orgId: o.orgId,
      operacionId: op.operacionId,
      tipo: "traspaso",
      agenteId: "cartera",
      haciaAgenteId: "tesoreria",
      ejecucionId: "e-1",
      padreEjecucionId: "e-0",
      titulo: "Cartera traspasa a Tesorería",
      detalle: { resumen: "texto ✓", referencias: { tablas: ["t1", "t2"], n: 3.5, vacio: null }, lista: [1, { a: true }] },
      estado: "completado",
      tokens: { entrada: 120, salida: 45 },
    });
    const [leido] = await m.publicador.listar(o.orgId, op.operacionId);
    expect(leido).toEqual(publicado);
    const minimo = await m.publicador.publicar(evento(o.orgId, op.operacionId));
    expect((await m.publicador.listar(o.orgId, op.operacionId, 1))[0]).toEqual(minimo);
    expect(Object.keys(minimo).sort()).toEqual(["agenteId", "id", "operacionId", "orgId", "secuencia", "tipo", "titulo", "ts"]);
  });

  it("publicaciones concurrentes no dejan huecos ni repeticiones", async () => {
    const o = await m.nuevaOrg();
    const op = await nuevaOperacion(o.orgId);
    await Promise.all(Array.from({ length: 40 }, (_, i) => m.publicador.publicar(evento(o.orgId, op.operacionId, `e${i}`))));
    expect((await m.publicador.listar(o.orgId, op.operacionId)).map((e) => e.secuencia)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
  });

  it("un evento invalido se rechaza sin ocupar secuencia", async () => {
    const o = await m.nuevaOrg();
    const op = await nuevaOperacion(o.orgId);
    await m.publicador.publicar(evento(o.orgId, op.operacionId));
    await expect(m.publicador.publicar({ ...evento(o.orgId, op.operacionId), titulo: "" })).rejects.toThrow();
    await expect(m.publicador.publicar({ ...evento(o.orgId, op.operacionId), operacionId: "no-uuid" })).rejects.toThrow();
    expect((await m.publicador.publicar(evento(o.orgId, op.operacionId))).secuencia).toBe(2);
  });

  it("listar filtra por secuencia (Last-Event-ID) y devuelve copias", async () => {
    const o = await m.nuevaOrg();
    const op = await nuevaOperacion(o.orgId);
    for (let i = 1; i <= 5; i++) await m.publicador.publicar(evento(o.orgId, op.operacionId, `paso ${i}`));
    const desde3 = await m.publicador.listar(o.orgId, op.operacionId, 3);
    expect(desde3.map((e) => e.secuencia)).toEqual([4, 5]);
    (desde3[0] as { titulo: string }).titulo = "alterado";
    expect((await m.publicador.listar(o.orgId, op.operacionId, 3))[0]?.titulo).toBe("paso 4");
  });

  it("suscripcion en vivo aislada por org; un oyente que falla no impide a los demas", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const op = await nuevaOperacion(a.orgId);
    const recibidosA: number[] = [];
    const recibidosB: unknown[] = [];
    const c1 = m.publicador.suscribir(a.orgId, op.operacionId, () => {
      throw new Error("oyente roto");
    });
    const c2 = m.publicador.suscribir(a.orgId, op.operacionId, (e) => recibidosA.push(e.secuencia));
    const cB = m.publicador.suscribir(b.orgId, op.operacionId, (e) => recibidosB.push(e));
    await m.publicador.publicar(evento(a.orgId, op.operacionId));
    await m.publicador.publicar(evento(a.orgId, op.operacionId));
    await esperarHasta(() => recibidosA.length === 2);
    expect(recibidosA).toEqual([1, 2]);
    expect(await m.publicador.listar(b.orgId, op.operacionId)).toEqual([]);
    await pausa(INTERVALO * 4);
    expect(recibidosB).toEqual([]);
    for (const c of [c1, c2, cB]) c();
  });

  it("cancelar detiene la entrega (y cancelar dos veces es inocuo)", async () => {
    const o = await m.nuevaOrg();
    const op = await nuevaOperacion(o.orgId);
    const recibidos: number[] = [];
    const cancelar = m.publicador.suscribir(o.orgId, op.operacionId, (e) => recibidos.push(e.secuencia));
    await m.publicador.publicar(evento(o.orgId, op.operacionId));
    await esperarHasta(() => recibidos.length === 1);
    cancelar();
    cancelar();
    await m.publicador.publicar(evento(o.orgId, op.operacionId));
    await pausa(INTERVALO * 4);
    expect(recibidos).toEqual([1]);
    expect(await m.publicador.listar(o.orgId, op.operacionId)).toHaveLength(2);
  });
});

describe("PublicadorTrazaPostgres: concurrencia, sondeo, vida maxima y retencion", () => {
  let bd: Awaited<ReturnType<typeof crearBdPrueba>>;
  let repo: RepositorioOperacionesDrizzle;
  beforeAll(async () => {
    bd = await crearBdPrueba();
    repo = new RepositorioOperacionesDrizzle(bd.db);
  }, TIMEOUT_ARRANQUE);
  afterAll(() => bd.cerrar());

  const nuevaOperacion = async (orgId: string) => {
    const r = registro(orgId);
    await repo.crear(r);
    return r.operacionId;
  };

  it("varias instancias publicando a la vez: secuencias contiguas 1..N sin huecos", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const instancias = Array.from({ length: 4 }, () => new PublicadorTrazaPostgres(bd.db));
    const N = 60;
    const r = await Promise.all(
      Array.from({ length: N }, (_, i) => (instancias[i % 4] as PublicadorTrazaPostgres).publicar(evento(orgId, op, `e${i}`))),
    );
    expect(new Set(r.map((e) => e.secuencia)).size).toBe(N);
    expect((await instancias[0]?.listar(orgId, op))?.map((e) => e.secuencia)).toEqual(
      Array.from({ length: N }, (_, i) => i + 1),
    );
    const { rows } = await bd.comoPropietario(() =>
      bd.client.query<{ ultima_secuencia: number }>("select ultima_secuencia from operacion where id = $1", [op]),
    );
    expect(rows[0]?.ultima_secuencia).toBe(N);
  });

  it("un fallo al insertar revierte la secuencia (sin huecos)", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const fijo = randomUUID();
    const p = new PublicadorTrazaPostgres(bd.db, { nuevoId: () => fijo });
    await p.publicar(evento(orgId, op));
    // Mismo id => PK duplicada en el INSERT: la transaccion revierte tambien el UPDATE.
    await expect(p.publicar(evento(orgId, op))).rejects.toThrow();
    expect((await new PublicadorTrazaPostgres(bd.db).publicar(evento(orgId, op))).secuencia).toBe(2);
  });

  it("publicar en una operacion inexistente o de otra org falla", async () => {
    const a = await bd.nuevaOrg();
    const b = await bd.nuevaOrg();
    const op = await nuevaOperacion(a.orgId);
    const p = new PublicadorTrazaPostgres(bd.db);
    await expect(p.publicar(evento(a.orgId, randomUUID()))).rejects.toThrow("Operacion inexistente");
    await expect(p.publicar(evento(b.orgId, op))).rejects.toThrow("Operacion inexistente");
    expect(await p.listar(a.orgId, op)).toEqual([]);
  });

  it("la suscripcion entrega lo publicado por OTRA instancia (sondeo) y no solapa sondeos", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const lector = new PublicadorTrazaPostgres(bd.db, { intervaloSondeoMs: INTERVALO });
    const escritor = new PublicadorTrazaPostgres(bd.db);
    const recibidos: number[] = [];
    const cancelar = lector.suscribir(orgId, op, (e) => recibidos.push(e.secuencia));
    for (let i = 0; i < 5; i++) await escritor.publicar(evento(orgId, op));
    await esperarHasta(() => recibidos.length === 5);
    expect(recibidos).toEqual([1, 2, 3, 4, 5]);
    cancelar();
    expect(lector.suscripcionesActivas).toBe(0);
  });

  it("sin fugas: cancelar libera todas las suscripciones y no vuelve a consultar", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const p = new PublicadorTrazaPostgres(bd.db, { intervaloSondeoMs: INTERVALO });
    let llamadas = 0;
    const listar = p.listar.bind(p);
    p.listar = (...args) => {
      llamadas++;
      return listar(...args);
    };
    const cancelaciones = Array.from({ length: 50 }, () => p.suscribir(orgId, op, () => {}));
    expect(p.suscripcionesActivas).toBe(50);
    await pausa(INTERVALO * 3);
    for (const c of cancelaciones) c();
    expect(p.suscripcionesActivas).toBe(0);
    await pausa(INTERVALO * 2);
    const tras = llamadas;
    await pausa(INTERVALO * 5);
    expect(llamadas).toBe(tras);
  });

  it("vida maxima: la suscripcion se cancela sola", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const p = new PublicadorTrazaPostgres(bd.db, { intervaloSondeoMs: INTERVALO, vidaMaximaMs: INTERVALO * 3 });
    p.suscribir(orgId, op, () => {});
    expect(p.suscripcionesActivas).toBe(1);
    await esperarHasta(() => p.suscripcionesActivas === 0);
  });

  it("tras operacion_finalizada la suscripcion termina sola", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const p = new PublicadorTrazaPostgres(bd.db, { intervaloSondeoMs: INTERVALO });
    const recibidos: string[] = [];
    p.suscribir(orgId, op, (e) => recibidos.push(e.tipo));
    await p.publicar(evento(orgId, op));
    await p.publicar({ orgId, operacionId: op, tipo: "operacion_finalizada", titulo: "fin" });
    await esperarHasta(() => p.suscripcionesActivas === 0);
    expect(recibidos).toEqual(["agente_inicia", "operacion_finalizada"]);
  });

  it("una caida momentanea de la BD no mata la suscripcion", async () => {
    const { orgId } = await bd.nuevaOrg();
    const op = await nuevaOperacion(orgId);
    const p = new PublicadorTrazaPostgres(bd.db, { intervaloSondeoMs: INTERVALO });
    const listar = p.listar.bind(p);
    let fallos = 2;
    p.listar = (...args) => (fallos-- > 0 ? Promise.reject(new Error("conexion perdida")) : listar(...args));
    const recibidos: number[] = [];
    const cancelar = p.suscribir(orgId, op, (e) => recibidos.push(e.secuencia));
    await new PublicadorTrazaPostgres(bd.db).publicar(evento(orgId, op));
    await esperarHasta(() => recibidos.length === 1);
    cancelar();
  });
});
