import { identidadPendiente, type ProveedorIdentidad } from "@/core/approvals/http";
import {
  correosPermitidos,
  mfaObligatoria,
  modoAutenticacion,
  type Entorno,
  type ModoAutenticacion,
} from "./config";
import { ErrorIdentidad } from "./errores";
import { obtenerMembresiasRepo } from "./fabrica";
import type { MembresiasRepo } from "./membresias";
import { resolverIdentidad, type ClienteAuthServidor, type ResultadoIdentidad } from "./resolver";
import {
  almacenDePeticion,
  ConfigSupabaseAusenteError,
  crearClienteSupabaseServidor,
  type AlmacenCookies,
} from "./supabase-servidor";

export interface DepsProveedorSupabase {
  crearCliente: (almacen: AlmacenCookies) => ClienteAuthServidor;
  membresias: MembresiasRepo;
  entorno: Entorno;
}

/** Resuelve la identidad a partir de las cookies (paginas, acciones y rutas). */
export type ResolutorSesion = (almacen: AlmacenCookies) => Promise<ResultadoIdentidad>;

let avisoConfig = false;

/**
 * Resuelve la identidad Supabase a partir de un almacen de cookies. Sin configuracion de
 * Supabase se trata como "sin sesion" (falla cerrado) y se avisa una vez, sin secretos.
 */
export async function resolverIdentidadSupabase(
  almacen: AlmacenCookies,
  deps: DepsProveedorSupabase,
): Promise<ResultadoIdentidad> {
  let cliente: ClienteAuthServidor;
  try {
    cliente = deps.crearCliente(almacen);
  } catch (e) {
    if (!(e instanceof ConfigSupabaseAusenteError)) throw e;
    if (!avisoConfig) {
      avisoConfig = true;
      console.error("[auth] Supabase no configurado: todas las peticiones se tratan como no autenticadas");
    }
    return { ok: false, codigo: "no_autenticado", tieneFactor: false };
  }
  return resolverIdentidad(cliente, {
    membresias: deps.membresias,
    correosPermitidos: correosPermitidos(deps.entorno),
    mfaObligatoria: mfaObligatoria(deps.entorno),
  });
}

/** Adapta un resolutor al contrato ProveedorIdentidad de los handlers existentes. */
function proveedorDesdeResolutor(resolver: ResolutorSesion): ProveedorIdentidad {
  return async (req) => {
    const r = await resolver(almacenDePeticion(req));
    if (r.ok) return r.ctx;
    if (r.codigo === "no_autenticado") return null;
    throw new ErrorIdentidad(r.codigo);
  };
}

/**
 * Proveedor de identidad Supabase para route handlers: null = sin sesion (los handlers
 * responden 401 no_autenticado); con sesion insuficiente lanza ErrorIdentidad
 * (mfa_requerida 401, correo_no_permitido 403, sin_membresia 403), que conAutenticacion
 * convierte en JSON.
 */
export function crearProveedorIdentidadSupabase(deps: DepsProveedorSupabase): ProveedorIdentidad {
  return proveedorDesdeResolutor((almacen) => resolverIdentidadSupabase(almacen, deps));
}

/** Dependencias reales (cliente @supabase/ssr + membresias en Postgres, carga perezosa). */
export function depsSupabaseReales(): DepsProveedorSupabase {
  return {
    crearCliente: (almacen) => crearClienteSupabaseServidor(almacen),
    membresias: obtenerMembresiasRepo(),
    entorno: process.env,
  };
}

/** La identidad de desarrollo no depende de la peticion (identidadPendiente la ignora). */
const PETICION_VACIA = () => new Request("http://localhost/");

const resolutorDesarrollo: ResolutorSesion = async () => {
  const ctx = await identidadPendiente(PETICION_VACIA());
  return ctx
    ? { ok: true, ctx, correo: null, tieneFactor: false }
    : { ok: false, codigo: "no_autenticado", tieneFactor: false };
};

/**
 * UNICO punto de eleccion de la autenticacion. AUTENTICACION=supabase (por defecto en Vercel
 * o produccion) usa Supabase; en development/test se conserva la identidad de desarrollo con
 * TODAS sus guardas (identidadPendiente), que no puede activarse en Vercel ni en produccion.
 */
function eleccion(): { modo: ModoAutenticacion; proveedor: ProveedorIdentidad; resolutor: ResolutorSesion } {
  const modo = modoAutenticacion(process.env);
  if (modo === "desarrollo") {
    return { modo, proveedor: identidadPendiente, resolutor: resolutorDesarrollo };
  }
  const deps = depsSupabaseReales();
  const resolutor: ResolutorSesion = (almacen) => resolverIdentidadSupabase(almacen, deps);
  return { modo, proveedor: proveedorDesdeResolutor(resolutor), resolutor };
}

/** Proveedor de identidad de las rutas api (se inyecta en los handlers). */
export function obtenerProveedorIdentidad(): ProveedorIdentidad {
  return eleccion().proveedor;
}

/** Resolutor para server components y server actions (mismo proveedor, desde cookies). */
export function obtenerResolutorSesion(): ResolutorSesion {
  return eleccion().resolutor;
}

export function modoAutenticacionActual(): ModoAutenticacion {
  return eleccion().modo;
}
