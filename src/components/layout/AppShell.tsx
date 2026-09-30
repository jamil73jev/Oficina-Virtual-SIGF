"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle, type EtiquetasTema } from "@/components/theme/ThemeToggle";
import { esRutaActiva, quitarLocale } from "@/components/theme/tema";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { MenuUsuario } from "./MenuUsuario";
import { NAV_GRUPOS, NAV_PRINCIPAL, type ClaveGrupo, type ClaveNav, type ItemNav } from "./nav";

export interface EtiquetasShell {
  appName: string;
  skip: string;
  navLabel: string;
  items: Record<ClaveNav, string>;
  groups: Record<ClaveGrupo, string>;
  openMenu: string;
  closeMenu: string;
  language: string;
  timezone: string;
  theme: EtiquetasTema;
  locales: Record<string, string>;
}

/** Marco de la aplicación: barra lateral con enlace activo real, cabecera con idioma y tema. */
export function AppShell({
  locale,
  locales,
  labels,
  timeZoneText,
  children,
}: {
  locale: string;
  locales: readonly string[];
  labels: EtiquetasShell;
  timeZoneText: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? `/${locale}`;
  const [abierto, setAbierto] = useState(false);
  const menuId = "menu-principal";
  // En el login (y su desafio MFA) no hay navegacion de la oficina ni menu de usuario.
  const enAcceso = /^\/login(\/|$)/.test(quitarLocale(pathname, locales));

  const enlace = (item: ItemNav, principal = false) => {
    const href = `/${locale}${item.path}`;
    const activo = esRutaActiva(pathname, href, locales);
    return (
      <li key={item.key}>
        <Link
          href={href}
          aria-current={activo ? "page" : undefined}
          onClick={() => setAbierto(false)}
          className={cn(
            "group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
            principal ? "font-semibold" : "font-medium",
            activo
              ? "bg-primary-soft font-semibold text-primary shadow-[inset_3px_0_0_var(--primary)]"
              : principal
                ? "border border-subtle bg-raised text-foreground shadow-xs hover:border-border"
                : "text-muted hover:bg-raised hover:text-foreground",
          )}
        >
          <Icon name={item.icon} />
          {labels.items[item.key]}
        </Link>
      </li>
    );
  };

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        {labels.skip}
      </a>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside hidden={enAcceso} className="border-b border-subtle bg-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 px-4 py-3 md:py-5">
            <p className="font-display text-lg font-semibold tracking-tight">{labels.appName}</p>
            <button
              type="button"
              aria-expanded={abierto}
              aria-controls={menuId}
              aria-label={abierto ? labels.closeMenu : labels.openMenu}
              onClick={() => setAbierto((v) => !v)}
              className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-raised md:hidden"
            >
              <Icon name={abierto ? "close" : "menu"} />
            </button>
          </div>
          <nav
            id={menuId}
            aria-label={labels.navLabel}
            className={cn("px-3 pb-5", abierto ? "block" : "hidden", "md:block")}
          >
            <ul className="flex flex-col gap-1">{NAV_PRINCIPAL.map((i) => enlace(i, i.key === "operations"))}</ul>
            {NAV_GRUPOS.map((g) => (
              <div key={g.key} className="mt-5">
                <p id={`grupo-${g.key}`} className="px-3 pb-1 text-xs font-semibold text-muted">
                  {labels.groups[g.key]}
                </p>
                <ul aria-labelledby={`grupo-${g.key}`} className="flex flex-col gap-1">
                  {g.items.map((i) => enlace(i))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle bg-raised px-4 py-2.5 sm:px-6">
            <p className="text-sm text-muted">
              {labels.timezone}: {timeZoneText}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {!enAcceso && <MenuUsuario locale={locale} ruta={pathname} />}
              <ThemeToggle etiquetas={labels.theme} />
              <nav aria-label={labels.language}>
                <ul className="flex gap-1">
                  {locales.map((l) => (
                    <li key={l}>
                      <Link
                        href={`/${l}${quitarLocale(pathname, locales) === "/" ? "" : quitarLocale(pathname, locales)}`}
                        hrefLang={l}
                        lang={l}
                        aria-current={l === locale ? "true" : undefined}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-3 text-sm hover:bg-surface aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-fg"
                      >
                        {labels.locales[l] ?? l}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </header>
          <main id="contenido" className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
