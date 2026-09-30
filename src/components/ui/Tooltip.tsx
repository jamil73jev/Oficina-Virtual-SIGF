"use client";

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from "react";

/**
 * Tooltip sencillo: aparece con hover o foco y se cierra con Esc (WCAG 1.4.13).
 * El hijo debe ser un único elemento enfocable; recibe aria-describedby.
 */
export function Tooltip({ label, children }: { label: string; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [visible]);

  if (!isValidElement(children)) return children;
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        hidden={!visible}
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-max max-w-64 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md"
      >
        {label}
      </span>
    </span>
  );
}
