import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresOperaciones, obtenerServicioOperaciones } from "@/modules/operaciones";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return crearManejadoresOperaciones({
    servicio: obtenerServicioOperaciones(),
    identidad: identidadPendiente,
  }).eventos(req, id);
}
