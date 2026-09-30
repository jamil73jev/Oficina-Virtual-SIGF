import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresOperaciones, obtenerServicioOperaciones } from "@/modules/operaciones";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; secuencia: string }> }) {
  const { id, secuencia } = await ctx.params;
  return crearManejadoresOperaciones({
    servicio: obtenerServicioOperaciones(),
    identidad: identidadPendiente,
  }).evento(req, id, secuencia);
}
