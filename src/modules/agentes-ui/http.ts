import { z } from "zod";
import type { ProveedorIdentidad } from "@/core/approvals";
import { can } from "@/core/rbac";
import { esIdAgenteArea } from "@/modules/agentes-area";
import { ejecutarDemoAgente } from "./demo";
import { mensajesAgentes, type LocaleAgentes } from "./mensajes";

const IdAgente = z.string().trim().min(1).max(64).regex(/^[a-z-]+$/);
const CuerpoDemo = z.strictObject({
  proyectoId: z.uuid(),
  pregunta: z.string().trim().min(1).max(500).default("Informe del corte sintético vigente"),
  locale: z.enum(Object.keys(mensajesAgentes) as [LocaleAgentes, ...LocaleAgentes[]]).default("es"),
});

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export interface DepsHttpAgentes {
  identidad: ProveedorIdentidad;
  ejecutar?: typeof ejecutarDemoAgente;
}

export function crearManejadorDemoAgente({ identidad, ejecutar = ejecutarDemoAgente }: DepsHttpAgentes) {
  return async (req: Request, idCrudo: string): Promise<Response> => {
    const ctx = await identidad(req);
    if (!ctx) return json({ error: "no_autenticado" }, 401);
    if (!can(ctx.rol, "agente:editar")) return json({ error: "rol_insuficiente" }, 403);

    const id = IdAgente.safeParse(idCrudo);
    if (!id.success) return json({ error: "id_invalido" }, 400);
    if (!esIdAgenteArea(id.data)) return json({ error: "agente_no_encontrado" }, 404);
    if ((req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return json({ error: "content_type_no_soportado" }, 415);
    }
    let cuerpo: unknown;
    try {
      cuerpo = await req.json();
    } catch {
      return json({ error: "json_invalido" }, 400);
    }
    const entrada = CuerpoDemo.safeParse(cuerpo);
    if (!entrada.success) return json({ error: "cuerpo_invalido" }, 400);

    const resultado = await ejecutar({
      agente: id.data,
      orgId: ctx.orgId,
      proyectoId: entrada.data.proyectoId,
      pregunta: entrada.data.pregunta,
      locale: entrada.data.locale,
    });
    return json({ resultado }, 200);
  };
}
