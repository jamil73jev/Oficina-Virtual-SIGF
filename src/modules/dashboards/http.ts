import { z } from "zod";
import { can } from "@/core/rbac";
import type { ProveedorIdentidad } from "@/core/approvals";
import type { ServicioDashboards } from "./service";

export interface DepsHttpDashboards {
  servicio: ServicioDashboards;
  identidad: ProveedorIdentidad;
}

const FiltroDashboardQuery = z.object({
  periodo: z.string().min(1).optional(),
  proyectoId: z.string().uuid().optional(),
  agenteId: z.string().uuid().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const error = (status: number, codigo: string) => json({ error: codigo }, status);

export function crearManejadoresDashboards({ servicio, identidad }: DepsHttpDashboards) {
  return {
    async resumen(req: Request): Promise<Response> {
      // 1. Identidad inyectable
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");

      // 2. Control de acceso RBAC (lectura de dashboards bajo permiso 'presupuesto:leer')
      if (!can(ctx.rol, "presupuesto:leer")) {
        return error(403, "rol_insuficiente");
      }

      // 3. Validación de parámetros de consulta con Zod
      const url = new URL(req.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsed = FiltroDashboardQuery.safeParse(queryParams);
      if (!parsed.success) {
        return error(400, "parametros_invalidos");
      }

      // 4. Obtención del resumen aislado estrictamente por ctx.orgId (la org viene de la identidad)
      try {
        const resumen = await servicio.obtenerResumen(ctx, parsed.data);
        return json({ dashboard: resumen }, 200);
      } catch (e) {
        if (e instanceof Error && e.name === "AccesoDenegadoError") {
          return error(403, "rol_insuficiente");
        }
        throw e;
      }
    },
  };
}
