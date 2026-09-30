import type { ReactNode } from "react";

/** Cabecera de página: título serif, texto de apoyo y acciones opcionales. */
export function PageHeader({
  title,
  subtitle,
  id,
  actions,
}: {
  title: string;
  subtitle?: string;
  id?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-subtle pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 id={id} className="text-[1.75rem] font-semibold sm:text-[2rem]">
          {title}
        </h1>
        {subtitle && <p className="max-w-prose text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
