"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { obtenerSesionVisible } from "@/core/auth/acciones";
import { localeAuth, mensajesAuth } from "@/core/auth/mensajes";
import type { SesionVisible } from "@/core/auth/tipos-acciones";
import { BotonCerrarSesion } from "@/core/auth/ui/BotonCerrarSesion";
import { Icon } from "@/components/ui/icons";

/**
 * Menu de usuario de la cabecera: correo, rol, enlace a seguridad (MFA) y cierre de sesion.
 * Patron "disclosure" (boton con aria-expanded); Escape cierra y devuelve el foco al boton.
 * Los datos llegan de una accion de servidor que solo devuelve los de la propia sesion.
 */
export function MenuUsuario({ locale, ruta }: { locale: string; ruta: string }) {
  const idioma = localeAuth(locale);
  const t = mensajesAuth[idioma];
  const [sesion, setSesion] = useState<SesionVisible | null>(null);
  const [abierto, setAbierto] = useState(false);
  const panelId = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  // Se recarga al cambiar de ruta (p. ej. tras el login o el cierre de sesion).
  useEffect(() => {
    let vigente = true;
    obtenerSesionVisible()
      .then((s) => {
        if (vigente) setSesion(s);
      })
      .catch(() => {
        if (vigente) setSesion(null);
      });
    return () => {
      vigente = false;
    };
  }, [ruta]);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  if (!sesion) return null;
  const nombre = sesion.correo ?? t.menu.identidadDesarrollo;
  const rol = t.roles[sesion.rol];

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={panelId}
        onClick={() => setAbierto((v) => !v)}
        className="flex min-h-11 max-w-64 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-surface"
      >
        <span className="sr-only">{t.menu.cuenta}: </span>
        <span className="truncate">{nombre}</span>
        <Icon name="chevronRight" className={abierto ? "-rotate-90" : "rotate-90"} />
      </button>
      <div
        id={panelId}
        hidden={!abierto}
        className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-subtle bg-raised p-4 text-foreground shadow-md"
      >
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-muted">{t.menu.cuenta}</dt>
            <dd className="break-all font-medium">{nombre}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.menu.rol}</dt>
            <dd className="font-medium">{rol}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-col gap-2 border-t border-subtle pt-4">
          <Link
            href={`/${idioma}/seguridad/mfa`}
            onClick={() => setAbierto(false)}
            className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary underline underline-offset-4 hover:bg-surface"
          >
            {t.menu.seguridad}
          </Link>
          <BotonCerrarSesion locale={idioma} />
        </div>
      </div>
    </div>
  );
}
