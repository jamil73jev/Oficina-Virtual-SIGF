import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresDocumentos, obtenerServicioDocumentos } from "@/modules/documentos";

const manejadores = () => crearManejadoresDocumentos({
  servicio: obtenerServicioDocumentos(),
  identidad: obtenerProveedorIdentidad(),
});

export const GET = conAutenticacion((req: Request) => manejadores().listar(req));
export const POST = conAutenticacion((req: Request) => manejadores().subir(req));

