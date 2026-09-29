import { z } from "zod";
import type { ProveedorIdentidad } from "@/core/approvals/http";
import { can } from "@/core/rbac";
import { EstadoTarea } from "@/types";
import { ProyectoError, type CodigoErrorProyecto, type ServicioProyectos } from "./service";

const IdUuid = z.uuid();
const Texto = z.string().trim().min(1).max(2000);

const CuerpoProyecto = z.strictObject({ objetivo: Texto });

const CuerpoTarea = z.strictObject({
  criteriosVerificacion: z.array(Texto).min(1).max(50),
  deps: z.array(IdUuid).max(100).optional(),
  padreId: IdUuid.nullable().optional(),
});

const CuerpoActualizacion = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("mover"), estado: EstadoTarea }),
  z.strictObject({ accion: z.literal("asignar"), agenteId: z.string().trim().min(1).max(100).nullable() }),
  z.strictObject({ accion: z.literal("criterios"), criteriosVerificacion: z.array(Texto).min(1).max(50) }),
  z.strictObject({ accion: z.literal("dependencia_agregar"), depId: IdUuid }),
  z.strictObject({ accion: z.literal("dependencia_quitar"), depId: IdUuid }),
]);

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

const error = (status: number, codigo: string) => json({ error: codigo }, status);

const esJson = (req: Request) =>
  (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ===
  "application/json";

const ESTADO_HTTP: Record<CodigoErrorProyecto, number> = {
  no_encontrado: 404,
  rol_insuficiente: 403,
  solicitud_invalida: 400,
  ciclo_dependencias: 409,
  transicion_invalida: 409,
  dependencias_incompletas: 409,
  sin_agente: 409,
  proyecto_cerrado: 409,
};

export interface DepsHttpProyectos {
  servicio: ServicioProyectos;
  identidad: ProveedorIdentidad;
}

/** Fabrica de handlers con dependencias inyectadas (los route.ts las cablean). */
export function crearManejadoresProyectos({ servicio, identidad }: DepsHttpProyectos) {
  /** Envuelve un handler: autentica, mapea errores de dominio y valida el JSON. */
  const ejecutar = async (
    req: Request,
    fn: (ctx: NonNullable<Awaited<ReturnType<ProveedorIdentidad>>>) => Promise<Response>,
  ): Promise<Response> => {
    const ctx = await identidad(req);
    if (!ctx) return error(401, "no_autenticado");
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof ProyectoError) return error(ESTADO_HTTP[e.codigo], e.codigo);
      throw e;
    }
  };

  /** Lee y valida el cuerpo JSON; devuelve una Response de error o los datos. */
  const leerCuerpo = async <T extends z.ZodType>(
    req: Request,
    esquema: T,
  ): Promise<z.infer<T> | Response> => {
    if (!esJson(req)) return error(415, "content_type_no_soportado");
    let crudo: unknown;
    try {
      crudo = await req.json();
    } catch {
      return error(400, "json_invalido");
    }
    const r = esquema.safeParse(crudo);
    return r.success ? r.data : error(400, "cuerpo_invalido");
  };

  const permisos = (rol: Parameters<typeof can>[0]) => ({
    crearProyecto: can(rol, "proyecto:crear"),
    crearTarea: can(rol, "tarea:crear"),
    editarTarea: can(rol, "tarea:editar"),
    asignarTarea: can(rol, "tarea:asignar"),
  });

  return {
    listarProyectos: (req: Request) =>
      ejecutar(req, async (ctx) =>
        json(
          { proyectos: await servicio.listarProyectos(ctx), permisos: permisos(ctx.rol) },
          200,
        ),
      ),

    crearProyecto: (req: Request) =>
      ejecutar(req, async (ctx) => {
        // Comprueba el rol antes de validar el cuerpo: deniega (y audita) primero.
        if (!can(ctx.rol, "proyecto:crear")) {
          await servicio.crearProyecto(ctx, { objetivo: "-" });
        }
        const cuerpo = await leerCuerpo(req, CuerpoProyecto);
        if (cuerpo instanceof Response) return cuerpo;
        return json({ proyecto: await servicio.crearProyecto(ctx, cuerpo) }, 201);
      }),

    obtenerProyecto: (req: Request, idCrudo: string) =>
      ejecutar(req, async (ctx) => {
        const id = IdUuid.safeParse(idCrudo);
        if (!id.success) return error(400, "id_invalido");
        const proyecto = await servicio.obtenerProyecto(ctx, id.data);
        const tareas = await servicio.listarTareas(ctx, id.data);
        return json({ proyecto, tareas, permisos: permisos(ctx.rol) }, 200);
      }),

    crearTarea: (req: Request, proyectoIdCrudo: string) =>
      ejecutar(req, async (ctx) => {
        const proyectoId = IdUuid.safeParse(proyectoIdCrudo);
        if (!proyectoId.success) return error(400, "id_invalido");
        if (!can(ctx.rol, "tarea:crear")) {
          await servicio.crearTarea(ctx, {
            proyectoId: proyectoId.data,
            criteriosVerificacion: ["-"],
          });
        }
        const cuerpo = await leerCuerpo(req, CuerpoTarea);
        if (cuerpo instanceof Response) return cuerpo;
        const tarea = await servicio.crearTarea(ctx, { proyectoId: proyectoId.data, ...cuerpo });
        return json({ tarea }, 201);
      }),

    actualizarTarea: (req: Request, tareaIdCrudo: string) =>
      ejecutar(req, async (ctx) => {
        const tareaId = IdUuid.safeParse(tareaIdCrudo);
        if (!tareaId.success) return error(400, "id_invalido");
        const cuerpo = await leerCuerpo(req, CuerpoActualizacion);
        if (cuerpo instanceof Response) return cuerpo;
        const id = tareaId.data;
        switch (cuerpo.accion) {
          case "mover":
            return json({ tarea: await servicio.moverTarea(ctx, id, cuerpo.estado) }, 200);
          case "asignar":
            return json({ tarea: await servicio.asignarTarea(ctx, id, cuerpo.agenteId) }, 200);
          case "criterios":
            return json(
              { tarea: await servicio.definirCriterios(ctx, id, cuerpo.criteriosVerificacion) },
              200,
            );
          case "dependencia_agregar":
            return json({ tarea: await servicio.agregarDependencia(ctx, id, cuerpo.depId) }, 200);
          case "dependencia_quitar":
            return json({ tarea: await servicio.quitarDependencia(ctx, id, cuerpo.depId) }, 200);
        }
      }),
  };
}
