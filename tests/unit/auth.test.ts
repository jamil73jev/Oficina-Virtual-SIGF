import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conAutenticacion,
  configSupabasePublica,
  correosPermitidos,
  crearProveedorIdentidadSupabase,
  ErrorIdentidad,
  MembresiasMemoriaRepo,
  membresiaActiva,
  mfaObligatoria,
  modoAutenticacion,
  obtenerProveedorIdentidad,
  resolverIdentidad,
  type DepsResolver,
} from "@/core/auth";
import { flujoConfirmacion, flujoDesafio, flujoInicioInscripcion, flujoLogin, normalizarQr } from "@/core/auth/flujos";
import { mensajesAuth } from "@/core/auth/mensajes";
import { identidadPendiente } from "@/core/approvals";
import { construirCsp, origenesSupabase } from "../../next.config";
import { clienteFalso, factorTotp } from "./auth.soporte";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const U_A = "a0000000-0000-4000-8000-00000000000a";

const usuarioA = (factors = [factorTotp("verified")]) => ({ id: U_A, email: "Analista@Ejemplo.ec", factors });

const deps = (over: Partial<DepsResolver> = {}): DepsResolver => ({
  membresias: new MembresiasMemoriaRepo([{ usuarioId: U_A, orgId: ORG_A, rol: "owner" }]),
  correosPermitidos: correosPermitidos({ CORREOS_PERMITIDOS: " analista@ejemplo.ec , otro@ejemplo.ec" }),
  mfaObligatoria: true,
  ...over,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config de autenticacion", () => {
  it("modo: supabase por defecto en Vercel o produccion; desarrollo en development/test", () => {
    expect(modoAutenticacion({ NODE_ENV: "production" })).toBe("supabase");
    expect(modoAutenticacion({ NODE_ENV: "development", VERCEL_ENV: "preview" })).toBe("supabase");
    expect(modoAutenticacion({ NODE_ENV: "development" })).toBe("desarrollo");
    expect(modoAutenticacion({ NODE_ENV: "test" })).toBe("desarrollo");
    expect(modoAutenticacion({ NODE_ENV: "test", AUTENTICACION: "supabase" })).toBe("supabase");
  });

  it("AUTENTICACION=desarrollo no puede activarse en Vercel ni en produccion", () => {
    expect(() => modoAutenticacion({ AUTENTICACION: "desarrollo", VERCEL_ENV: "production", NODE_ENV: "production" })).toThrow();
    expect(() => modoAutenticacion({ AUTENTICACION: "desarrollo", VERCEL_ENV: "preview", NODE_ENV: "development" })).toThrow();
    expect(() => modoAutenticacion({ AUTENTICACION: "desarrollo", NODE_ENV: "production" })).toThrow();
    expect(() => modoAutenticacion({ AUTENTICACION: "abierto" })).toThrow();
  });

  it("MFA obligatoria por defecto en produccion; configurable", () => {
    expect(mfaObligatoria({ NODE_ENV: "production" })).toBe(true);
    expect(mfaObligatoria({ VERCEL_ENV: "preview" })).toBe(true);
    expect(mfaObligatoria({ NODE_ENV: "test" })).toBe(false);
    expect(mfaObligatoria({ NODE_ENV: "production", MFA_OBLIGATORIA: "false" })).toBe(false);
    expect(mfaObligatoria({ NODE_ENV: "test", MFA_OBLIGATORIA: "true" })).toBe(true);
  });

  it("correos permitidos: normalizados; lista vacia = nadie", () => {
    expect([...correosPermitidos({ CORREOS_PERMITIDOS: " A@b.ec,,c@D.ec " })]).toEqual(["a@b.ec", "c@d.ec"]);
    expect(correosPermitidos({}).size).toBe(0);
  });

  it("config publica de Supabase: solo https y con clave anonima", () => {
    expect(configSupabasePublica({})).toBeNull();
    expect(configSupabasePublica({ NEXT_PUBLIC_SUPABASE_URL: "http://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" })).toBeNull();
    expect(
      configSupabasePublica({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }),
    ).toEqual({ url: "https://abc.supabase.co", claveAnonima: "k" });
  });
});

