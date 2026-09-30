import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresProyectos, obtenerServicioProyectos } from "@/modules/proyectos";

const m = () =>
  crearManejadoresProyectos({
    servicio: obtenerServicioProyectos(),
    identidad: obtenerProveedorIdentidad(),
  });

export const GET = conAutenticacion(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return m().obtenerProyecto(req, id);
});
