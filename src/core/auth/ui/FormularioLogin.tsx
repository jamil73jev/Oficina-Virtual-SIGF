"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { iniciarSesion } from "../acciones";
import { mensajesAuth, type LocaleAuth } from "../mensajes";
import type { EstadoLogin } from "../tipos-acciones";

const INICIAL: EstadoLogin = { error: null };

/** Correo y contrasena. Todos los fallos muestran el mismo mensaje generico (no revela si el correo existe). */
export function FormularioLogin({
  locale,
  siguiente,
  desarrollo,
}: {
  locale: LocaleAuth;
  siguiente: string;
  desarrollo: boolean;
}) {
  const t = mensajesAuth[locale].login;
  const [estado, accion, pendiente] = useActionState(iniciarSesion, INICIAL);
  const alerta = useRef<HTMLParagraphElement>(null);

  const texto =
    estado.error === "credenciales"
      ? t.errorCredenciales
      : estado.error === "datos"
        ? t.errorDatos
        : estado.error === "servicio"
          ? t.errorServicio
          : estado.error === "desarrollo"
            ? t.desarrollo
            : null;

  // Tras un error, el foco va al mensaje para que se anuncie y se lea primero.
  useEffect(() => {
    if (texto) alerta.current?.focus();
  }, [estado, texto]);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siguiente" value={siguiente} />
      {desarrollo && (
        <p className="rounded-md border border-subtle bg-surface p-3 text-sm text-muted">{t.desarrollo}</p>
      )}
      <Input
        label={t.correo}
        name="correo"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        spellCheck={false}
        autoCapitalize="none"
      />
      <Input
        label={t.contrasena}
        name="contrasena"
        type="password"
        autoComplete="current-password"
        required
        maxLength={256}
      />
      {texto && (
        <p
          ref={alerta}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger"
        >
          {texto}
        </p>
      )}
      <Button type="submit" disabled={pendiente} aria-disabled={pendiente}>
        {pendiente ? t.entrando : t.entrar}
      </Button>
    </form>
  );
}
