import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface text-foreground border-border",
  success: "bg-success-soft text-success border-success",
  warning: "bg-warning-soft text-warning border-warning",
  danger: "bg-danger-soft text-danger border-danger",
  info: "bg-info-soft text-info border-info",
  accent: "bg-primary-soft text-primary border-primary",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
