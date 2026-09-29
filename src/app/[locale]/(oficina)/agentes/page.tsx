import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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
    <main className="mx-auto flex max-w-6xl flex-col gap-6" aria-labelledby="titulo-agentes">
      <header>
        <h1 id="titulo-agentes" className="text-2xl font-bold">{t.titulo}</h1>
        <p className="text-muted">{t.subtitulo}</p>
      </header>
      <PanelAgentes agentes={AGENTES_AREA} locale={idioma} />
    </main>
  );
}

