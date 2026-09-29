import {
  crearManejadoresAprobaciones,
  identidadPendiente,
  obtenerServicioAprobaciones,
} from "@/core/approvals";

const manejadores = () =>
  crearManejadoresAprobaciones({
    servicio: obtenerServicioAprobaciones(),
    identidad: identidadPendiente,
  });

export async function GET(req: Request) {
  return manejadores().listar(req);
}
