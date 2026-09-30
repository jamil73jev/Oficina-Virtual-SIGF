import type { ReactNode } from "react";
import { Card } from "./Card";
import { Icon, type NombreIcono } from "./icons";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const iconTone: Record<Tone, string> = {
  neutral: "bg-surface text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** Indicador con cifra destacada (números tabulares) y nota opcional. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: NombreIcono;
  tone?: Tone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && (
          <span className={cn("inline-flex size-8 items-center justify-center rounded-md", iconTone[tone])}>
            <Icon name={icon} />
          </span>
        )}
      </div>
      <p className="tabular font-display text-[2rem] font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </Card>
  );
}
