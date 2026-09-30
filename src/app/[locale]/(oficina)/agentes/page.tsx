import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { isLocale, locales } from "@/core/i18n/config";
import { AGENTES_AREA } from "@/modules/agentes-area";
import { mensajesAgentes, PanelAgentes, type LocaleAgentes } from "@/modules/agentes-ui";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !(locale in mensajesAgentes)) return {};
  const t = mensajesAgentes[locale as LocaleAgentes];
  return { title: t.titulo, description: t.subtitulo };
}

export default async function AgentesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !(locale in mensajesAgentes)) notFound();
  setRequestLocale(locale);
  const idioma = locale as LocaleAgentes;
  const t = mensajesAgentes[idioma];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader id="titulo-agentes" title={t.titulo} subtitle={t.subtitulo} />
      <PanelAgentes agentes={AGENTES_AREA} locale={idioma} />
    </div>
  );
}

