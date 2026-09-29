import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, locales } from "@/core/i18n/config";
import { formatTimeZone } from "@/core/i18n/format";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "optional",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  const nav = [
    { key: "home", href: `/${locale}` },
    { key: "projects", href: `/${locale}/proyectos` },
    { key: "documents", href: `/${locale}/documentos` },
    { key: "finance", href: `/${locale}/finanzas` },
    { key: "agents", href: `/${locale}/agentes` },
    { key: "approvals", href: `/${locale}/aprobaciones` },
    { key: "costs", href: `/${locale}/costos` },
  ] as const;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider>
          <a
            href="#contenido"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
          >
            {t("app.skipToContent")}
          </a>
          <div className="flex min-h-screen flex-col md:flex-row">
            <aside className="border-b border-subtle bg-surface md:w-64 md:border-b-0 md:border-r">
              <div className="p-4 text-lg font-bold">{t("app.name")}</div>
              <nav aria-label={t("nav.label")} className="px-2 pb-4">
                <ul className="flex flex-wrap gap-1 md:flex-col">
                  {nav.map(({ key, href }, i) => (
                    <li key={key}>
                      <Link
                        href={href}
                        aria-current={i === 0 ? "page" : undefined}
                        className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-raised aria-[current=page]:bg-raised aria-[current=page]:font-semibold"
                      >
                        {t(`nav.${key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
            <div className="flex flex-1 flex-col">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-6 py-3">
                <p className="text-sm text-muted">
                  {t("header.timezone")}: {formatTimeZone(DEFAULT_TIME_ZONE, locale)}
                </p>
                <nav aria-label={t("header.language")}>
                  <ul className="flex gap-1">
                    {locales.map((l) => (
                      <li key={l}>
                        <Link
                          href={`/${l}`}
                          hrefLang={l}
                          lang={l}
                          aria-current={l === locale ? "true" : undefined}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-3 text-sm hover:bg-surface aria-[current=true]:bg-primary aria-[current=true]:text-primary-fg"
                        >
                          {t(`locales.${l}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </header>
              <main id="contenido" className="flex-1 p-6">
                {children}
              </main>
            </div>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
