"use server";

import { redirect } from "next/navigation";
import { isLocale, locales, defaultLocale, type Locale } from "@/core/i18n/config";
import { configSupabasePublica, mfaObligatoria } from "./config";
import {
  cerrarSesionSilenciosa,
  EntradaLogin,
  flujoConfirmacion,
  flujoDesafio,
  flujoInicioInscripcion,
  flujoLogin,
} from "./flujos";
import { almacenCookiesNext } from "./pagina";
import { modoAutenticacionActual, obtenerResolutorSesion } from "./proveedor";
import { destinoSeguro, RUTA_DESAFIO_MFA, RUTA_INSCRIBIR_MFA, RUTA_LOGIN } from "./rutas";
import { crearClienteSupabaseServidor } from "./supabase-servidor";
import type {
  EstadoConfirmacion,
  EstadoDesafio,
  EstadoLogin,
  ResultadoInicioInscripcion,
  SesionVisible,
} from "./tipos-acciones";

/**
 * Acciones de servidor de autenticacion. Corren SIEMPRE en el servidor con la clave anonima
 * y las cookies httpOnly de la sesion: el navegador nunca habla con Supabase ni ve tokens.
 * Next valida el Origin de las acciones (proteccion CSRF). redirect() va fuera de try/catch.
 */

const leerLocale = (formData: FormData): Locale => {
  const l = formData.get("locale");
  return typeof l === "string" && isLocale(l) ? l : defaultLocale;
};

const texto = (formData: FormData, campo: string): string => {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
};

async function clienteAccion() {
  return crearClienteSupabaseServidor(await almacenCookiesNext());
}

const supabaseDisponible = () =>
  modoAutenticacionActual() === "supabase" && configSupabasePublica(process.env) !== null;

export async function iniciarSesion(_previo: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const locale = leerLocale(formData);
  if (modoAutenticacionActual() === "desarrollo") return { error: "desarrollo" };
  if (!configSupabasePublica(process.env)) return { error: "servicio" };
  const entrada = EntradaLogin.safeParse({ correo: texto(formData, "correo"), contrasena: texto(formData, "contrasena") });
  if (!entrada.success) return { error: "datos" };

  const r = await flujoLogin(await clienteAccion(), entrada.data, process.env);
  if (!r.ok) return { error: r.error };

  const destino = destinoSeguro(texto(formData, "siguiente"), locale, locales);
  if (r.tieneFactor) redirect(`/${locale}${RUTA_DESAFIO_MFA}?siguiente=${encodeURIComponent(destino)}`);
  if (mfaObligatoria(process.env)) redirect(`/${locale}${RUTA_INSCRIBIR_MFA}`);
  redirect(destino);
}

export async function verificarDesafioMfa(_previo: EstadoDesafio, formData: FormData): Promise<EstadoDesafio> {
  const locale = leerLocale(formData);
  if (!supabaseDisponible()) return { error: "desarrollo" };
  const r = await flujoDesafio(await clienteAccion(), texto(formData, "codigo"), process.env);
  if (!r.ok) {
    if (r.error === "sin_sesion") redirect(`/${locale}${RUTA_LOGIN}`);
    return { error: r.error };
  }
  redirect(destinoSeguro(texto(formData, "siguiente"), locale, locales));
}

export async function iniciarInscripcionMfa(): Promise<ResultadoInicioInscripcion> {
  if (!supabaseDisponible()) return { ok: false, error: "desarrollo" };
  return flujoInicioInscripcion(await clienteAccion(), process.env);
}

export async function confirmarInscripcionMfa(
  _previo: EstadoConfirmacion,
  formData: FormData,
): Promise<EstadoConfirmacion> {
  if (!supabaseDisponible()) return { ok: false, error: "desarrollo" };
  const r = await flujoConfirmacion(
    await clienteAccion(),
    texto(formData, "factorId"),
    texto(formData, "codigo"),
    process.env,
  );
  return r.ok ? { ok: true, error: null } : { ok: false, error: r.error };
}

export async function cerrarSesion(formData: FormData): Promise<void> {
  const locale = leerLocale(formData);
  if (supabaseDisponible()) await cerrarSesionSilenciosa(await clienteAccion());
  redirect(`/${locale}${RUTA_LOGIN}`);
}

/** Correo y rol del usuario actual para el menu (solo los datos propios; null sin identidad). */
export async function obtenerSesionVisible(): Promise<SesionVisible | null> {
  try {
    const r = await obtenerResolutorSesion()(await almacenCookiesNext());
    return r.ok ? { correo: r.correo, rol: r.ctx.rol } : null;
  } catch {
    return null;
  }
}