describe("resolverIdentidad (cliente Supabase falso)", () => {
  it("sin sesion: no_autenticado (valida con getUser, nunca con getSession)", async () => {
    const c = clienteFalso({ usuario: null });
    expect(await resolverIdentidad(c.comoResolver, deps())).toEqual({
      ok: false,
      codigo: "no_autenticado",
      tieneFactor: false,
    });
    expect(c.auth.getUser).toHaveBeenCalledTimes(1);
    expect(c.auth.getSession).not.toHaveBeenCalled();
  });

  it("token rechazado por el servidor de Auth: no_autenticado", async () => {
    const c = clienteFalso({ usuario: usuarioA(), aal: "aal2", errorGetUser: true });
    expect((await resolverIdentidad(c.comoResolver, deps())).ok).toBe(false);
  });

  it("AAL1 con factor TOTP verificado: mfa_requerida (aunque MFA_OBLIGATORIA=false)", async () => {
    const c = clienteFalso({ usuario: usuarioA(), aal: "aal1" });
    expect(await resolverIdentidad(c.comoResolver, deps({ mfaObligatoria: false }))).toEqual({
      ok: false,
      codigo: "mfa_requerida",
      tieneFactor: true,
    });
  });

  it("AAL1 sin factor con MFA obligatoria: mfa_requerida (debe inscribirse)", async () => {
    const c = clienteFalso({ usuario: usuarioA([]), aal: "aal1" });
    expect(await resolverIdentidad(c.comoResolver, deps())).toEqual({
      ok: false,
      codigo: "mfa_requerida",
      tieneFactor: false,
    });
  });

  it("sin MFA obligatoria y sin factor: AAL1 basta", async () => {
    const c = clienteFalso({ usuario: usuarioA([]), aal: "aal1" });
    const r = await resolverIdentidad(c.comoResolver, deps({ mfaObligatoria: false }));
    expect(r.ok).toBe(true);
  });

  it("sin membresia: sin_membresia", async () => {
    const c = clienteFalso({ usuario: usuarioA(), aal: "aal2" });
    const r = await resolverIdentidad(c.comoResolver, deps({ membresias: new MembresiasMemoriaRepo([]) }));
    expect(r).toEqual({ ok: false, codigo: "sin_membresia", tieneFactor: true });
  });

  it("correo fuera de CORREOS_PERMITIDOS: rechazado antes de mirar MFA o membresia", async () => {
    const c = clienteFalso({ usuario: { id: U_A, email: "intruso@ejemplo.ec", factors: [] }, aal: "aal2" });
    const d = deps();
    const espia = vi.spyOn(d.membresias, "listarPorUsuario");
    expect(await resolverIdentidad(c.comoResolver, d)).toEqual({
      ok: false,
      codigo: "correo_no_permitido",
      tieneFactor: false,
    });
    expect(espia).not.toHaveBeenCalled();
    expect(c.auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it("exito con AAL2: usuarioId de Auth y org/rol de la membresia", async () => {
    const c = clienteFalso({ usuario: usuarioA(), aal: "aal2" });
    const repo = new MembresiasMemoriaRepo([
      { usuarioId: U_A, orgId: ORG_A, rol: "supervisor" },
      { usuarioId: "otro", orgId: "00000000-0000-4000-8000-000000000000", rol: "owner" },
    ]);
    expect(await resolverIdentidad(c.comoResolver, deps({ membresias: repo }))).toEqual({
      ok: true,
      ctx: { usuarioId: U_A, orgId: ORG_A, rol: "supervisor" },
      correo: "Analista@Ejemplo.ec",
      tieneFactor: true,
    });
    expect(c.auth.getSession).not.toHaveBeenCalled();
  });

  it("varias membresias: la primera por orgId (determinista)", () => {
    expect(
      membresiaActiva([
        { usuarioId: "u", orgId: "b", rol: "viewer" },
        { usuarioId: "u", orgId: "a", rol: "admin" },
      ]),
    ).toEqual({ usuarioId: "u", orgId: "a", rol: "admin" });
  });
});

describe("proveedor de identidad Supabase y conAutenticacion", () => {
  const proveedor = (o: Parameters<typeof clienteFalso>[0], membresias = deps().membresias) =>
    crearProveedorIdentidadSupabase({
      crearCliente: () => clienteFalso(o).comoResolver,
      membresias,
      entorno: { CORREOS_PERMITIDOS: "analista@ejemplo.ec", MFA_OBLIGATORIA: "true" },
    });
  const req = new Request("http://local/api/x", { headers: { cookie: "sb-x-auth-token=abc" } });
  const ruta = (p: ReturnType<typeof proveedor>) =>
    conAutenticacion(async (r: Request) => {
      const ctx = await p(r);
      return ctx ? Response.json({ ctx }) : Response.json({ error: "no_autenticado" }, { status: 401 });
    });

  it("401 no_autenticado, 401 mfa_requerida, 403 sin_membresia, 200 con AAL2", async () => {
    const sin = await ruta(proveedor({ usuario: null }))(req);
    expect([sin.status, await sin.json()]).toEqual([401, { error: "no_autenticado" }]);
    const mfa = await ruta(proveedor({ usuario: usuarioA(), aal: "aal1" }))(req);
    expect([mfa.status, await mfa.json()]).toEqual([401, { error: "mfa_requerida" }]);
    const sinM = await ruta(proveedor({ usuario: usuarioA(), aal: "aal2" }, new MembresiasMemoriaRepo()))(req);
    expect([sinM.status, await sinM.json()]).toEqual([403, { error: "sin_membresia" }]);
    const correo = await ruta(proveedor({ usuario: { id: U_A, email: "x@y.ec" }, aal: "aal2" }))(req);
    expect([correo.status, await correo.json()]).toEqual([403, { error: "correo_no_permitido" }]);
    const ok = await ruta(proveedor({ usuario: usuarioA(), aal: "aal2" }))(req);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBeNull();
    expect(mfa.headers.get("cache-control")).toBe("no-store");
  });

  it("conAutenticacion no oculta otros errores", async () => {
    const r = conAutenticacion(async () => {
      throw new Error("otro");
    });
    await expect(r()).rejects.toThrow("otro");
    expect(new ErrorIdentidad("sin_membresia").status).toBe(403);
  });

  it("obtenerProveedorIdentidad: en test usa la identidad de desarrollo con sus guardas", async () => {
    vi.stubEnv("AUTENTICACION", "");
    expect(obtenerProveedorIdentidad()).toBe(identidadPendiente);
    // La identidad de desarrollo sigue bloqueada bajo VERCEL_ENV (y AUTENTICACION=desarrollo tambien).
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("APPROVALS_DEV_IDENTITY", JSON.stringify({ usuarioId: "u", orgId: "o", rol: "owner" }));
    vi.stubEnv("APPROVALS_ALLOW_DEV_IDENTITY", "true");
    expect(obtenerProveedorIdentidad()).not.toBe(identidadPendiente);
    expect(() => identidadPendiente(req)).toThrow(/APPROVALS_DEV_IDENTITY/);
    vi.stubEnv("AUTENTICACION", "desarrollo");
    expect(() => obtenerProveedorIdentidad()).toThrow(/prohibida/);
  });

  it("sin configuracion de Supabase en modo supabase: 401 (falla cerrado)", async () => {
    vi.stubEnv("AUTENTICACION", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await obtenerProveedorIdentidad()(req)).toBeNull();
    error.mockRestore();
  });
});

describe("flujos de login y MFA (cliente falso)", () => {
  const env = { CORREOS_PERMITIDOS: "analista@ejemplo.ec" };

  it("correo fuera de CORREOS_PERMITIDOS: mismo error generico y sin llamar a Supabase", async () => {
    const c = clienteFalso({ login: { usuario: usuarioA() } });
    expect(await flujoLogin(c.comoSupabase, { correo: "intruso@ejemplo.ec", contrasena: "x" }, env)).toEqual({
      ok: false,
      error: "credenciales",
    });
    expect(c.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("errores 4xx de Auth (incluido correo sin confirmar) no revelan si el correo existe", async () => {
    for (const status of [400, 422, 429]) {
      const c = clienteFalso({ login: { status } });
      expect(await flujoLogin(c.comoSupabase, { correo: "analista@ejemplo.ec", contrasena: "x" }, env)).toEqual({
        ok: false,
        error: "credenciales",
      });
    }
    const caido = clienteFalso({ login: { status: 503 } });
    expect((await flujoLogin(caido.comoSupabase, { correo: "analista@ejemplo.ec", contrasena: "x" }, env)).ok).toBe(false);
  });

  it("login correcto informa si hay factor (para ir al desafio)", async () => {
    const c = clienteFalso({ login: { usuario: usuarioA() } });
    expect(await flujoLogin(c.comoSupabase, { correo: "ANALISTA@ejemplo.ec ", contrasena: "x" }, env)).toEqual({
      ok: true,
      tieneFactor: true,
    });
  });

  it("si Auth devuelve un usuario con otro correo, cierra la sesion y rechaza", async () => {
    const c = clienteFalso({ login: { usuario: { id: U_A, email: "otro@x.ec" } } });
    expect((await flujoLogin(c.comoSupabase, { correo: "analista@ejemplo.ec", contrasena: "x" }, env)).ok).toBe(false);
    expect(c.auth.signOut).toHaveBeenCalled();
  });

  it("desafio TOTP: formato, codigo erroneo y correcto", async () => {
    const c = clienteFalso({ usuario: usuarioA(), codigoValido: "654321" });
    expect(await flujoDesafio(c.comoSupabase, "12ab56", env)).toEqual({ ok: false, error: "formato" });
    expect(await flujoDesafio(c.comoSupabase, "111111", env)).toEqual({ ok: false, error: "codigo" });
    expect(await flujoDesafio(c.comoSupabase, "654321", env)).toEqual({ ok: true });
    const sinSesion = clienteFalso({ usuario: null });
    expect(await flujoDesafio(sinSesion.comoSupabase, "654321", env)).toEqual({ ok: false, error: "sin_sesion" });
    const sinFactor = clienteFalso({ usuario: usuarioA([]) });
    expect(await flujoDesafio(sinFactor.comoSupabase, "654321", env)).toEqual({ ok: false, error: "sin_factor" });
  });

  it("inscripcion: QR como data: SVG, limpia factores sin verificar y verifica el propio", async () => {
    const pendiente = factorTotp("unverified", "22222222-2222-4222-8222-222222222222");
    const c = clienteFalso({
      usuario: usuarioA([pendiente]),
      enroll: { id: "33333333-3333-4333-8333-333333333333", qr_code: 'data:image/svg+xml;utf-8,<svg fill="#000"></svg>', secret: "SECRETO" },
    });
    const r = await flujoInicioInscripcion(c.comoSupabase, env);
    expect(r).toEqual({
      ok: true,
      factorId: "33333333-3333-4333-8333-333333333333",
      qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg fill="#000"></svg>')}`,
      secreto: "SECRETO",
    });
    expect(c.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: pendiente.id });

    // Solo verifica un factor TOTP sin verificar DEL PROPIO usuario.
    expect(await flujoConfirmacion(c.comoSupabase, "44444444-4444-4444-8444-444444444444", "123456", env)).toEqual({
      ok: false,
      error: "inscripcion",
    });
    expect(await flujoConfirmacion(c.comoSupabase, pendiente.id, "12", env)).toEqual({ ok: false, error: "formato" });
    expect(await flujoConfirmacion(c.comoSupabase, pendiente.id, "123456", env)).toEqual({ ok: true });
  });

  it("inscripcion: rechaza si ya hay factor activo o el correo no esta admitido", async () => {
    const activo = clienteFalso({ usuario: usuarioA() });
    expect(await flujoInicioInscripcion(activo.comoSupabase, env)).toEqual({ ok: false, error: "ya_activa" });
    const ajeno = clienteFalso({ usuario: { id: U_A, email: "x@y.ec", factors: [] } });
    expect(await flujoInicioInscripcion(ajeno.comoSupabase, env)).toEqual({ ok: false, error: "inscripcion" });
    expect(ajeno.auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("normalizarQr solo acepta SVG como data:", () => {
    expect(normalizarQr("javascript:alert(1)")).toBeNull();
    expect(normalizarQr("data:text/html,<script>")).toBeNull();
    expect(normalizarQr("data:image/svg+xml;base64,PHN2Zz4=")).toBe("data:image/svg+xml;base64,PHN2Zz4=");
    expect(normalizarQr(42)).toBeNull();
  });
});

describe("CSP con y sin URL de Supabase", () => {
  it("sin URL: connect-src solo 'self'", () => {
    const csp = construirCsp(false, undefined);
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("img-src 'self' data: blob:");
  });

  it("con URL https: anade el origen https y wss; nada mas cambia", () => {
    const sin = construirCsp(false, undefined);
    const con = construirCsp(false, "https://abcd.supabase.co/rest/v1");
    expect(con).toContain("connect-src 'self' https://abcd.supabase.co wss://abcd.supabase.co;");
    expect(con.replace(" https://abcd.supabase.co wss://abcd.supabase.co", "")).toBe(sin);
    expect(con).not.toContain("'unsafe-eval'");
  });

  it("ignora URLs no https o invalidas", () => {
    expect(origenesSupabase("http://abcd.supabase.co")).toEqual([]);
    expect(origenesSupabase("no es url")).toEqual([]);
    expect(origenesSupabase("https://u:p@abcd.supabase.co")).toEqual([]);
    expect(construirCsp(false, "javascript:alert(1)")).toContain("connect-src 'self';");
  });
});

describe("mensajes de autenticacion", () => {
  const claves = (o: unknown, prefijo = ""): string[] =>
    typeof o === "object" && o !== null
      ? Object.entries(o).flatMap(([k, v]) => claves(v, `${prefijo}${k}.`))
      : [prefijo.slice(0, -1)];

  it("ES y EN tienen las mismas claves y ningun texto vacio", () => {
    expect(claves(mensajesAuth.en).sort()).toEqual(claves(mensajesAuth.es).sort());
    for (const idioma of [mensajesAuth.es, mensajesAuth.en]) {
      for (const k of claves(idioma)) {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], idioma);
        expect(typeof v === "string" && v.trim().length > 0, k).toBe(true);
      }
    }
  });
});
