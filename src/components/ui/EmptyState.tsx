import type { ReactNode } from "react";
import { Icon, type NombreIcono } from "./icons";
import { cn } from "./cn";

/** Estado vacío: explica qué falta e invita a la siguiente acción. */
export function EmptyState({
  title,
  description,
  icon = "inbox",
  action,
  headingLevel: Tag = "h3",
  className,
}: {
  title: string;
  description?: string;
  icon?: NombreIcono;
  action?: ReactNode;
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface p-6",
        className,
      )}
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} size={20} />
      </span>
      <div className="flex flex-col gap-1">
        <Tag className="text-base font-semibold">{title}</Tag>
        {description && <p className="max-w-prose text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
