import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresDocumentos, obtenerServicioDocumentos } from "@/modules/documentos";

export const POST = conAutenticacion(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return crearManejadoresDocumentos({
    servicio: obtenerServicioDocumentos(),
    identidad: obtenerProveedorIdentidad(),
  }).versionar(req, id);
});
