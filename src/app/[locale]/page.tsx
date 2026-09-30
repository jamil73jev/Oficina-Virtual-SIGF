import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/core/i18n/config";
import { VistaPortada } from "@/modules/portada/VistaPortada";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "portada" });
  return { title: t("title") };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  // El armazon es estatico; los datos vivos llegan por streaming dentro de VistaPortada.
  return <VistaPortada locale={locale} />;
}
