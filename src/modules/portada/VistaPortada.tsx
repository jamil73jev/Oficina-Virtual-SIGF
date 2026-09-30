import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { DataTable, EmptyState, Icon, Skeleton, StatCard } from "@/components/ui";
import { formatDate, formatNumber } from "@/core/i18n/format";
import type { Locale } from "@/core/i18n/config";
import { AGENTES_AREA } from "@/modules/agentes-area";
import { cargarPortada, type DatosPortada } from "./datos";

const HUSO = "America/Guayaquil";

const enlaceSecundario =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-raised px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface";

const colorBarra = { ok: "bg-primary", alerta_80: "bg-warning", alerta_100: "bg-danger" } as const;
const tonoCosto = { ok: "info", alerta_80: "warning", alerta_100: "danger" } as const;

/**
 * Armazón estático (título) + datos vivos en streaming: el título pinta de inmediato y las
 * tarjetas llegan después, sin bloquear el LCP.
 */
export async function VistaPortada({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "portada" });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[2.125rem] font-semibold">{t("title")}</h1>
      </header>
      <Suspense fallback={<CargandoPortada />}>
        <PortadaDatos locale={locale} />
      </Suspense>
    </div>
  );
}

function CargandoPortada() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <Skeleton className="h-6 w-64" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

async function PortadaDatos({ locale }: { locale: Locale }) {
  await connection(); // datos vivos: por petición, nunca en el build
  const datos = await cargarPortada(locale);
  return <ContenidoPortada locale={locale} datos={datos} />;
}

export async function ContenidoPortada({ locale, datos }: { locale: Locale; datos: DatosPortada }) {
  const t = await getTranslations({ locale, namespace: "portada" });
  const hoy = formatDate(new Date(), locale, HUSO, { dateStyle: "full" });
  const errorSeccion = <span className="text-danger">{t("error")}</span>;
  const { aprobaciones, costos, operaciones } = datos;

  return (
    <>
      <p className="-mt-6 text-muted first-letter:uppercase">{hoy}</p>

      <section aria-labelledby="resumen" className="flex flex-col gap-3">
        <h2 id="resumen" className="sr-only">
          {t("summary")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {aprobaciones.ok ? (
            <StatCard
              label={t("approvals.title")}
              value={formatNumber(aprobaciones.datos.pendientes, locale)}
              icon="checkCircle"
              tone={aprobaciones.datos.pendientes > 0 ? "warning" : "success"}
              hint={
                aprobaciones.datos.pendientes > 0
                  ? t("approvals.waiting", { count: aprobaciones.datos.pendientes })
                  : t("approvals.none")
              }
            >
              <div>
                <Link href={`/${locale}/aprobaciones`} className={enlaceSecundario}>
                  {t("approvals.review")}
                </Link>
              </div>
            </StatCard>
          ) : (
            <StatCard label={t("approvals.title")} value="—" icon="alert" tone="danger" hint={errorSeccion} />
          )}

          {costos.ok ? (
            <StatCard
              label={t("costs.title")}
              value={costos.datos.costo}
              icon="coins"
              tone={tonoCosto[costos.datos.nivel]}
              hint={t("costs.tokens", { tokens: formatNumber(costos.datos.tokens, locale) })}
            >
              {costos.datos.porcentajeTope !== null && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <div
                      className={`h-full ${colorBarra[costos.datos.nivel]}`}
                      style={{ width: `${Math.min(100, costos.datos.porcentajeTope)}%` }}
                    />
                  </div>
                  <p className="text-sm">
                    {t("costs.budget", { pct: formatNumber(costos.datos.porcentajeTope, locale) })}
                    {costos.datos.periodo && (
                      <span className="text-muted"> {t("costs.period", { periodo: costos.datos.periodo })}</span>
                    )}
                  </p>
                </div>
              )}
            </StatCard>
          ) : (
            <StatCard label={t("costs.title")} value="—" icon="alert" tone="danger" hint={errorSeccion} />
          )}
        </div>
      </section>

      <section aria-labelledby="operaciones" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="operaciones" className="text-lg font-semibold">
            {t("operations.title")}
          </h2>
          <Link href={`/${locale}/operaciones`} className={enlaceSecundario}>
            {t("operations.open")}
          </Link>
        </div>
        {!operaciones.ok ? (
          <p className="text-sm">{errorSeccion}</p>
        ) : operaciones.datos.total === 0 ? (
          <EmptyState
            icon="radar"
            title={t("operations.emptyTitle")}
            description={t("operations.emptyBody")}
            action={
              <Link
                href={`/${locale}/operaciones`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg shadow-xs transition-colors hover:bg-primary-hover"
              >
                {t("operations.emptyAction")}
              </Link>
            }
          />
        ) : (
          <DataTable
            caption={t("operations.caption")}
            hideCaption
            density="compact"
            rows={operaciones.datos.filas}
            rowKey={(f) => f.estado}
            columns={[
              { key: "estado", header: t("operations.state"), rowHeader: true, render: (f) => t(`states.${f.estado}`) },
              {
                key: "cantidad",
                header: t("operations.tasks"),
                align: "right",
                render: (f) => formatNumber(f.cantidad, locale),
              },
            ]}
          />
        )}
      </section>

      <section aria-labelledby="agentes" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="agentes" className="text-lg font-semibold">
            {t("agents.title")}
          </h2>
          <p className="text-sm text-muted">{t("agents.subtitle", { count: AGENTES_AREA.length })}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTES_AREA.map((a) => (
            <li key={a.id}>
              <Link
                href={`/${locale}/agentes#pregunta-${a.id}`}
                className="group flex h-full min-h-16 items-center gap-3 rounded-lg border border-subtle bg-raised p-3 shadow-xs transition-colors hover:border-border hover:bg-surface"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon name="bot" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold leading-snug">{a.area}</span>
                  <span className="text-xs text-muted">{t("agents.ask")}</span>
                </span>
                <Icon name="chevronRight" className="text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
