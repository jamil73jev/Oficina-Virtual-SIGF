import { z } from "zod";
import { can, type ContextoAcceso } from "@/core/rbac";
import { Rol } from "@/types";
import { AprobacionError, type ServicioAprobaciones } from "./service";

/**
 * Adaptador de identidad inyectable: resuelve el contexto (usuario, org, rol)
 * a partir de la peticion. Null = no autenticado.
 */
export type ProveedorIdentidad = (
  req: Request,
) => Promise<ContextoAcceso | null> | ContextoAcceso | null;

const ContextoDev = z.object({
  usuarioId: z.string().min(1),
  orgId: z.string().min(1),
  rol: Rol,
});

/**
 * PENDIENTE (etapa auth+MFA): no existe autenticacion real todavia.
 * Este adaptador por defecto NO lee cabeceras ni parametros de la peticion
 * (serian falsificables). La identidad de desarrollo (APPROVALS_DEV_IDENTITY,
 * JSON {usuarioId, orgId, rol}) exige ademas APPROVALS_ALLOW_DEV_IDENTITY=true y
 * SOLO es valida con NODE_ENV development/test y sin VERCEL_ENV: en cualquier
 * otro entorno, definir APPROVALS_DEV_IDENTITY lanza un error (falla ruidosamente
 * en vez de degradarse en silencio). Sin la variable, devuelve null (401).
 */
export const identidadPendiente: ProveedorIdentidad = () => {
  const bruto = process.env.APPROVALS_DEV_IDENTITY;
  if (bruto === undefined) return null;
  const nodeEnv = process.env.NODE_ENV;
  if (
    process.env.VERCEL_ENV ||
    (nodeEnv !== "development" && nodeEnv !== "test")
  ) {
    throw new Error(
      "APPROVALS_DEV_IDENTITY esta definida fuera de development/test: identidad de desarrollo prohibida",
    );
  }
  if (process.env.APPROVALS_ALLOW_DEV_IDENTITY !== "true") return null;
  try {
    const r = ContextoDev.safeParse(JSON.parse(bruto));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
};

const CuerpoDecision = z.strictObject({
  decision: z.enum(["aprobada", "rechazada"]),
});
const IdAprobacion = z.uuid();

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const error = (status: number, codigo: string) =>
  json({ error: codigo }, status);

/** Solo application/json (con parametros opcionales como charset). */
const esJson = (req: Request) =>
  (req.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase() === "application/json";

const ESTADO_HTTP: Record<string, number> = {
  no_encontrada: 404,
  rol_insuficiente: 403,
  ya_decidida: 409,
  expirada: 409,
  solicitud_invalida: 400,
};

export interface DepsHttp {
  servicio: ServicioAprobaciones;
  identidad: ProveedorIdentidad;
}

/** Fabrica de handlers con dependencias inyectadas (los route.ts las cablean). */
export function crearManejadoresAprobaciones({ servicio, identidad }: DepsHttp) {
  return {
    async listar(req: Request): Promise<Response> {
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");
      if (!can(ctx.rol, "aprobacion:leer")) {
        await servicio.auditarDenegacion(ctx, "aprobacion:listar_denegada", "aprobacion:*");
        return error(403, "rol_insuficiente");
      }
      // La org sale SIEMPRE de la identidad, nunca de la peticion.
      const pendientes = await servicio.listarPendientes(ctx.orgId);
      return json({ aprobaciones: pendientes }, 200);
    },

    async decidir(req: Request, idCrudo: string): Promise<Response> {
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");
      if (!can(ctx.rol, "aprobacion:decidir")) {
        await servicio.auditarDenegacion(
          ctx,
          "aprobacion:decision_denegada",
          `aprobacion:${idCrudo.slice(0, 64)}`,
        );
        return error(403, "rol_insuficiente");
      }

      const id = IdAprobacion.safeParse(idCrudo);
      if (!id.success) return error(400, "id_invalido");
      if (!esJson(req)) return error(415, "content_type_no_soportado");
      let cuerpo: unknown;
      try {
        cuerpo = await req.json();
      } catch {
        return error(400, "json_invalido");
      }
      const parsed = CuerpoDecision.safeParse(cuerpo);
      if (!parsed.success) return error(400, "cuerpo_invalido");

      try {
        const r = await servicio.decidir(id.data, parsed.data.decision, ctx);
        return json({ aprobacion: r }, 200);
      } catch (e) {
        if (e instanceof AprobacionError)
          return error(ESTADO_HTTP[e.codigo] ?? 400, e.codigo);
        throw e;
      }
    },
  };
}
