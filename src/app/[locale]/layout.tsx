import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, locales } from "@/core/i18n/config";
import { formatTimeZone } from "@/core/i18n/format";
import { AppShell, type EtiquetasShell } from "@/components/layout/AppShell";
import { SCRIPT_TEMA } from "@/components/theme/tema";
import "../globals.css";

// Titulos: pila serif del sistema (sin descarga: el LCP no espera una fuente web).
// Fuentes autoalojadas por next/font (se descargan al compilar; la CSP no permite fuentes remotas).
const fuenteUi = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: "variable",
  display: "optional",
});
const fuenteCodigo = IBM_Plex_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false, // no se usa en el contenido inicial: no compite con el LCP
});

// Huso de ejemplo; la organizacion lo definira desde su configuracion.
const DEFAULT_TIME_ZONE = "America/Guayaquil";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("name"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale });
  const labels: EtiquetasShell = {
    appName: t("app.name"),
    skip: t("app.skipToContent"),
    navLabel: t("nav.label"),
    items: {
      home: t("nav.home"),
      operations: t("nav.operations"),
      projects: t("nav.projects"),
      approvals: t("nav.approvals"),
      documents: t("nav.documents"),
      finance: t("nav.finance"),
      costs: t("nav.costs"),
      agents: t("nav.agents"),
    },
    groups: { work: t("nav.groups.work"), analysis: t("nav.groups.analysis"), team: t("nav.groups.team") },
    openMenu: t("nav.openMenu"),
    closeMenu: t("nav.closeMenu"),
    language: t("header.language"),
    timezone: t("header.timezone"),
    theme: {
      label: t("nav.theme.label"),
      light: t("nav.theme.light"),
      dark: t("nav.theme.dark"),
      system: t("nav.theme.system"),
    },
    locales: Object.fromEntries(locales.map((l) => [l, t(`locales.${l}`)])),
  };

  return (
    // suppressHydrationWarning: el script previo al pintado fija data-theme antes de hidratar.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fuenteUi.variable} ${fuenteCodigo.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full">
        <NextIntlClientProvider>
          <AppShell
            locale={locale}
            locales={locales}
            labels={labels}
            timeZoneText={formatTimeZone(DEFAULT_TIME_ZONE, locale)}
          >
            {children}
          </AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
