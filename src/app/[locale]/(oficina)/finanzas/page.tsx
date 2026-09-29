import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isLocale, locales } from "@/core/i18n/config";
import {
  mensajesPanelFinanciero,
  obtenerServicioPanelFinanciero,
  VistaPanelFinanciero,
  type LocalePanelFinanciero,
} from "@/modules/panel-financiero";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = mensajesPanelFinanciero[locale as LocalePanelFinanciero] ?? mensajesPanelFinanciero.es;
  return {
    title: t.titulo,
    description: t.subtitulo,
  };
}

export default async function FinanzasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const servicio = obtenerServicioPanelFinanciero();
  const panel = await servicio.obtenerPanel();

  return <VistaPanelFinanciero panel={panel} locale={locale as LocalePanelFinanciero} />;
}
