import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts");

/**
 * CSP estatica (sin proxy/nonce). Sin 'unsafe-eval' en produccion; en desarrollo React
 * lo necesita para reconstruir stacks (docs de Next 16: content-security-policy).
 * PARCIAL: 'unsafe-inline' en script-src sigue haciendo falta porque Next inyecta scripts
 * inline de arranque; la CSP estricta con nonce + 'strict-dynamic' exige un proxy.ts que
 * genere el nonce por peticion (paginas dinamicas), fuera de este archivo.
 */
/**
 * Origen de Supabase para connect-src (https y wss para Realtime). Solo URLs https validas;
 * cualquier otra cosa se ignora (nunca se abre connect-src a un valor arbitrario).
 */
export function origenesSupabase(url: string | undefined): string[] {
  if (!url?.trim()) return [];
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" || u.username || u.password) return [];
    return [`https://${u.host}`, `wss://${u.host}`];
  } catch {
    return [];
  }
}

export function construirCsp(
  dev: boolean,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  const connect = ["'self'", ...origenesSupabase(supabaseUrl)].join(" ");
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directivas.join("; ");
}

export function cabecerasSeguridad(dev: boolean) {
  return [
    { key: "Content-Security-Policy", value: construirCsp(dev) },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
  ];
}

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  // Nota de rendimiento: experimental.inlineCss se probo (2026-09-29) y EMPEORO el TBT
  // (81-154 ms frente a 44-58 ms) sin mejorar el LCP; no activarlo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: cabecerasSeguridad(process.env.NODE_ENV === "development"),
      },
    ];
  },
};

export default withNextIntl(nextConfig);
