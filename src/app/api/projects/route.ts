import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresProyectos, obtenerServicioProyectos } from "@/modules/proyectos";

const m = () =>
  crearManejadoresProyectos({
    servicio: obtenerServicioProyectos(),
    identidad: obtenerProveedorIdentidad(),
  });

export const GET = conAutenticacion((req: Request) => m().listarProyectos(req));
export const POST = conAutenticacion((req: Request) => m().crearProyecto(req));
