/** Logica pura del tema (claro / oscuro / sistema). Sin React: se prueba en Node. */

export type PreferenciaTema = "light" | "dark" | "system";
export type TemaResuelto = "light" | "dark";

export const CLAVE_TEMA = "ov-theme";
export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ["light", "dark", "system"];

export function esPreferenciaTema(v: unknown): v is PreferenciaTema {
  return typeof v === "string" && (PREFERENCIAS_TEMA as readonly string[]).includes(v);
}

/** Cualquier valor invalido o ausente equivale a "sistema". */
export function normalizarPreferencia(v: unknown): PreferenciaTema {
  return esPreferenciaTema(v) ? v : "system";
}

export function resolverTema(pref: PreferenciaTema, sistemaOscuro: boolean): TemaResuelto {
  if (pref === "system") return sistemaOscuro ? "dark" : "light";
  return pref;
}

type AlmacenLectura = Pick<Storage, "getItem">;
type AlmacenEscritura = Pick<Storage, "setItem" | "removeItem">;

/** Lee la preferencia guardada; el almacenamiento puede lanzar (modo privado, bloqueado). */
export function leerPreferencia(almacen: AlmacenLectura | null | undefined): PreferenciaTema {
  try {
    return normalizarPreferencia(almacen?.getItem(CLAVE_TEMA));
  } catch {
    return "system";
  }
}

export function guardarPreferencia(almacen: AlmacenEscritura | null | undefined, pref: PreferenciaTema): void {
  try {
    if (pref === "system") almacen?.removeItem(CLAVE_TEMA);
    else almacen?.setItem(CLAVE_TEMA, pref);
  } catch {
    /* sin persistencia: el tema sigue aplicandose en esta sesion */
  }
}

export interface RaizTema {
  setAttribute(nombre: string, valor: string): void;
  style: { colorScheme: string };
}

export function aplicarTema(raiz: RaizTema, tema: TemaResuelto): void {
  raiz.setAttribute("data-theme", tema);
  raiz.style.colorScheme = tema;
}

/**
 * Script en linea que se ejecuta de forma sincrona en <head>, antes del primer pintado, para
 * fijar data-theme sin parpadeo. Debe ser autocontenido (no puede importar nada).
 */
export const SCRIPT_TEMA = `(function(){try{var p=null;try{p=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)})}catch(e){}if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;var t=d?"dark":"light";r.setAttribute("data-theme",t);r.style.colorScheme=t}catch(e){}})();`;

/** Enlace activo: el pathname llega con el locale (/es/proyectos). */
export function quitarLocale(pathname: string, locales: readonly string[]): string {
  const partes = pathname.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  if (partes.length && locales.includes(partes[0]!)) partes.shift();
  return "/" + partes.join("/");
}

export function esRutaActiva(pathname: string, href: string, locales: readonly string[]): boolean {
  const ruta = quitarLocale(pathname, locales);
  const destino = quitarLocale(href, locales);
  if (destino === "/") return ruta === "/";
  return ruta === destino || ruta.startsWith(destino + "/");
}
