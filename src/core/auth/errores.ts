/** Motivos por los que una peticion con sesion NO obtiene identidad (ademas de "sin sesion"). */
export type CodigoIdentidad =
  | "no_autenticado"
  | "mfa_requerida"
  | "sin_membresia"
  | "correo_no_permitido";

export const ESTADO_HTTP_IDENTIDAD: Readonly<Record<CodigoIdentidad, 401 | 403>> = {
  no_autenticado: 401,
  mfa_requerida: 401,
  sin_membresia: 403,
  correo_no_permitido: 403,
};

/**
 * La lanza el proveedor de identidad cuando hay sesion pero no basta (MFA pendiente, correo
 * no admitido o sin membresia). Los handlers existentes solo distinguen null (401); el
 * envoltorio de las rutas (conAutenticacion) la convierte en la respuesta JSON adecuada.
 */
export class ErrorIdentidad extends Error {
  readonly status: 401 | 403;
  constructor(readonly codigo: CodigoIdentidad) {
    super(`Identidad rechazada: ${codigo}`);
    this.name = "ErrorIdentidad";
    this.status = ESTADO_HTTP_IDENTIDAD[codigo];
  }
}

export function respuestaErrorIdentidad(codigo: CodigoIdentidad): Response {
  return Response.json(
    { error: codigo },
    { status: ESTADO_HTTP_IDENTIDAD[codigo], headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Envuelve un handler de ruta: un ErrorIdentidad lanzado por el proveedor se responde como
 * JSON 401/403 con su codigo; cualquier otro error se propaga sin cambios.
 */
export function conAutenticacion<A extends unknown[]>(
  handler: (...args: A) => Response | Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ErrorIdentidad) return respuestaErrorIdentidad(e.codigo);
      throw e;
    }
  };
}
