import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresDocumentos, obtenerServicioDocumentos } from "@/modules/documentos";

const manejadores = () => crearManejadoresDocumentos({
  servicio: obtenerServicioDocumentos(),
  identidad: identidadPendiente,
});

export const GET = (req: Request) => manejadores().listar(req);
export const POST = (req: Request) => manejadores().subir(req);

