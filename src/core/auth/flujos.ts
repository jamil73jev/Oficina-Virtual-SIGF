import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { correoPermitido, correosPermitidos, type Entorno } from "./config";
import { tieneFactorVerificado, usuarioValidado, type UsuarioAuth } from "./resolver";
import type { ErrorLogin, ResultadoInicioInscripcion } from "./tipos-acciones";

/**
 * Logica de las acciones de autenticacion, separada de "use server" para probarla con un
 * cliente Supabase FALSO. Nunca registra correos, contrasenas, codigos ni secretos TOTP.
 */

export const EntradaLogin = z.object({
  correo: z.email().max(254),
  contrasena: z.string().min(1).max(256),
});

export const CodigoTotp = z.string().trim().regex(/^\d{6}$/);
export const IdFactor = z.uuid();

/** Errores 4xx de Auth (credenciales, correo sin confirmar, etc.) = "credenciales": no revela si existe. */
function clasificarErrorAuth(error: unknown): ErrorLogin {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 ? "credenciales" : "servicio";
}

export type ResultadoLogin = { ok: true; tieneFactor: boolean } | { ok: false; error: ErrorLogin };

/**
 * Login con correo y contrasena. Un correo fuera de CORREOS_PERMITIDOS se rechaza con el
 * MISMO error generico que una contrasena erronea, sin llegar a Supabase.
 */
export async function flujoLogin(
  cliente: SupabaseClient,
  entrada: { correo: string; contrasena: string },
  env: Entorno,
): Promise<ResultadoLogin> {
  const permitidos = correosPermitidos(env);
  if (!correoPermitido(entrada.correo, permitidos)) return { ok: false, error: "credenciales" };
  let usuario: UsuarioAuth | null = null;
  try {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: entrada.correo.trim().toLowerCase(),
      password: entrada.contrasena,
    });
    if (error) return { ok: false, error: clasificarErrorAuth(error) };
    usuario = data.user;
  } catch {
    return { ok: false, error: "servicio" };
  }
  if (!usuario || !correoPermitido(usuario.email, permitidos)) {
    await cerrarSesionSilenciosa(cliente);
    return { ok: false, error: "credenciales" };
  }
  return { ok: true, tieneFactor: tieneFactorVerificado(usuario) };
}

export async function cerrarSesionSilenciosa(cliente: SupabaseClient): Promise<void> {
  try {
    await cliente.auth.signOut({ scope: "local" });
  } catch {
    // sin red: las cookies locales se limpian igualmente al expirar
  }
}

/** Usuario validado (getUser) y con correo admitido; null en otro caso. */
export async function usuarioAdmitido(cliente: SupabaseClient, env: Entorno): Promise<UsuarioAuth | null> {
  const usuario = await usuarioValidado(cliente);
  if (!usuario || !correoPermitido(usuario.email, correosPermitidos(env))) return null;
  return usuario;
}

export type ResultadoDesafio =
  | { ok: true }
  | { ok: false; error: "formato" | "codigo" | "sin_factor" | "sin_sesion" };

/** Desafio TOTP tras el login: eleva la sesion a AAL2. */
export async function flujoDesafio(cliente: SupabaseClient, codigoCrudo: unknown, env: Entorno): Promise<ResultadoDesafio> {
  const codigo = CodigoTotp.safeParse(codigoCrudo);
  if (!codigo.success) return { ok: false, error: "formato" };
  const usuario = await usuarioAdmitido(cliente, env);
  if (!usuario) return { ok: false, error: "sin_sesion" };
  try {
    const { data, error } = await cliente.auth.mfa.listFactors();
    const factor = error ? undefined : data.totp.find((f) => f.status === "verified");
    if (!factor) return { ok: false, error: "sin_factor" };
    const r = await cliente.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo.data });
    return r.error ? { ok: false, error: "codigo" } : { ok: true };
  } catch {
    return { ok: false, error: "codigo" };
  }
}

/**
 * El QR de Supabase llega como data:image/svg+xml con el SVG sin codificar; se re-codifica
 * para que sea un data: URI valido en <img> (un "#" lo cortaria). Solo se aceptan SVG.
 */
export function normalizarQr(qr: unknown): string | null {
  if (typeof qr !== "string") return null;
  const coma = qr.indexOf(",");
  if (coma < 0) return null;
  const cabecera = qr.slice(0, coma).toLowerCase();
  const cuerpo = qr.slice(coma + 1);
  if (!cabecera.startsWith("data:image/svg+xml")) return null;
  if (cabecera.includes(";base64")) return /^[a-z0-9+/=\s]+$/i.test(cuerpo) ? qr : null;
  let svg = cuerpo;
  if (!cuerpo.includes("<")) {
    try {
      svg = decodeURIComponent(cuerpo);
    } catch {
      return null;
    }
  }
  if (!svg.trimStart().startsWith("<")) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const NOMBRE_FACTOR = "Oficina virtual";

/** Inicia la inscripcion de un factor TOTP (limpia antes los TOTP sin verificar). */
export async function flujoInicioInscripcion(cliente: SupabaseClient, env: Entorno): Promise<ResultadoInicioInscripcion> {
  const usuario = await usuarioAdmitido(cliente, env);
  if (!usuario) return { ok: false, error: "inscripcion" };
  try {
    const { data: factores, error } = await cliente.auth.mfa.listFactors();
    if (error) return { ok: false, error: "inscripcion" };
    if (factores.totp.some((f) => f.status === "verified")) return { ok: false, error: "ya_activa" };
    for (const f of factores.all) {
      if (f.factor_type === "totp" && f.status === "unverified") {
        await cliente.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data, error: e2 } = await cliente.auth.mfa.enroll({ factorType: "totp", friendlyName: NOMBRE_FACTOR });
    if (e2 || !data) return { ok: false, error: "inscripcion" };
    const qr = normalizarQr(data.totp.qr_code);
    if (!qr || !IdFactor.safeParse(data.id).success) return { ok: false, error: "inscripcion" };
    return { ok: true, factorId: data.id, qr, secreto: data.totp.secret };
  } catch {
    return { ok: false, error: "inscripcion" };
  }
}

export type ResultadoConfirmacion =
  | { ok: true }
  | { ok: false; error: "formato" | "codigo" | "inscripcion" };

/** Verifica el primer codigo del factor recien inscrito (debe ser un TOTP sin verificar del usuario). */
export async function flujoConfirmacion(
  cliente: SupabaseClient,
  factorIdCrudo: unknown,
  codigoCrudo: unknown,
  env: Entorno,
): Promise<ResultadoConfirmacion> {
  const factorId = IdFactor.safeParse(factorIdCrudo);
  const codigo = CodigoTotp.safeParse(codigoCrudo);
  if (!factorId.success) return { ok: false, error: "inscripcion" };
  if (!codigo.success) return { ok: false, error: "formato" };
  const usuario = await usuarioAdmitido(cliente, env);
  if (!usuario) return { ok: false, error: "inscripcion" };
  try {
    const { data, error } = await cliente.auth.mfa.listFactors();
    const propio = error
      ? undefined
      : data.all.find((f) => f.id === factorId.data && f.factor_type === "totp" && f.status === "unverified");
    if (!propio) return { ok: false, error: "inscripcion" };
    const r = await cliente.auth.mfa.challengeAndVerify({ factorId: propio.id, code: codigo.data });
    return r.error ? { ok: false, error: "codigo" } : { ok: true };
  } catch {
    return { ok: false, error: "codigo" };
  }
}
