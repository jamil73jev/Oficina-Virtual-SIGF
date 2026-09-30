"use client";

import type { EventoTraza } from "@/orchestration/traza/eventos";
import { estadosAgentes, ultimoTraspaso, type EstadoAgenteOperacion, type IdAgenteOperacion } from "./estado";
import { mensajesOperaciones, type IdiomaOperaciones } from "./mensajes";

export interface AgenteGrafo { id: IdAgenteOperacion; nombre: string }

const GRUPOS: Array<{ id: "direccion" | "gestion" | "rentas" | "control"; agentes: IdAgenteOperacion[] }> = [
  { id: "direccion", agentes: ["director", "planificacion"] },
  { id: "gestion", agentes: ["tesorero", "presupuestista", "contador", "pagador", "cajero-mayor"] },
  { id: "rentas", agentes: ["rentas", "coactiva", "cartera"] },
  { id: "control", agentes: ["control-estadistica", "datos"] },
];

const ICONOS: Record<EstadoAgenteOperacion, string> = { inactivo: "○", trabajando: "◉", completado: "✓", sin_datos: "∅", error: "!" };
const CLASES: Record<EstadoAgenteOperacion, string> = {
  inactivo: "fill-surface stroke-border text-muted", trabajando: "fill-info-soft stroke-info text-info",
  completado: "fill-success-soft stroke-success text-success", sin_datos: "fill-warning-soft stroke-warning text-warning",
  error: "fill-danger-soft stroke-danger text-danger",
};

const posiciones = Object.fromEntries(GRUPOS.flatMap((grupo, columna) => grupo.agentes.map((id, fila) => [id, {
  x: 25 + columna * 265, y: 65 + fila * 88,
}]))) as Record<IdAgenteOperacion, { x: number; y: number }>;

export function GrafoOperacion({ eventos, idioma, agentes }: { eventos: readonly EventoTraza[]; idioma: IdiomaOperaciones; agentes: readonly AgenteGrafo[] }) {
  const t = mensajesOperaciones[idioma];
  const estados = estadosAgentes(eventos);
  const etiquetaEstado = (estado: EstadoAgenteOperacion) => estado === "sin_datos" ? t.sinDatos : t[estado];
  const traspasos = eventos.filter((evento) => evento.tipo === "traspaso" && evento.agenteId && evento.haciaAgenteId);
  const ultimo = ultimoTraspaso(eventos);
  return (
    <section className="rounded-lg border border-subtle bg-raised p-4" aria-labelledby="titulo-grafo">
      <h2 id="titulo-grafo" className="mb-3 text-lg font-semibold">{t.grafo}</h2>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 1060 530" className="min-w-[900px]" role="img" aria-labelledby="titulo-grafo descripcion-grafo">
          <desc id="descripcion-grafo">{t.subtitulo}</desc>
          <defs><marker id="flecha-operacion" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="fill-primary" /></marker></defs>
          {GRUPOS.map((grupo, columna) => <text key={grupo.id} x={25 + columna * 265} y="28" className="fill-foreground text-[15px] font-semibold">{t[grupo.id]}</text>)}
          {traspasos.map((evento) => {
            const origen = posiciones[evento.agenteId as IdAgenteOperacion];
            const destino = posiciones[evento.haciaAgenteId as IdAgenteOperacion];
            if (!origen || !destino) return null;
            const activo = evento.secuencia === ultimo?.secuencia;
            return <line key={evento.secuencia} x1={origen.x + 102} y1={origen.y + 31} x2={destino.x} y2={destino.y + 31}
              markerEnd="url(#flecha-operacion)" className={`${activo ? "stroke-primary motion-safe:animate-pulse" : "stroke-border"} stroke-2`} />;
          })}
          {agentes.map((agente) => {
            const punto = posiciones[agente.id];
            const estado = estados[agente.id];
            return <g key={agente.id} transform={`translate(${punto.x} ${punto.y})`} role="img" aria-label={`${agente.nombre}: ${etiquetaEstado(estado)}`}>
              <rect width="210" height="64" rx="8" className={`${CLASES[estado]} stroke-2`} />
              <text x="12" y="24" className="fill-foreground text-[12px] font-semibold">{agente.nombre.replace(/^Agente (de )?/u, "").slice(0, 29)}</text>
              <text x="12" y="47" className={`${CLASES[estado].split(" ").at(-1)} text-[12px]`}><tspan>{ICONOS[estado]} </tspan>{etiquetaEstado(estado)}</text>
            </g>;
          })}
        </svg>
      </div>
    </section>
  );
}
