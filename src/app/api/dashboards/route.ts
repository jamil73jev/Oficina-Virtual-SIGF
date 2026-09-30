import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import {
  crearManejadoresDashboards,
  obtenerServicioDashboards,
} from "@/modules/dashboards";

const manejadores = () =>
  crearManejadoresDashboards({
    servicio: obtenerServicioDashboards(),
    identidad: obtenerProveedorIdentidad(),
  });

export const GET = conAutenticacion(async (req: Request) => {
  return manejadores().resumen(req);
});
