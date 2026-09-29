import { identidadPendiente } from "@/core/approvals";
import { crearManejadorConsultaLocal } from "@/modules/agentes-ui";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return crearManejadorConsultaLocal({ identidad: identidadPendiente })(req, id);
}

