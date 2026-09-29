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
export function construirCsp(dev: boolean): string {
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
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
