import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export type Columna<T> = {
  key: string;
  header: string;
  /** Las cifras van a la derecha. */
  align?: "left" | "right";
  /** Columna que identifica la fila: se marca como <th scope="row">. */
  rowHeader?: boolean;
  render: (fila: T) => ReactNode;
};

/** Tabla de datos accesible: caption, th con scope, cifras a la derecha, densidad configurable. */
export function DataTable<T>({
  caption,
  hideCaption = false,
  columns,
  rows,
  rowKey,
  density = "comfortable",
  emptyText,
  className,
}: {
  caption: string;
  hideCaption?: boolean;
  columns: Array<Columna<T>>;
  rows: readonly T[];
  rowKey: (fila: T) => string;
  density?: "compact" | "comfortable";
  emptyText?: string;
  className?: string;
}) {
  const captionId = useId();
  const pad = density === "compact" ? "px-3 py-1.5" : "px-4 py-3";
  return (
    // Región desplazable y enfocable: permite recorrer tablas anchas con teclado.
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className={cn("overflow-x-auto rounded-lg border border-subtle bg-raised shadow-xs", className)}
    >
      <table className="w-full border-collapse text-sm">
        <caption id={captionId} className={hideCaption ? "sr-only" : "px-4 py-3 text-left text-sm font-semibold"}>
          {caption}
        </caption>
        <thead className="bg-surface">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap border-y border-subtle text-xs font-semibold text-muted",
                  pad,
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyText ? (
            <tr>
              <td colSpan={columns.length} className={cn("text-center text-muted", pad)}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((fila) => (
              <tr key={rowKey(fila)} className="border-b border-subtle last:border-b-0 hover:bg-surface">
                {columns.map((c) =>
                  c.rowHeader ? (
                    <th key={c.key} scope="row" className={cn("text-left font-medium", pad)}>
                      {c.render(fila)}
                    </th>
                  ) : (
                    <td key={c.key} className={cn(pad, c.align === "right" ? "text-right" : "text-left")}>
                      {c.render(fila)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
