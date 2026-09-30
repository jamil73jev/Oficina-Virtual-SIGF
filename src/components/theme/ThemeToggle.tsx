"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import {
  aplicarTema,
  guardarPreferencia,
  leerPreferencia,
  resolverTema,
  type PreferenciaTema,
} from "./tema";

export type EtiquetasTema = { label: string; light: string; dark: string; system: string };

const opciones: Array<{ valor: PreferenciaTema; icono: "sun" | "moon" | "monitor" }> = [
  { valor: "light", icono: "sun" },
  { valor: "dark", icono: "moon" },
  { valor: "system", icono: "monitor" },
];

const consulta = "(prefers-color-scheme: dark)";

/** Conmutador Claro / Oscuro / Sistema. La eleccion se recuerda en localStorage. */
export function ThemeToggle({ etiquetas }: { etiquetas: EtiquetasTema }) {
  // "system" hasta montar: coincide con el HTML del servidor y evita desajuste de hidratacion.
  const [pref, setPref] = useState<PreferenciaTema>("system");

  useEffect(() => {
    // Lee el valor persistido tras montar (localStorage no existe en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(leerPreferencia(window.localStorage));
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia(consulta);
    const alCambiar = () => aplicarTema(document.documentElement, resolverTema("system", mq.matches));
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [pref]);

  function elegir(nueva: PreferenciaTema) {
    setPref(nueva);
    guardarPreferencia(window.localStorage, nueva);
    aplicarTema(document.documentElement, resolverTema(nueva, window.matchMedia(consulta).matches));
  }

  return (
    <div role="group" aria-label={etiquetas.label} className="inline-flex rounded-md border border-border bg-raised p-0.5">
      {opciones.map(({ valor, icono }) => (
        <button
          key={valor}
          type="button"
          aria-pressed={pref === valor}
          aria-label={etiquetas[valor]}
          title={etiquetas[valor]}
          onClick={() => elegir(valor)}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-sm transition-colors",
            pref === valor ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface hover:text-foreground",
          )}
        >
          <Icon name={icono} />
        </button>
      ))}
    </div>
  );
}
