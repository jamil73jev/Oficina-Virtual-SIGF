import {
  crearManejadoresAprobaciones,
  identidadPendiente,
  obtenerServicioAprobaciones,
} from "@/core/approvals";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return crearManejadoresAprobaciones({
    servicio: obtenerServicioAprobaciones(),
    identidad: identidadPendiente,
  }).decidir(req, id);
}
