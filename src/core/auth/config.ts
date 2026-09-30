/**
 * Configuracion de autenticacion leida del entorno. Funciones PURAS (reciben el entorno)
 * para poder probarlas sin tocar process.env. Ningun valor secreto pasa por aqui: solo la
 * URL y la clave anonima (publicas por diseno) de Supabase.
 */

export type Entorno = Readonly<Record<string, string | undefined>>;

export type ModoAutenticacion = "supabase" | "desarrollo";

const enVercel = (env: Entorno) => Boolean(env.VERCEL_ENV?.trim());
const enProduccion = (env: Entorno) => env.NODE_ENV === "production";

/**
 * UNICO punto de eleccion del modo de autenticacion.
 * - AUTENTICACION=supabase: siempre Supabase.
 * - AUTENTICACION=desarrollo: identidad de desarrollo (con todas sus guardas); PROHIBIDA
 *   con VERCEL_ENV o NODE_ENV=production (lanza: falla ruidosamente, nunca se degrada).
 * - Sin valor: supabase en Vercel o produccion; desarrollo en development/test.
 * - Cualquier otro valor lanza (un error tipografico no debe abrir un modo inesperado).
 */
export function modoAutenticacion(env: Entorno): ModoAutenticacion {
  const valor = env.AUTENTICACION?.trim().toLowerCase() ?? "";
  if (valor === "supabase") return "supabase";
  if (valor === "desarrollo") {
    if (enVercel(env) || enProduccion(env)) {
      throw new Error(
        "AUTENTICACION=desarrollo esta prohibida en Vercel o produccion: use AUTENTICACION=supabase",
      );
    }
    return "desarrollo";
  }
  if (valor === "") return enVercel(env) || enProduccion(env) ? "supabase" : "desarrollo";
  throw new Error("AUTENTICACION tiene un valor no reconocido (use supabase o desarrollo)");
}

/**
 * MFA obligatoria: MFA_OBLIGATORIA=true|false; por defecto true en Vercel o produccion.
 * Aunque sea false, un usuario con un factor verificado SIEMPRE necesita AAL2.
 */
export function mfaObligatoria(env: Entorno): boolean {
  const valor = env.MFA_OBLIGATORIA?.trim().toLowerCase();
  if (valor === "true") return true;
  if (valor === "false") return false;
  return enVercel(env) || enProduccion(env);
}

/** Lista de correos admitidos (CORREOS_PERMITIDOS, separada por comas). Vacia = nadie entra. */
export function correosPermitidos(env: Entorno): ReadonlySet<string> {
  return new Set(
    (env.CORREOS_PERMITIDOS ?? "")
      .split(",")
      .map((c) => normalizarCorreo(c))
      .filter((c) => c.length > 0),
  );
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function correoPermitido(correo: string | null | undefined, permitidos: ReadonlySet<string>): boolean {
  if (!correo) return false;
  return permitidos.has(normalizarCorreo(correo));
}

export interface ConfigSupabasePublica {
  url: string;
  claveAnonima: string;
}

/**
 * URL y clave anonima de Supabase (NEXT_PUBLIC_*). Null si faltan o la URL no es https:
 * sin configuracion no hay sesion posible (se trata como no autenticado, nunca como abierto).
 */
export function configSupabasePublica(env: Entorno): ConfigSupabasePublica | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const claveAnonima = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !claveAnonima) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return { url: u.origin, claveAnonima };
  } catch {
    return null;
  }
}
