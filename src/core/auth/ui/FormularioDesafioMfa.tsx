"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { verificarDesafioMfa } from "../acciones";
import { mensajesAuth, type LocaleAuth } from "../mensajes";
import type { EstadoDesafio } from "../tipos-acciones";

const INICIAL: EstadoDesafio = { error: null };
const ID_CODIGO = "codigo-desafio-mfa";

/** Desafio TOTP tras el login (eleva la sesion a AAL2). */
export function FormularioDesafioMfa({
  locale,
  siguiente,
  desarrollo,
}: {
  locale: LocaleAuth;
  siguiente: string;
  desarrollo: boolean;
}) {
  const t = mensajesAuth[locale].desafio;
  const tMfa = mensajesAuth[locale].mfa;
  const [estado, accion, pendiente] = useActionState(verificarDesafioMfa, INICIAL);

  const error =
    estado.error === "formato"
      ? t.errorFormato
      : estado.error === "codigo"
        ? t.errorCodigo
        : estado.error === "sin_factor"
          ? t.errorSinFactor
          : estado.error === "desarrollo"
            ? tMfa.noDisponible
            : undefined;

  // Tras un error se vuelve al campo (el mensaje queda asociado con aria-describedby).
  useEffect(() => {
    if (error) document.getElementById(ID_CODIGO)?.focus();
  }, [estado, error]);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siguiente" value={siguiente} />
      {desarrollo && (
        <p className="rounded-md border border-subtle bg-surface p-3 text-sm text-muted">{tMfa.noDisponible}</p>
      )}
      <Input
        id={ID_CODIGO}
        label={t.codigo}
        hint={t.ayudaCodigo}
        error={error}
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        className="font-mono tracking-widest"
      />
      <Button type="submit" disabled={pendiente} aria-disabled={pendiente}>
        {pendiente ? t.verificando : t.verificar}
      </Button>
      {estado.error === "sin_factor" && (
        <Link href={`/${locale}/seguridad/mfa`} className="text-sm font-medium text-primary underline underline-offset-4">
          {t.irAInscribir}
        </Link>
      )}
    </form>
  );
}
