"use client";

import { useState } from "react";
import type { EventoTraza } from "@/orchestration/traza/eventos";
import type { AgenteGrafo } from "./GrafoOperacion";
import { mensajesOperaciones, type IdiomaOperaciones } from "./mensajes";

export function LineaTiempo({ eventos, idioma, agentes }: { eventos: readonly EventoTraza[]; idioma: IdiomaOperaciones; agentes: readonly AgenteGrafo[] }) {
  const t = mensajesOperaciones[idioma];
  const [agente, setAgente] = useState("");
  const filtrados = agente ? eventos.filter((evento) => evento.agenteId === agente || evento.haciaAgenteId === agente) : eventos;
  const nombre = (id?: string) => agentes.find((item) => item.id === id)?.nombre ?? id ?? "—";
  const duracion = (ms: unknown) => typeof ms === "number" && Number.isFinite(ms) ? `${(ms / 1000).toLocaleString(idioma === "es" ? "es-EC" : "en-US", { maximumFractionDigits: 1 })} s` : "—";
  const detalleLegible = (evento: EventoTraza) => {
    if (evento.tipo === "tabla" || evento.tipo === "entregable") {
      const resumen = evento.detalle?.resumen;
      if (resumen && typeof resumen === "object" && !Array.isArray(resumen)) {
        const datos = resumen as Record<string, unknown>;
        return t.tablasResumen
          .replace("{tablas}", String(datos.tablas ?? 0))
          .replace("{filas}", String(datos.filas ?? 0));
      }
      return "";
    }
    const tiempos = evento.detalle?.duracionMs;
    if (tiempos && typeof tiempos === "object" && !Array.isArray(tiempos)) {
      const valores = tiempos as Record<string, unknown>;
      return t.duracionPaso.replace("{herramientas}", duracion(valores.herramientas)).replace("{comentario}", duracion(valores.comentario));
    }
    return evento.detalle ? Object.entries(evento.detalle).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ") : "";
  };
  return <section className="rounded-lg border border-subtle bg-raised p-4" aria-labelledby="titulo-linea">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <h2 id="titulo-linea" className="text-lg font-semibold">{t.lineaTiempo}</h2>
      <label className="text-sm font-semibold">{t.filtrarAgente}<select value={agente} onChange={(e) => setAgente(e.target.value)} className="ml-2 min-h-11 rounded-md border border-border bg-raised px-3">
        <option value="">{t.todosAgentes}</option>{agentes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
      </select></label>
    </div>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{filtrados.at(-1)?.titulo ?? ""}</p>
    <div>
      {filtrados.length === 0 ? <p className="text-muted">{t.sinEventos}</p> : <ol className="space-y-3 border-l-2 border-subtle pl-4">
        {filtrados.map((evento) => <li key={evento.secuencia} className="relative"><span aria-hidden="true" className="absolute -left-[1.36rem] top-1.5 size-2 rounded-full bg-primary" />
          <div className="flex flex-wrap gap-x-2 text-xs text-muted"><time dateTime={evento.ts}>{new Intl.DateTimeFormat(idioma === "es" ? "es-EC" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(evento.ts))}</time><span>{nombre(evento.agenteId)}</span></div>
          <p className="font-semibold">{evento.titulo}</p>{detalleLegible(evento) && <p className="text-sm text-muted">{detalleLegible(evento)}</p>}
        </li>)}
      </ol>}
    </div>
  </section>;
}
