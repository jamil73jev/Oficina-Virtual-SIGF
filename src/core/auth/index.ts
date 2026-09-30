/**
 * Autenticacion (Supabase Auth + MFA TOTP + membresia). Este barril NO importa next/headers:
 * lo usan las rutas api y el proxy. Server components: ./pagina; acciones: ./acciones.
 */
export * from "./config";
export * from "./errores";
export * from "./membresias";
export * from "./resolver";
export * from "./rutas";
export {
  crearProveedorIdentidadSupabase,
  depsSupabaseReales,
  modoAutenticacionActual,
  obtenerProveedorIdentidad,
  obtenerResolutorSesion,
  resolverIdentidadSupabase,
  type DepsProveedorSupabase,
  type ResolutorSesion,
} from "./proveedor";
export {
  almacenDePeticion,
  ConfigSupabaseAusenteError,
  cookiesDePeticion,
  crearClienteSupabaseServidor,
  type AlmacenCookies,
} from "./supabase-servidor";
