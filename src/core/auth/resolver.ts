import type { ContextoAcceso } from "@/core/rbac";
import { correoPermitido } from "./config";
import type { CodigoIdentidad } from "./errores";
import { membresiaActiva, type MembresiasRepo } from "./membresias";

/**
 * Subconjunto del cliente de Supabase que usa la autenticacion del servidor. El cliente real
 * (SupabaseClient) lo cumple; las pruebas inyectan uno FALSO sin red.
 */
export interface FactorAuth {
  id: string;
  factor_type: string;
  status: string;
}

export interface UsuarioAuth {
  id: string;
  email?: string | null;
  factors?: readonly FactorAuth[] | null;
}

export interface ClienteAuthServidor {
  auth: {
    getUser(): Promise<{ data: { user: UsuarioAuth | null }; error: unknown }>;
    mfa: {
      getAuthenticatorAssuranceLevel(): Promise<{
        data: { currentLevel: string | null; nextLevel: string | null } | null;
        error: unknown;
      }>;
    };
  };
}

export interface DepsResolver {
  membresias: MembresiasRepo;
  correosPermitidos: ReadonlySet<string>;
  mfaObligatoria: boolean;
}

export type ResultadoIdentidad =
  /** correo null solo con la identidad de desarrollo (no tiene correo). */
  | { ok: true; ctx: ContextoAcceso; correo: string | null; tieneFactor: boolean }
  | { ok: false; codigo: CodigoIdentidad; tieneFactor: boolean };

/** Un factor verificado (TOTP u otro) obliga a AAL2 aunque MFA_OBLIGATORIA sea false. */
export function tieneFactorVerificado(usuario: UsuarioAuth): boolean {
  return (usuario.factors ?? []).some((f) => f.status === "verified");
}

export function requiereAal2(usuario: UsuarioAuth, mfaObligatoria: boolean): boolean {
  return mfaObligatoria || tieneFactorVerificado(usuario);
}

/**
 * Usuario VALIDADO por el servidor de Auth: getUser() envia el token a Supabase y falla si
 * no es valido. NUNCA se usa getSession() para decidir (en el servidor viene de la cookie,
 * sin verificar). Cualquier fallo = sin usuario.
 */
export async function usuarioValidado(cliente: ClienteAuthServidor): Promise<UsuarioAuth | null> {
  try {
    const { data, error } = await cliente.auth.getUser();
    if (error || !data.user?.id) return null;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Nivel de garantia de la sesion. Se consulta DESPUES de getUser(): el aal sale del mismo
 * token de acceso que el servidor de Auth acaba de validar. Ante cualquier fallo: aal1.
 */
export async function nivelActual(cliente: ClienteAuthServidor): Promise<string> {
  try {
    const { data, error } = await cliente.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data?.currentLevel) return "aal1";
    return data.currentLevel;
  } catch {
    return "aal1";
  }
}

/**
 * Resuelve la identidad: sesion validada (getUser) -> correo admitido -> AAL2 si hace falta
 * -> membresia (usuarioId, orgId, rol). La org y el rol salen SIEMPRE de la membresia en
 * la base de datos, nunca de la peticion ni de los metadatos editables del usuario.
 */
export async function resolverIdentidad(
  cliente: ClienteAuthServidor,
  deps: DepsResolver,
): Promise<ResultadoIdentidad> {
  const usuario = await usuarioValidado(cliente);
  if (!usuario) return { ok: false, codigo: "no_autenticado", tieneFactor: false };
  const tieneFactor = tieneFactorVerificado(usuario);

  if (!usuario.email || !correoPermitido(usuario.email, deps.correosPermitidos)) {
    return { ok: false, codigo: "correo_no_permitido", tieneFactor };
  }

  if (requiereAal2(usuario, deps.mfaObligatoria) && (await nivelActual(cliente)) !== "aal2") {
    return { ok: false, codigo: "mfa_requerida", tieneFactor };
  }

  const m = membresiaActiva(await deps.membresias.listarPorUsuario(usuario.id));
  if (!m || m.usuarioId !== usuario.id) return { ok: false, codigo: "sin_membresia", tieneFactor };

  return {
    ok: true,
    ctx: { usuarioId: usuario.id, orgId: m.orgId, rol: m.rol },
    correo: usuario.email,
    tieneFactor,
  };
}
