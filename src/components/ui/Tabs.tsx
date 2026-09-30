"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type TabItem = { id: string; label: string; content: ReactNode };

/** Pestañas con patrón WAI-ARIA: flechas, Inicio y Fin; tabindex móvil. */
export function Tabs({ tabs, label, initial }: { tabs: TabItem[]; label: string; initial?: string }) {
  const base = useId();
  const [activo, setActivo] = useState(initial ?? tabs[0]?.id);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function alTeclear(e: KeyboardEvent, i: number) {
    const n = tabs.length;
    const destino =
      e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowLeft"
          ? (i - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (destino === null) return;
    e.preventDefault();
    setActivo(tabs[destino]!.id);
    refs.current[destino]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-subtle">
        {tabs.map((t, i) => {
          const seleccionada = t.id === activo;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${t.id}`}
              aria-selected={seleccionada}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => setActivo(t.id)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={cn(
                "-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors",
                seleccionada ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== activo}
          tabIndex={0}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
