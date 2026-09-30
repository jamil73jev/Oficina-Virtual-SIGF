import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border-transparent shadow-xs",
  secondary: "bg-raised text-foreground border-border hover:bg-surface",
  ghost: "bg-transparent text-foreground border-transparent hover:bg-surface",
  danger: "bg-raised text-danger border-danger hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 min-w-11 px-4 text-sm",
  sm: "min-h-9 min-w-9 px-3 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
