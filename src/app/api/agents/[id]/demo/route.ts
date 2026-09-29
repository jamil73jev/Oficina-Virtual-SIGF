import { identidadPendiente } from "@/core/approvals";
import { crearManejadorDemoAgente } from "@/modules/agentes-ui";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return crearManejadorDemoAgente({ identidad: identidadPendiente })(req, id);
}

