"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { mensajesOperaciones, type IdiomaOperaciones } from "./mensajes";

const MAXIMO = 2000;

export function FormularioOperacion({ idioma }: { idioma: IdiomaOperaciones }) {
  const t = mensajesOperaciones[idioma];
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ejemplos = [t.ejemplo1, t.ejemplo2, t.ejemplo3];
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return setError(t.requerida);
    if (limpio.length > MAXIMO) return setError(t.demasiadoLarga);
    setEnviando(true); setError(null);
    try {
      const respuesta = await fetch("/api/operaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: limpio, idioma }) });
      const cuerpo = await respuesta.json() as { operacionId?: string };
      if (respuesta.status !== 202 || !cuerpo.operacionId) throw new Error("crear");
      router.push(`/${idioma}/operaciones/${encodeURIComponent(cuerpo.operacionId)}`);
    } catch { setError(t.errorCrear); setEnviando(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-6">
    <header><h1 className="text-3xl font-semibold">{t.titulo}</h1><p className="mt-2 text-muted">{t.subtitulo}</p></header>
    <Card><form onSubmit={enviar} className="space-y-4">
      <div><label htmlFor="tarea-operacion" className="mb-2 block font-semibold">{t.tarea}</label><textarea id="tarea-operacion" rows={7} maxLength={MAXIMO} value={texto} onChange={(e) => { setTexto(e.target.value); setError(null); }} placeholder={t.placeholder} aria-describedby="contador-operacion error-operacion" className="w-full rounded-md border border-border bg-raised p-3 text-foreground placeholder:text-muted" />
        <p id="contador-operacion" className="mt-1 text-right text-sm text-muted">{t.contador.replace("{actual}", String(texto.length)).replace("{maximo}", String(MAXIMO))}</p></div>
      {error && <p id="error-operacion" role="alert" className="rounded-md border border-danger bg-danger-soft p-3 text-danger">{error}</p>}
      <Button type="submit" disabled={enviando}>{enviando ? t.encargando : t.encargar}</Button>
    </form></Card>
    <section aria-labelledby="ejemplos-operacion"><h2 id="ejemplos-operacion" className="mb-3 text-lg font-semibold">{t.ejemplos}</h2><div className="grid gap-3 md:grid-cols-3">{ejemplos.map((ejemplo) => <button type="button" key={ejemplo} onClick={() => { setTexto(ejemplo); setError(null); }} className="min-h-11 rounded-lg border border-border bg-raised p-4 text-left hover:bg-surface">{ejemplo}</button>)}</div></section>
  </main>;
}
