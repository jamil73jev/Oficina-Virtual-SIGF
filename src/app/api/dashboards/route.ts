import { identidadPendiente } from "@/core/approvals";
import {
  crearManejadoresDashboards,
  obtenerServicioDashboards,
} from "@/modules/dashboards";

const manejadores = () =>
  crearManejadoresDashboards({
    servicio: obtenerServicioDashboards(),
    identidad: identidadPendiente,
  });

export async function GET(req: Request) {
  return manejadores().resumen(req);
}
