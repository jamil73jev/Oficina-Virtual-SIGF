import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresProyectos, obtenerServicioProyectos } from "@/modules/proyectos";

const m = () =>
  crearManejadoresProyectos({
    servicio: obtenerServicioProyectos(),
    identidad: identidadPendiente,
  });

export const GET = (req: Request) => m().listarProyectos(req);
export const POST = (req: Request) => m().crearProyecto(req);
