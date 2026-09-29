import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresDocumentos, obtenerServicioDocumentos } from "@/modules/documentos";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return crearManejadoresDocumentos({
    servicio: obtenerServicioDocumentos(),
    identidad: identidadPendiente,
  }).versionar(req, id);
}

