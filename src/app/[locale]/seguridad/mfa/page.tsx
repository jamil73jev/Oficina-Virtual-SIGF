import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { mensajesAuth, localeAuth } from "@/core/auth/mensajes";
import { resolverSesionPagina } from "@/core/auth/pagina";
import { modoAutenticacionActual } from "@/core/auth/proveedor";
import { rutaTrasRechazo } from "@/core/auth/rutas";
import { BotonCerrarSesion } from "@/core/auth/ui/BotonCerrarSesion";
import { InscripcionMfa } from "@/core/auth/ui/InscripcionMfa";
import { isLocale } from "@/core/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = mensajesAuth[localeAuth(locale)].mfa;
  return { title: t.titulo, description: t.subtitulo, robots: { index: false, follow: false } };
}

/**
 * Inscripcion del factor TOTP. Accesible con sesion AAL1 SOLO si el usuario aun no tiene
 * factor (inscripcion obligatoria); con factor verificado exige AAL2 (pasa por el desafio).
 */
export default async function SeguridadMfaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const idioma = localeAuth(locale);
  const t = mensajesAuth[idioma].mfa;

  const desarrollo = modoAutenticacionActual() === "desarrollo";
  let activa = false;
  let obligatoria = false;
  if (!desarrollo) {
    const r = await resolverSesionPagina();
    if (r.ok) {
      activa = r.tieneFactor;
    } else if (r.codigo === "no_autenticado" || r.codigo === "correo_no_permitido") {
      redirect(rutaTrasRechazo(r.codigo, r.tieneFactor, locale));
    } else if (r.codigo === "mfa_requerida") {
      if (r.tieneFactor) redirect(rutaTrasRechazo(r.codigo, r.tieneFactor, locale));
      obligatoria = true;
    } else {
      // sin_membresia: puede proteger su cuenta aunque aun no tenga organizacion.
      activa = r.tieneFactor;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader id="titulo-seguridad-mfa" title={t.titulo} subtitle={t.subtitulo} />
      <Card className="flex flex-col gap-4">
        {!desarrollo && (
          <p className="text-sm font-medium">{activa ? t.activa : obligatoria ? t.obligatoria : t.inactiva}</p>
        )}
        {!activa && <InscripcionMfa locale={idioma} disponible={!desarrollo} />}
      </Card>
      <BotonCerrarSesion locale={idioma} className="self-start" />
    </div>
  );
}
