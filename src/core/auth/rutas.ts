/**
 * Decisiones de enrutado de la autenticacion: funciones PURAS (sin Next ni Supabase) que usan
 * el proxy, las paginas y las acciones. El proxy es solo una comprobacion optimista; la
 * autorizacion real la repiten las paginas y las rutas api con el proveedor de identidad.
 */

export const RUTA_LOGIN = "/login";
export const RUTA_DESAFIO_MFA = "/login/mfa";
export const RUTA_INSCRIBIR_MFA = "/seguridad/mfa";
export const RUTA_SIN_ACCESO = "/seguridad/sin-acceso";

export interface EstadoSesionProxy {
  /** Usuario validado con getUser(). */
  autenticado: boolean;
  /** Hace falta AAL2 y la sesion aun es AAL1. */
  mfaPendiente: boolean;
  /** Tiene un factor verificado (desafio) o no (inscripcion). */
  tieneFactor: boolean;
}

export type DecisionProxy = { tipo: "continuar" } | { tipo: "redirigir"; destino: string };

const CONTINUAR: DecisionProxy = { tipo: "continuar" };

/** Estaticos y recursos internos: nunca se redirigen. */
export function esRecursoEstatico(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.[a-z0-9]{2,5}$/i.test(pathname)
  );
}

export function esRutaApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Separa el locale del resto de la ruta (locale null si el primer segmento no lo es). */
export function separarLocale(
  pathname: string,
  locales: readonly string[],
): { locale: string | null; resto: string } {
  const partes = pathname.split("/").filter(Boolean);
  const primero = partes[0];
  if (primero && locales.includes(primero)) {
    return { locale: primero, resto: "/" + partes.slice(1).join("/") };
  }
  return { locale: null, resto: "/" + partes.join("/") };
}

const coincide = (resto: string, ruta: string) => resto === ruta || resto.startsWith(ruta + "/");

/** Rutas de autenticacion accesibles sin sesion completa (login, desafio MFA, seguridad). */
export function esRutaPublica(resto: string): boolean {
  return coincide(resto, RUTA_LOGIN) || coincide(resto, "/seguridad");
}

/**
 * Destino interno seguro para volver tras el login: SOLO rutas del propio sitio bajo un
 * locale conocido (sin esquema, sin "//", sin barras invertidas ni caracteres de control)
 * y nunca otra ruta de autenticacion. Cualquier otra cosa vuelve a la portada del locale.
 */
export function destinoSeguro(
  crudo: string | null | undefined,
  locale: string,
  locales: readonly string[],
): string {
  const portada = `/${locale}`;
  if (!crudo || crudo.length > 512) return portada;
  if (!crudo.startsWith("/") || crudo.startsWith("//")) return portada;
  if (/[\\\u0000-\u001f\u007f]/.test(crudo)) return portada;
  let url: URL;
  try {
    url = new URL(crudo, "http://interno.invalid");
  } catch {
    return portada;
  }
  if (url.origin !== "http://interno.invalid") return portada;
  const { locale: l, resto } = separarLocale(url.pathname, locales);
  if (!l || esRutaPublica(resto)) return portada;
  return `${url.pathname}${url.search}`;
}

/**
 * Decision del proxy para una ruta:
 * - /api/* nunca se redirige (responde 401/403 JSON el propio handler);
 * - estaticos y la raiz "/" (redirige al locale por defecto) pasan;
 * - login, desafio MFA y /seguridad pasan (cada pagina comprueba lo suyo); con la sesion
 *   completa, /login lleva a la portada;
 * - el resto (la oficina) exige sesion: sin ella, al login del locale con ?siguiente=;
 *   con MFA pendiente, al desafio (si hay factor) o a la inscripcion (si no lo hay).
 */
export function decidirRuta(
  pathname: string,
  sesion: EstadoSesionProxy,
  locales: readonly string[],
  localePorDefecto: string,
): DecisionProxy {
  if (esRutaApi(pathname) || esRecursoEstatico(pathname) || pathname === "/") return CONTINUAR;

  const { locale, resto } = separarLocale(pathname, locales);
  const l = locale ?? localePorDefecto;

  if (esRutaPublica(resto)) {
    if (resto === RUTA_LOGIN && sesion.autenticado && !sesion.mfaPendiente) {
      return { tipo: "redirigir", destino: `/${l}` };
    }
    return CONTINUAR;
  }

  if (!sesion.autenticado) {
    const siguiente = locale ? `?siguiente=${encodeURIComponent(pathname)}` : "";
    return { tipo: "redirigir", destino: `/${l}${RUTA_LOGIN}${siguiente}` };
  }
  if (sesion.mfaPendiente) {
    return {
      tipo: "redirigir",
      destino: `/${l}${sesion.tieneFactor ? RUTA_DESAFIO_MFA : RUTA_INSCRIBIR_MFA}`,
    };
  }
  return CONTINUAR;
}

/** Adonde enviar a quien no obtiene identidad en una pagina (segun el motivo). */
export function rutaTrasRechazo(
  codigo: "no_autenticado" | "mfa_requerida" | "sin_membresia" | "correo_no_permitido",
  tieneFactor: boolean,
  locale: string,
): string {
  switch (codigo) {
    case "no_autenticado":
      return `/${locale}${RUTA_LOGIN}`;
    case "mfa_requerida":
      return `/${locale}${tieneFactor ? RUTA_DESAFIO_MFA : RUTA_INSCRIBIR_MFA}`;
    default:
      return `/${locale}${RUTA_SIN_ACCESO}`;
  }
}
