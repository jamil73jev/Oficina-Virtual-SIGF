import { conAutenticacion, obtenerProveedorIdentidad } from "@/core/auth";
import { crearManejadorEstadoModeloLocal } from "@/modules/agentes-ui";

/**
 * Estado del modelo configurado. Exige sesion: antes era publica y cada visita anonima podia
 * disparar una peticion saliente al servidor de modelos (hallazgo de la revision de seguridad).
 */
export const GET = conAutenticacion(async (req: Request) => {
  const ctx = await obtenerProveedorIdentidad()(req);
  if (!ctx) {
    return Response.json({ error: "no_autenticado" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return crearManejadorEstadoModeloLocal()();
});
