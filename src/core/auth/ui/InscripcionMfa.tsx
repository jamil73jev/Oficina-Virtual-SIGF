"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmarInscripcionMfa, iniciarInscripcionMfa } from "../acciones";
import { mensajesAuth, type LocaleAuth } from "../mensajes";
import type { EstadoConfirmacion, ResultadoInicioInscripcion } from "../tipos-acciones";

const INICIAL: EstadoConfirmacion = { ok: false, error: null };
const ID_CODIGO = "codigo-inscripcion-mfa";
const ID_EXITO = "exito-inscripcion-mfa";

/**
 * Inscripcion de un factor TOTP: 1) pide a Supabase (en el servidor) un QR como imagen data:,
 * 2) verifica el primer codigo. El secreto solo se muestra aqui, nunca se registra.
 */
export function InscripcionMfa({ locale, disponible }: { locale: LocaleAuth; disponible: boolean }) {
  const t = mensajesAuth[locale].mfa;
  const [inicio, setInicio] = useState<ResultadoInicioInscripcion | null>(null);
  const [generando, iniciarTransicion] = useTransition();
  const [estado, accion, confirmando] = useActionState(confirmarInscripcionMfa, INICIAL);

  const errorCodigo =
    estado.error === "formato" ? t.errorFormato : estado.error === "codigo" ? t.errorCodigo : undefined;

  // Al mostrar el QR, el foco va al campo del codigo; tras un error, tambien.
  useEffect(() => {
    if (inicio?.ok || errorCodigo) document.getElementById(ID_CODIGO)?.focus();
  }, [inicio, estado, errorCodigo]);
  useEffect(() => {
    if (estado.ok) document.getElementById(ID_EXITO)?.focus();
  }, [estado.ok]);

  if (!disponible) {
    return <p className="rounded-md border border-subtle bg-surface p-3 text-sm text-muted">{t.noDisponible}</p>;
  }

  if (estado.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p
          id={ID_EXITO}
          tabIndex={-1}
          role="status"
          className="rounded-md border border-success bg-success-soft p-3 text-sm font-medium text-success"
        >
          {t.exito}
        </p>
        <Link
          href={`/${locale}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-transparent bg-primary px-4 text-sm font-semibold text-primary-fg shadow-xs hover:bg-primary-hover"
        >
          {t.irPortada}
        </Link>
      </div>
    );
  }

  const falloInicio =
    inicio && !inicio.ok
      ? inicio.error === "ya_activa"
        ? t.activa
        : inicio.error === "desarrollo"
          ? t.noDisponible
          : t.errorInscripcion
      : null;

  return (
    <div className="flex flex-col gap-5">
      {!inicio?.ok && (
        <div className="flex flex-col gap-3">
          {falloInicio && (
            <p role="alert" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger">
              {falloInicio}
            </p>
          )}
          <Button
            onClick={() => iniciarTransicion(async () => setInicio(await iniciarInscripcionMfa()))}
            disabled={generando}
            aria-disabled={generando}
            className="self-start"
          >
            {generando ? t.generando : t.empezar}
          </Button>
        </div>
      )}

      {inicio?.ok && (
        <form action={accion} className="flex flex-col gap-4">
          <input type="hidden" name="factorId" value={inicio.factorId} />
          <p className="text-sm">{t.paso1}</p>
          {/* QR devuelto por Supabase como data: (la CSP permite img-src data:). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={inicio.qr}
            alt={t.altQr}
            width={200}
            height={200}
            className="size-50 rounded-md border border-border bg-white p-2"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">{t.secretoManual}</p>
            <code
              className="break-all rounded-md border border-subtle bg-surface p-2 font-mono text-sm"
            >
              {inicio.secreto}
            </code>
          </div>
          <p className="text-sm">{t.paso2}</p>
          <Input
            id={ID_CODIGO}
            label={mensajesAuth[locale].desafio.codigo}
            hint={mensajesAuth[locale].desafio.ayudaCodigo}
            error={errorCodigo}
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            className="font-mono tracking-widest"
          />
          {estado.error === "inscripcion" && (
            <p role="alert" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger">
              {t.errorInscripcion}
            </p>
          )}
          <Button type="submit" disabled={confirmando} aria-disabled={confirmando} className="self-start">
            {confirmando ? t.confirmando : t.confirmar}
          </Button>
        </form>
      )}
    </div>
  );
}
