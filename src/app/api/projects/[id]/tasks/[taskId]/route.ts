import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresProyectos, obtenerServicioProyectos } from "@/modules/proyectos";

const m = () =>
  crearManejadoresProyectos({
    servicio: obtenerServicioProyectos(),
    identidad: obtenerProveedorIdentidad(),
  });

export const PATCH = conAutenticacion(async (req: Request, ctx: { params: Promise<{ id: string; taskId: string }> }) => {
  const { taskId } = await ctx.params;
  return m().actualizarTarea(req, taskId);
});
