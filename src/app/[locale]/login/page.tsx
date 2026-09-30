import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { mensajesAuth, localeAuth } from "@/core/auth/mensajes";
import { modoAutenticacionActual } from "@/core/auth/proveedor";
import { destinoSeguro } from "@/core/auth/rutas";
import { FormularioLogin } from "@/core/auth/ui/FormularioLogin";
import { isLocale, locales } from "@/core/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = mensajesAuth[localeAuth(locale)].login;
  return { title: t.titulo, description: t.subtitulo, robots: { index: false, follow: false } };
}

export default async function LoginPage({
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
  const t = mensajesAuth[idioma].login;
  const crudo = (await searchParams).siguiente;
  const siguiente = destinoSeguro(typeof crudo === "string" ? crudo : null, locale, locales);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <PageHeader id="titulo-login" title={t.titulo} subtitle={t.subtitulo} />
      <Card>
        <FormularioLogin
          locale={idioma}
          siguiente={siguiente}
          desarrollo={modoAutenticacionActual() === "desarrollo"}
        />
      </Card>
    </div>
  );
}
