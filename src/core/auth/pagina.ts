import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ContextoAcceso } from "@/core/rbac";
import { obtenerResolutorSesion } from "./proveedor";
import type { ResultadoIdentidad } from "./resolver";
import { rutaTrasRechazo } from "./rutas";
import type { AlmacenCookies } from "./supabase-servidor";

/**
 * Almacen de cookies de Next (next/headers). En server actions setAll escribe de verdad; en
 * el render de un server component cookies().set lanza y el cliente lo ignora (el proxy
 * renueva la sesion).
 */
export async function almacenCookiesNext(): Promise<AlmacenCookies> {
  const almacen = await cookies();
  return {
    getAll: () => almacen.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (lista) => {
      for (const { name, value, options } of lista) almacen.set(name, value, options);
    },
  };
}

/**
 * Identidad de la peticion actual para server components, deduplicada por render con cache().
 * cookies() va PRIMERO: marca la ruta como dinamica antes de tocar Supabase o el entorno.
 */
export const resolverSesionPagina = cache(async (): Promise<ResultadoIdentidad> => {
  const almacen = await almacenCookiesNext();
  return obtenerResolutorSesion()(almacen);
});

export interface SesionPagina {
  ctx: ContextoAcceso;
  correo: string | null;
}

/**
 * Exige identidad completa en una pagina de la oficina. Sin sesion redirige al login del
 * locale; con MFA pendiente, al desafio o a la inscripcion; sin membresia o con correo no
 * admitido, a /seguridad/sin-acceso.
 */
export async function exigirIdentidadPagina(locale: string): Promise<SesionPagina> {
  const r = await resolverSesionPagina();
  if (!r.ok) redirect(rutaTrasRechazo(r.codigo, r.tieneFactor, locale));
  return { ctx: r.ctx, correo: r.correo };
}
