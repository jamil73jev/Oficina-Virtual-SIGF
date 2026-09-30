import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { isLocale } from "@/core/i18n/config";
import { ListaAprobaciones } from "@/modules/aprobaciones/ListaAprobaciones";
import { exigirIdentidadPagina } from "@/core/auth/pagina";

export default async function AprobacionesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await exigirIdentidadPagina(locale);
  const t = await getTranslations({ locale, namespace: "approvals" });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ListaAprobaciones />
    </div>
  );
}
