import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresDocumentos, obtenerServicioDocumentos } from "@/modules/documentos";

export const GET = conAutenticacion(async (
  req: Request,
  ctx: { params: Promise<{ id: string; version: string }> },
) => {
  const { id, version } = await ctx.params;
  return crearManejadoresDocumentos({
    servicio: obtenerServicioDocumentos(),
    identidad: obtenerProveedorIdentidad(),
  }).leerVersion(req, id, version);
});
