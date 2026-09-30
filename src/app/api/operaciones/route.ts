import { after } from "next/server";
import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadoresOperaciones, obtenerServicioOperaciones } from "@/modules/operaciones";

export const POST = conAutenticacion(async (req: Request) => {
  return crearManejadoresOperaciones({
    servicio: obtenerServicioOperaciones(),
    identidad: obtenerProveedorIdentidad(),
    // La operacion corre despues de enviar el 202 (after de next/server).
    programar: (trabajo) => after(trabajo),
  }).crear(req);
});
