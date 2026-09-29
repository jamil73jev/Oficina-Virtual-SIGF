import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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

  const servicio = obtenerServicioDashboards();
  const demoCtx = {
    usuarioId: "00000000-0000-4000-8000-000000000002",
    orgId: "00000000-0000-4000-8000-000000000001",
    rol: "viewer" as const,
  };

  const resumen = await servicio.obtenerResumen(demoCtx, undefined, {
    locale: locale as Locale,
  });

  return <VistaCostos datos={resumen} locale={locale as LocaleDashboards} />;
}
