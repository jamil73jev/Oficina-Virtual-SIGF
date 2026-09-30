import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadorConsultaLocal } from "@/modules/agentes-ui";

export const POST = conAutenticacion(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return crearManejadorConsultaLocal({ identidad: obtenerProveedorIdentidad() })(req, id);
});
