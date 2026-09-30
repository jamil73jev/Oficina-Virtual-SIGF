"use client";

import Link from "next/link";
import { GrafoOperacion } from "./GrafoOperacion";
import { LineaTiempo } from "./LineaTiempo";
import { ResultadosOperacion } from "./ResultadosOperacion";
import { agentesInvolucrados, totalTokens } from "./estado";
import { mensajesOperaciones, type IdiomaOperaciones } from "./mensajes";
import { useOperacion } from "./use-operacion";
import type { AgenteGrafo } from "./GrafoOperacion";

export function SalaOperacion({ operacionId, idioma, agentes }: { operacionId: string; idioma: IdiomaOperaciones; agentes: readonly AgenteGrafo[] }) {
  const t = mensajesOperaciones[idioma];
  const vista = useOperacion(operacionId);
  if (vista.cargando) return <main aria-busy="true" aria-label={t.cargando} className="space-y-4"><div className="ov-skeleton h-10 rounded-md" /><div className="ov-skeleton h-28 rounded-md" /><div className="grid gap-4 lg:grid-cols-2"><div className="ov-skeleton h-96 rounded-md" /><div className="ov-skeleton h-96 rounded-md" /></div></main>;
  if (vista.error && !vista.instantanea) return <main className="rounded-lg border border-danger bg-danger-soft p-5"><h1 className="text-xl font-semibold text-danger">{t.errorCarga}</h1><button type="button" onClick={vista.reintentar} className="mt-3 min-h-11 rounded-md bg-primary px-4 font-semibold text-primary-fg">{t.reintentar}</button></main>;
  const instantanea = vista.instantanea;
  const traspasos = vista.eventos.filter((evento) => evento.tipo === "traspaso").length;
  const estados = { en_curso: t.enCurso, completada: t.completada, parcial: t.parcial, fallida: t.fallida, sin_datos: t.sinDatos, esperando_aprobacion: t.esperandoAprobacion };
  const final = [...vista.eventos].reverse().find((evento) => evento.tipo === "operacion_finalizada");
  const avisoParcial = instantanea?.estado === "parcial"
    ? t.avisoParcial.replace("{sinDatos}", String(final?.detalle?.pasosSinDatos ?? 0)).replace("{total}", String(final?.detalle?.pasos ?? 0))
    : null;
  const duracionTotal = typeof final?.detalle?.duracionMs === "number"
    ? `${(final.detalle.duracionMs / 1000).toLocaleString(idioma === "es" ? "es-EC" : "en-US", { maximumFractionDigits: 1 })} s`
    : t.noDisponible;
  return <main className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/${idioma}/operaciones`} className="text-sm font-semibold text-primary underline">← {t.volver}</Link><h1 className="mt-2 text-3xl font-semibold">{t.titulo}</h1><p className="mt-1 text-muted">{instantanea?.texto}</p></div><p aria-live="polite" className={`rounded-full border px-3 py-1 text-sm font-semibold ${vista.conexion === "conectado" ? "border-success bg-success-soft text-success" : "border-warning bg-warning-soft text-warning"}`}>{vista.conexion === "conectado" ? `● ${t.conectado}` : `◌ ${t.reconectando}`}</p></header>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
      [t.estado, instantanea ? estados[instantanea.estado] : t.noDisponible], [t.agentes, agentesInvolucrados(vista.eventos)], [t.traspasos, traspasos], [t.tokens, totalTokens(vista.eventos)], [t.duracion, duracionTotal],
    ].map(([etiqueta, valor]) => <div key={String(etiqueta)} className="rounded-lg border border-subtle bg-raised p-4"><dt className="text-sm text-muted">{etiqueta}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{valor}</dd></div>)}</dl>
    {avisoParcial && <aside role="status" className="rounded-lg border border-warning bg-warning-soft p-4 font-semibold text-warning">{avisoParcial}</aside>}
    <GrafoOperacion eventos={vista.eventos} idioma={idioma} agentes={agentes} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(30rem,1.2fr)]"><LineaTiempo eventos={vista.eventos} idioma={idioma} agentes={agentes} /><ResultadosOperacion eventos={vista.eventos} idioma={idioma} /></div>
  </main>;
}
