import { crearManejadoresAprobaciones, obtenerServicioAprobaciones } from "@/core/approvals";
import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";

export const POST = conAutenticacion(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = await ctx.params;
  return crearManejadoresAprobaciones({
    servicio: obtenerServicioAprobaciones(),
    identidad: obtenerProveedorIdentidad(),
  }).decidir(req, id);
});
