import { NextResponse, type NextRequest } from "next/server";
import { configSupabasePublica, mfaObligatoria, modoAutenticacion } from "@/core/auth/config";
import { nivelActual, requiereAal2, tieneFactorVerificado, usuarioValidado } from "@/core/auth/resolver";
import { decidirRuta, type EstadoSesionProxy } from "@/core/auth/rutas";
import { crearClienteSupabaseServidor } from "@/core/auth/supabase-servidor";
import { defaultLocale, locales } from "@/core/i18n/config";

const SIN_SESION: EstadoSesionProxy = { autenticado: false, mfaPendiente: false, tieneFactor: false };

/**
 * Proxy (antes middleware, Next 16): 1) renueva las cookies de sesion de Supabase y
 * 2) aplica la decision PURA decidirRuta (core/auth/rutas.ts): redirige al login las rutas
 * de la oficina sin sesion y al desafio/inscripcion MFA si falta AAL2. /api NUNCA se
 * redirige (sus handlers responden 401/403 JSON). Es una comprobacion OPTIMISTA: las
 * paginas y las rutas vuelven a validar identidad, MFA y membresia en el servidor.
 */
export async function proxy(request: NextRequest) {
  // En desarrollo/test no hay Supabase: las paginas resuelven la identidad de desarrollo.
  if (modoAutenticacion(process.env) === "desarrollo") return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  let sesion = SIN_SESION;

  if (configSupabasePublica(process.env)) {
    const cliente = crearClienteSupabaseServidor({
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, cabeceras) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of cookies) respuesta.cookies.set(name, value, options);
        for (const [clave, valor] of Object.entries(cabeceras)) respuesta.headers.set(clave, valor);
      },
    });
    // getUser() valida el token con el servidor de Auth (y lo renueva si ha caducado).
    const usuario = await usuarioValidado(cliente);
    if (usuario) {
      const necesita = requiereAal2(usuario, mfaObligatoria(process.env));
      sesion = {
        autenticado: true,
        mfaPendiente: necesita && (await nivelActual(cliente)) !== "aal2",
        tieneFactor: tieneFactorVerificado(usuario),
      };
    }
  }

  const decision = decidirRuta(request.nextUrl.pathname, sesion, locales, defaultLocale);
  if (decision.tipo === "continuar") return respuesta;

  const redireccion = NextResponse.redirect(new URL(decision.destino, request.url));
  // Conserva las cookies renovadas (o borradas) en la redireccion.
  for (const c of respuesta.cookies.getAll()) redireccion.cookies.set(c);
  redireccion.headers.set("Cache-Control", "private, no-store");
  return redireccion;
}

export const config = {
  matcher: [
    // Todo salvo estaticos, imagenes optimizadas, metadatos y la sonda /api/salud.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/salud).*)",
  ],
};
