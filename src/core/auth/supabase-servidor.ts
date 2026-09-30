import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configSupabasePublica, type ConfigSupabasePublica } from "./config";

/**
 * Cliente de Supabase para el SERVIDOR con @supabase/ssr. Usa SOLO la URL y la clave
 * anonima (publicas): la service role nunca se usa en la aplicacion (solo en
 * scripts/alta-organizacion.mjs). Se crea un cliente nuevo por peticion.
 */

export interface CookieEntrante {
  name: string;
  value: string;
}

export interface CookieSaliente extends CookieEntrante {
  options: CookieOptions;
}

/**
 * Adaptador de cookies comun a server components, route handlers, server actions y proxy.
 * - getAll: cookies de la peticion.
 * - setAll: escribe las cookies renovadas; opcional donde no se puede (server components y
 *   route handlers: el proxy ya renueva la sesion antes de llegar ahi).
 */
export interface AlmacenCookies {
  getAll(): CookieEntrante[];
  setAll?(cookies: CookieSaliente[], cabeceras: Record<string, string>): void;
}

export class ConfigSupabaseAusenteError extends Error {
  constructor() {
    super("Supabase no esta configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    this.name = "ConfigSupabaseAusenteError";
  }
}

export function crearClienteSupabaseServidor(
  almacen: AlmacenCookies,
  config: ConfigSupabasePublica | null = configSupabasePublica(process.env),
): SupabaseClient {
  if (!config) throw new ConfigSupabaseAusenteError();
  return createServerClient(config.url, config.claveAnonima, {
    cookies: {
      getAll: () => almacen.getAll(),
      // Sin setAll disponible (render de un server component) se ignora la escritura: el
      // proxy es quien renueva y reescribe las cookies de sesion.
      setAll: (cookies, cabeceras) => {
        try {
          almacen.setAll?.(cookies, cabeceras);
        } catch {
          // cookies() de Next lanza al escribir durante el render: ignorado a proposito.
        }
      },
    },
    auth: { flowType: "pkce", detectSessionInUrl: false },
  });
}

/** Parsea la cabecera Cookie de una Request (route handlers y pruebas). */
export function cookiesDePeticion(req: Request): CookieEntrante[] {
  const cabecera = req.headers.get("cookie");
  if (!cabecera) return [];
  const salida: CookieEntrante[] = [];
  for (const parte of cabecera.split(";")) {
    const i = parte.indexOf("=");
    if (i <= 0) continue;
    const name = parte.slice(0, i).trim();
    const crudo = parte.slice(i + 1).trim();
    let value = crudo;
    try {
      value = decodeURIComponent(crudo);
    } catch {
      // valor no codificado: se usa tal cual
    }
    if (name) salida.push({ name, value });
  }
  return salida;
}

/** Almacen de solo lectura a partir de la peticion (route handlers). */
export function almacenDePeticion(req: Request): AlmacenCookies {
  const cookies = cookiesDePeticion(req);
  return { getAll: () => cookies };
}
