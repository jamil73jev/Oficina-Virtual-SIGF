import { after } from "next/server";
import { identidadPendiente } from "@/core/approvals";
import { crearManejadoresOperaciones, obtenerServicioOperaciones } from "@/modules/operaciones";

export async function POST(req: Request) {
  return crearManejadoresOperaciones({
    servicio: obtenerServicioOperaciones(),
    identidad: identidadPendiente,
    // La operacion corre despues de enviar el 202 (after de next/server).
    programar: (trabajo) => after(trabajo),
  }).crear(req);
}
