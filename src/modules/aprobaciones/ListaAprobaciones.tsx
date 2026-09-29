"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, CardTitle, Dialog } from "@/components/ui";
import { intlTags, type Locale } from "@/core/i18n/config";
import { formatearRestante } from "./tiempo";

type Riesgo = "lectura" | "escritura_reversible" | "irreversible";

interface AprobacionVista {
  id: string;
  tipo: string;
  riesgo: Riesgo;
  payload: Record<string, unknown>;
  expiraEn: string;
}

type Pendiente = { a: AprobacionVista; decision: "aprobada" | "rechazada" };
type Aviso = { tono: "ok" | "error"; texto: string };

const CODIGOS_CONOCIDOS = [
  "no_autenticado",
  "rol_insuficiente",
  "ya_decidida",
  "expirada",
  "no_encontrada",
] as const;

export function ListaAprobaciones() {
  const t = useTranslations("approvals");
  const locale = useLocale() as Locale;
  const tag = intlTags[locale] ?? locale;

  const [items, setItems] = useState<AprobacionVista[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);

  const textoError = useCallback(
    (codigo: string | undefined) =>
      (CODIGOS_CONOCIDOS as readonly string[]).includes(codigo ?? "")
        ? t(`errors.${codigo as (typeof CODIGOS_CONOCIDOS)[number]}`)
        : t("errors.generico"),
    [t],
  );

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals", { cache: "no-store" });
      const cuerpo = (await res.json().catch(() => ({}))) as {
        aprobaciones?: AprobacionVista[];
        error?: string;
      };
      if (!res.ok) {
        setErrorCarga(textoError(cuerpo.error));
        return;
      }
      setErrorCarga(null);
      setItems(cuerpo.aprobaciones ?? []);
    } catch {
      setErrorCarga(t("errors.generico"));
    }
  }, [t, textoError]);

  useEffect(() => {
    // Carga inicial: el estado se actualiza tras el fetch asincrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  // Tick lento (30 s): evita ruido para lectores de pantalla y consumo innecesario.
  useEffect(() => {
    const i = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  const confirmar = async () => {
    if (!pendiente) return;
    setEnviando(true);
    try {
      const res = await fetch(
        `/api/approvals/${encodeURIComponent(pendiente.a.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: pendiente.decision }),
        },
      );
      const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setAviso({
          tono: "ok",
          texto: t(
            pendiente.decision === "aprobada" ? "done.aprobada" : "done.rechazada",
          ),
        });
      } else {
        setAviso({ tono: "error", texto: textoError(cuerpo.error) });
      }
    } catch {
      setAviso({ tono: "error", texto: t("errors.generico") });
    } finally {
      setEnviando(false);
      setPendiente(null);
      setAhora(Date.now());
      await cargar();
      encabezado.current?.focus();
    }
  };

  const vigentes = (items ?? []).filter(
    (a) => !formatearRestante(a.expiraEn, ahora, tag).vencida,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          ref={encabezado}
          tabIndex={-1}
          className="text-lg font-semibold outline-none focus-visible:outline-2"
        >
          {t("listTitle")}
        </h2>
        <Button variant="secondary" onClick={() => void cargar()}>
          {t("refresh")}
        </Button>
      </div>

      <div role="status" aria-live="polite" className="min-h-6 text-sm">
        {aviso && (
          <p className={aviso.tono === "ok" ? "text-success" : "text-danger"}>
            {aviso.texto}
          </p>
        )}
      </div>

      {errorCarga && (
        <p role="alert" className="text-sm text-danger">
          {errorCarga}
        </p>
      )}

      {items === null && !errorCarga && (
        <p className="text-sm text-muted">{t("loading")}</p>
      )}

      {items !== null && vigentes.length === 0 && (
        <Card className="flex flex-col gap-1">
          <CardTitle as="h3">{t("emptyTitle")}</CardTitle>
          <p className="text-sm text-muted">{t("emptyBody")}</p>
        </Card>
      )}

      {vigentes.length > 0 && (
        <ul className="flex flex-col gap-4" aria-label={t("listTitle")}>
          {vigentes.map((a) => {
            const { texto } = formatearRestante(a.expiraEn, ahora, tag);
            const riesgoTxt = t(`risk.${a.riesgo}`);
            return (
              <li key={a.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle as="h3">{a.tipo}</CardTitle>
                    <Badge
                      tone={a.riesgo === "lectura" ? "neutral" : "warning"}
                      className={a.riesgo === "irreversible" ? "border-danger text-danger" : ""}
                    >
                      {t("riskLabel")}: {riesgoTxt}
                    </Badge>
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">{t("remainingLabel")}:</span>{" "}
                    {texto}
                  </p>
                  <div>
                    <p className="text-sm font-semibold">{t("payloadLabel")}</p>
                    <pre
                      tabIndex={0}
                      aria-label={`${t("payloadLabel")}: ${a.tipo}`}
                      className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-surface p-3 text-xs"
                    >
                      {JSON.stringify(a.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => setPendiente({ a, decision: "aprobada" })}
                      aria-label={`${t("approve")}: ${a.tipo}`}
                    >
                      {t("approve")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setPendiente({ a, decision: "rechazada" })}
                      aria-label={`${t("reject")}: ${a.tipo}`}
                    >
                      {t("reject")}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={pendiente !== null}
        onClose={() => {
          if (!enviando) setPendiente(null);
        }}
        title={
          pendiente?.decision === "rechazada"
            ? t("confirm.rejectTitle")
            : t("confirm.approveTitle")
        }
        description={
          pendiente
            ? t(
                pendiente.decision === "rechazada"
                  ? "confirm.rejectBody"
                  : "confirm.approveBody",
                { tipo: pendiente.a.tipo, riesgo: t(`risk.${pendiente.a.riesgo}`) },
              )
            : undefined
        }
        closeLabel={t("confirm.close")}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={enviando}
              onClick={() => setPendiente(null)}
            >
              {t("confirm.cancel")}
            </Button>
            <Button
              variant={pendiente?.decision === "rechazada" ? "danger" : "primary"}
              disabled={enviando}
              onClick={() => void confirmar()}
            >
              {pendiente?.decision === "rechazada" ? t("reject") : t("approve")}
            </Button>
          </>
        }
      />
    </div>
  );
}
