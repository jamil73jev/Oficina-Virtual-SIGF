import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadorDemoAgente } from "@/modules/agentes-ui";

export const POST = conAutenticacion(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return crearManejadorDemoAgente({ identidad: obtenerProveedorIdentidad() })(req, id);
});
