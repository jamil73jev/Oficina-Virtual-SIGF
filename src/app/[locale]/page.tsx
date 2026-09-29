import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, Card, CardTitle } from "@/components/ui";
import { isLocale } from "@/core/i18n/config";
import { formatCurrency } from "@/core/i18n/format";
import { NewProjectDialog } from "./new-project-dialog";

// Sin datos reales: la lista se llenara desde el modulo de proyectos.
const projects: Array<{ id: string; name: string }> = [];

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("subtitle")}</p>
      </div>

      <section aria-labelledby="proyectos" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="proyectos" className="text-lg font-semibold">
            {t("projectsTitle")}
          </h2>
          <NewProjectDialog />
        </div>

        {projects.length === 0 ? (
          <Card className="flex flex-col items-start gap-2">
            <CardTitle as="h3">{t("emptyTitle")}</CardTitle>
            <p className="text-sm text-muted">{t("emptyBody")}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t("statusLabel")}:</span>
              <Badge>{t("statusIdle")}</Badge>
              <span className="text-muted">
                {t("budgetLabel")}: {formatCurrency(0, locale)}
              </span>
            </p>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardTitle as="h3">{p.name}</CardTitle>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
