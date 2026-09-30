import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClienteAuthServidor, FactorAuth, UsuarioAuth } from "@/core/auth/resolver";

/**
 * Cliente Supabase FALSO (sin red) para las pruebas de autenticacion. getSession lanza: el
 * codigo del servidor NUNCA debe usarlo para decidir.
 */
export interface OpcionesClienteFalso {
  usuario?: UsuarioAuth | null;
  aal?: "aal1" | "aal2" | null;
  errorGetUser?: boolean;
  /** Resultado de signInWithPassword: usuario (exito) o status HTTP del error. */
  login?: { usuario: UsuarioAuth } | { status: number };
  /** Codigo TOTP valido para challengeAndVerify. */
  codigoValido?: string;
  enroll?: { id: string; qr_code: string; secret: string } | { error: true };
}

export const factorTotp = (status: "verified" | "unverified", id = "11111111-1111-4111-8111-111111111111"): FactorAuth => ({
  id,
  factor_type: "totp",
  status,
});

export function clienteFalso(o: OpcionesClienteFalso = {}) {
  const usuario = o.usuario ?? null;
  const factores = () => [...(usuario?.factors ?? [])];
  const auth = {
    getUser: vi.fn(async () =>
      o.errorGetUser || !usuario
        ? { data: { user: null }, error: { status: 401, message: "invalid" } }
        : { data: { user: usuario }, error: null },
    ),
    getSession: vi.fn(async () => {
      throw new Error("getSession() no debe usarse en el servidor");
    }),
    signInWithPassword: vi.fn(async () => {
      if (!o.login) return { data: { user: null, session: null }, error: { status: 400, message: "invalid_credentials" } };
      if ("status" in o.login) return { data: { user: null, session: null }, error: { status: o.login.status, message: "x" } };
      return { data: { user: o.login.usuario, session: {} }, error: null };
    }),
    signOut: vi.fn(async () => ({ error: null })),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({
        data: { currentLevel: o.aal ?? "aal1", nextLevel: "aal2" },
        error: null,
      })),
      listFactors: vi.fn(async () => {
        const all = factores();
        return {
          data: { all, totp: all.filter((f) => f.factor_type === "totp" && f.status === "verified"), phone: [] },
          error: null,
        };
      }),
      challengeAndVerify: vi.fn(async ({ code }: { factorId: string; code: string }) =>
        code === (o.codigoValido ?? "123456") ? { data: {}, error: null } : { data: null, error: { status: 422 } },
      ),
      enroll: vi.fn(async () =>
        !o.enroll || "error" in o.enroll
          ? { data: null, error: { status: 422 } }
          : {
              data: { id: o.enroll.id, type: "totp", totp: { qr_code: o.enroll.qr_code, secret: o.enroll.secret, uri: "otpauth://" } },
              error: null,
            },
      ),
      unenroll: vi.fn(async () => ({ data: {}, error: null })),
    },
  };
  return {
    auth,
    /** Vista tipada para el resolver (subconjunto) y para los flujos (SupabaseClient). */
    comoResolver: { auth } as unknown as ClienteAuthServidor,
    comoSupabase: { auth } as unknown as SupabaseClient,
  };
}
