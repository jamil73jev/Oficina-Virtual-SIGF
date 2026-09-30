import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { isLocale } from "@/core/i18n/config";
import { TableroProyectos } from "@/modules/proyectos/TableroProyectos";
import { exigirIdentidadPagina } from "@/core/auth/pagina";

export default async function ProyectosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await exigirIdentidadPagina(locale);
  const t = await getTranslations({ locale, namespace: "projects" });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader title={t("pageTitle")} subtitle={t("subtitle")} />
      <TableroProyectos />
    </div>
  );
}
