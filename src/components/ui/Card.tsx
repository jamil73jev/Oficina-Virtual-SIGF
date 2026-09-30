import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "default" | "flat" | "raised";

const variants: Record<Variant, string> = {
  default: "border border-subtle bg-raised shadow-xs",
  flat: "border border-subtle bg-surface",
  raised: "border border-subtle bg-raised shadow-md",
};

export function Card({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: Variant }) {
  return <div className={cn("rounded-lg p-5 text-foreground", variants[variant], className)} {...props} />;
}

export function CardTitle({
  as: Tag = "h2",
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-base font-semibold leading-snug", className)} {...props} />;
}
