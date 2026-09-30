import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresOperaciones, obtenerServicioOperaciones } from "@/modules/operaciones";

export const GET = conAutenticacion(async (req: Request, ctx: { params: Promise<{ id: string; secuencia: string }> }) => {
  const { id, secuencia } = await ctx.params;
  return crearManejadoresOperaciones({
    servicio: obtenerServicioOperaciones(),
    identidad: obtenerProveedorIdentidad(),
  }).evento(req, id, secuencia);
});
