import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { exigirIdentidadPagina } from "@/core/auth/pagina";
import { isLocale, locales, type Locale } from "@/core/i18n/config";
import {
  mensajesDashboards,
  obtenerServicioDashboards,
  type LocaleDashboards,
} from "@/modules/dashboards";
import { VistaCostos } from "@/modules/dashboards/VistaCostos";

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
  const t = mensajesDashboards[locale as LocaleDashboards] ?? mensajesDashboards.es;
  return {
    title: t.titulo,
    description: t.subtitulo,
  };
}

export default async function CostosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // Identidad real (sesion + MFA + membresia): la org y el rol salen de la membresia.
  const { ctx } = await exigirIdentidadPagina(locale);
  const servicio = obtenerServicioDashboards();

  const resumen = await servicio.obtenerResumen(ctx, undefined, {
    locale: locale as Locale,
  });

  return <VistaCostos datos={resumen} locale={locale as LocaleDashboards} />;
}
