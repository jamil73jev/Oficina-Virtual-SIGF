import { crearManejadoresAprobaciones, obtenerServicioAprobaciones } from "@/core/approvals";
import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";

const manejadores = () =>
  crearManejadoresAprobaciones({
    servicio: obtenerServicioAprobaciones(),
    identidad: obtenerProveedorIdentidad(),
  });

export const GET = conAutenticacion(async (req: Request) => {
  return manejadores().listar(req);
});
