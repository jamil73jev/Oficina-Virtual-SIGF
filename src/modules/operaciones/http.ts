import { z } from "zod";
import type { ProveedorIdentidad } from "@/core/approvals";
import { can, type Accion, type ContextoAcceso } from "@/core/rbac";
import { NOMBRE_EVENTO_SSE, type EventoTraza } from "@/orchestration/traza/eventos";
import { EntradaOperacion, eventoParaSse, type ProgramarTrabajo, type ServicioOperaciones } from "./servicio";

const IdOperacion = z.uuid();
/** Last-Event-ID / desde: la secuencia del ultimo evento recibido (0 = todos). */
const Desde = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Secuencia = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const KEEPALIVE_MS = 15_000;

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
const error = (status: number, codigo: string) => json({ error: codigo }, status);

const esJson = (req: Request) =>
  (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";

/** Formato del contrato: `id: <secuencia>` / `event: traza` / `data: <EventoTraza JSON>`. */
export const marcoSse = (evento: EventoTraza) =>
  `id: ${evento.secuencia}\nevent: ${NOMBRE_EVENTO_SSE}\ndata: ${JSON.stringify(evento)}\n\n`;

export interface DepsHttpOperaciones {
  servicio: ServicioOperaciones;
  identidad: ProveedorIdentidad;
  /** Como programar la operacion en segundo plano (en la ruta: after() de next/server). */
  programar?: ProgramarTrabajo;
  keepaliveMs?: number;
}

/** Fabrica de handlers de /api/operaciones con identidad inyectable (los route.ts la cablean). */
export function crearManejadoresOperaciones({ servicio, identidad, programar, keepaliveMs = KEEPALIVE_MS }: DepsHttpOperaciones) {
  /** 401 sin identidad; 403 (auditado) sin permiso. La org sale SIEMPRE de la identidad. */
  async function autorizar(req: Request, accion: Accion, entidad: string): Promise<ContextoAcceso | Response> {
    const ctx = await identidad(req);
    if (!ctx) return error(401, "no_autenticado");
    if (!can(ctx.rol, accion)) {
      await servicio.auditarDenegacion(ctx, `${accion.replace(":", ".")}_denegada`, entidad);
      return error(403, "rol_insuficiente");
    }
    return ctx;
  }

  /** Identidad, permiso de lectura y operacion de la misma org (404 si no existe o es de otra). */
  async function operacionLegible(req: Request, idCrudo: string) {
    const ctx = await autorizar(req, "operacion:leer", `operacion:${idCrudo.slice(0, 64)}`);
    if (ctx instanceof Response) return ctx;
    const id = IdOperacion.safeParse(idCrudo);
    if (!id.success) return error(404, "no_encontrada");
    const registro = await servicio.obtenerRegistro(ctx.orgId, id.data);
    if (!registro) return error(404, "no_encontrada");
    return { ctx, operacionId: id.data };
  }

  return {
    /** POST /api/operaciones: {texto, idioma} -> 202 {operacionId}. */
    async crear(req: Request): Promise<Response> {
      const ctx = await autorizar(req, "operacion:crear", "operacion:*");
      if (ctx instanceof Response) return ctx;
      if (!esJson(req)) return error(415, "content_type_no_soportado");
      let cuerpo: unknown;
      try {
        cuerpo = await req.json();
      } catch {
        return error(400, "json_invalido");
      }
      const entrada = EntradaOperacion.safeParse(cuerpo);
      if (!entrada.success) return error(400, "cuerpo_invalido");
      const { operacionId } = await servicio.encargar(entrada.data.texto, entrada.data.idioma, ctx, { programar });
      return json({ operacionId }, 202);
    },

    /** GET /api/operaciones/[id]: InstantaneaOperacion. */
    async obtener(req: Request, idCrudo: string): Promise<Response> {
      const r = await operacionLegible(req, idCrudo);
      if (r instanceof Response) return r;
      const completa = new URL(req.url).searchParams.get("completa") === "1";
      const instantanea = await servicio.obtenerInstantanea(r.ctx.orgId, r.operacionId, completa);
      if (!instantanea) return error(404, "no_encontrada");
      return json(instantanea, 200);
    },

    /** GET /api/operaciones/[id]/eventos/[secuencia]: evento persistido completo. */
    async evento(req: Request, idCrudo: string, secuenciaCruda: string): Promise<Response> {
      const r = await operacionLegible(req, idCrudo);
      if (r instanceof Response) return r;
      const secuencia = Secuencia.safeParse(secuenciaCruda);
      if (!secuencia.success) return error(404, "no_encontrada");
      const evento = await servicio.obtenerEvento(r.ctx.orgId, r.operacionId, secuencia.data);
      return evento ? json(evento, 200) : error(404, "no_encontrada");
    },

    /** GET /api/operaciones/[id]/entregable: Markdown completo bajo demanda. */
    async entregable(req: Request, idCrudo: string): Promise<Response> {
      const r = await operacionLegible(req, idCrudo);
      if (r instanceof Response) return r;
      const markdown = await servicio.obtenerEntregable(r.ctx.orgId, r.operacionId);
      if (markdown === null) return error(404, "no_encontrada");
      const descargar = new URL(req.url).searchParams.get("descargar") === "1";
      return new Response(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "no-store",
          ...(descargar ? { "Content-Disposition": 'attachment; filename="entregable.md"' } : {}),
        },
      });
    },

    /**
     * GET /api/operaciones/[id]/eventos: SSE. Reanuda con Last-Event-ID o ?desde (tambien
     * ?ultimoEventoId), envia keepalive, se cierra tras operacion_finalizada y cancela la
     * suscripcion cuando el cliente se desconecta.
     */
    async eventos(req: Request, idCrudo: string): Promise<Response> {
      const r = await operacionLegible(req, idCrudo);
      if (r instanceof Response) return r;
      const params = new URL(req.url).searchParams;
      const crudo = req.headers.get("last-event-id") ?? params.get("desde") ?? params.get("ultimoEventoId") ?? "0";
      const desde = Desde.safeParse(crudo.trim() === "" ? "0" : crudo);
      if (!desde.success) return error(400, "desde_invalido");

      const { orgId } = r.ctx;
      const { operacionId } = r;
      const publicador = servicio.publicador;
      const codificador = new TextEncoder();
      let cancelarSuscripcion: (() => void) | null = null;
      let temporizador: ReturnType<typeof setInterval> | null = null;
      let cerrado = false;
      const liberar = () => {
        cerrado = true;
        cancelarSuscripcion?.();
        cancelarSuscripcion = null;
        if (temporizador) clearInterval(temporizador);
        temporizador = null;
        req.signal?.removeEventListener("abort", alAbortar);
      };
      let alAbortar = () => {};

      const cuerpo = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enviar = (texto: string) => {
            if (cerrado) return;
            try {
              controller.enqueue(codificador.encode(texto));
            } catch {
              liberar();
            }
          };
          const cerrar = () => {
            if (cerrado) return;
            liberar();
            try {
              controller.close();
            } catch {
              // El cliente ya cancelo el flujo.
            }
          };
          alAbortar = cerrar;
          if (req.signal?.aborted) return cerrar();
          req.signal?.addEventListener("abort", alAbortar);

          let ultima = desde.data;
          const entregar = (evento: EventoTraza) => {
            if (cerrado || evento.secuencia <= ultima) return;
            ultima = evento.secuencia;
            enviar(marcoSse(eventoParaSse(evento)));
            if (evento.tipo === "operacion_finalizada") cerrar();
          };
          // Se suscribe ANTES de leer lo publicado y retiene lo que llegue mientras tanto: sin huecos.
          const retenidos: EventoTraza[] = [];
          let enVivo = false;
          cancelarSuscripcion = publicador.suscribir(orgId, operacionId, (evento) => {
            if (enVivo) entregar(evento);
            else retenidos.push(evento);
          });
          enviar(": conectado\n\n");
          try {
            const publicados = await publicador.listar(orgId, operacionId, 0);
            for (const evento of publicados) entregar(evento);
            enVivo = true;
            for (const evento of retenidos.sort((a, b) => a.secuencia - b.secuencia)) entregar(evento);
            // Ya finalizada y el cliente la tenia (Last-Event-ID posterior): nada mas que enviar.
            if (publicados.some((e) => e.tipo === "operacion_finalizada")) return cerrar();
          } catch {
            liberar();
            controller.error(new Error("traza_no_disponible"));
            return;
          }
          if (!cerrado) temporizador = setInterval(() => enviar(": keepalive\n\n"), keepaliveMs);
        },
        cancel() {
          liberar();
        },
      });

      return new Response(cuerpo, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
  };
}
