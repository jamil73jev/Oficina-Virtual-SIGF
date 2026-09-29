import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresDocumentos, obtenerServicioDocumentos } from "@/modules/documentos";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version } = await ctx.params;
  return crearManejadoresDocumentos({
    servicio: obtenerServicioDocumentos(),
    identidad: identidadPendiente,
  }).leerVersion(req, id, version);
}

