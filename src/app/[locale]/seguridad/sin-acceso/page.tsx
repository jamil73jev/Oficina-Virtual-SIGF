import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { mensajesAuth, localeAuth } from "@/core/auth/mensajes";
import { BotonCerrarSesion } from "@/core/auth/ui/BotonCerrarSesion";
import { isLocale, locales } from "@/core/i18n/config";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: mensajesAuth[localeAuth(locale)].sinAcceso.titulo, robots: { index: false, follow: false } };
}

/** Sesion valida pero sin membresia o con correo no admitido: no muestra ningun dato. */
export default async function SinAccesoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const idioma = localeAuth(locale);
  const t = mensajesAuth[idioma].sinAcceso;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader id="titulo-sin-acceso" title={t.titulo} />
      <Card>
        <p>{t.mensaje}</p>
      </Card>
      <BotonCerrarSesion locale={idioma} className="self-start" />
    </div>
  );
}
