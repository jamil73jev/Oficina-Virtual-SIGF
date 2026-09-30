import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Marcador de carga. Decorativo: el contenedor debe anunciar el estado (aria-busy o texto oculto). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("ov-skeleton h-4 rounded-md", className)} {...props} />;
}
