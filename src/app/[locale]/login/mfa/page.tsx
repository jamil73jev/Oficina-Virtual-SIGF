import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { mensajesAuth, localeAuth } from "@/core/auth/mensajes";
import { resolverSesionPagina } from "@/core/auth/pagina";
import { modoAutenticacionActual } from "@/core/auth/proveedor";
import { destinoSeguro, rutaTrasRechazo } from "@/core/auth/rutas";
import { FormularioDesafioMfa } from "@/core/auth/ui/FormularioDesafioMfa";
import { isLocale, locales } from "@/core/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = mensajesAuth[localeAuth(locale)].desafio;
  return { title: t.titulo, description: t.subtitulo, robots: { index: false, follow: false } };
}

/** Desafio MFA tras el login: solo con sesion AAL1 de un usuario con factor verificado. */
export default async function DesafioMfaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const idioma = localeAuth(locale);
  const t = mensajesAuth[idioma].desafio;
  const crudo = (await searchParams).siguiente;
  const siguiente = destinoSeguro(typeof crudo === "string" ? crudo : null, locale, locales);

  const desarrollo = modoAutenticacionActual() === "desarrollo";
  if (!desarrollo) {
    const r = await resolverSesionPagina();
    if (r.ok) redirect(siguiente);
    if (r.codigo !== "mfa_requerida" || !r.tieneFactor) redirect(rutaTrasRechazo(r.codigo, r.tieneFactor, locale));
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <PageHeader id="titulo-desafio-mfa" title={t.titulo} subtitle={t.subtitulo} />
      <Card>
        <FormularioDesafioMfa locale={idioma} siguiente={siguiente} desarrollo={desarrollo} />
      </Card>
    </div>
  );
}
