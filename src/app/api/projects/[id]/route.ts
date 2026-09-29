import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresProyectos, obtenerServicioProyectos } from "@/modules/proyectos";

const m = () =>
  crearManejadoresProyectos({
    servicio: obtenerServicioProyectos(),
    identidad: identidadPendiente,
  });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return m().obtenerProyecto(req, id);
}
