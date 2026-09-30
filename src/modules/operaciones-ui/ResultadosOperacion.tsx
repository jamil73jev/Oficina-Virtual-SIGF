"use client";

import type { EventoTraza } from "@/orchestration/traza/eventos";
import { bloquesRespuesta } from "@/modules/agentes-ui/presentacion";
import { tablaACsv, type TablaHerramienta } from "@/modules/agentes-area/tablas";
import { mensajesOperaciones, type IdiomaOperaciones } from "./mensajes";

interface TablaEvento {
  titulo: string;
  columnas: Array<{ clave: string; etiqueta: string }>;
  filas: Array<{ celdas: Array<{ columna: string; texto: string; valorExacto?: unknown }> }>;
  fuente?: string;
  formula?: string;
  filtros?: string[];
  corte?: unknown;
  filasTotales?: number;
  filasCompletas?: TablaHerramienta["filas"];
  avisoFilas?: string;
  avisoTablas?: string;
}

const objeto = (valor: unknown): valor is Record<string, unknown> => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

function esTabla(valor: unknown): valor is TablaEvento {
  return objeto(valor) && typeof valor.titulo === "string" && Array.isArray(valor.columnas) && Array.isArray(valor.filas);
}

export function tablasDeEventos(eventos: readonly EventoTraza[]): TablaEvento[] {
  const tablas: TablaEvento[] = [];
  for (const evento of eventos.filter((item) => item.tipo === "tabla" || item.tipo === "entregable")) {
    const detalle = evento.detalle;
    if (!detalle) continue;
    const candidatas = [detalle, detalle.tabla, ...(Array.isArray(detalle.tablas) ? detalle.tablas : [])];
    for (const candidata of candidatas) if (esTabla(candidata)) tablas.push(candidata);
  }
  return tablas;
}

export function entregableDeEventos(eventos: readonly EventoTraza[]): string | null {
  const evento = [...eventos].reverse().find((item) => item.tipo === "entregable");
  if (!evento?.detalle) return null;
  for (const clave of ["markdown", "contenido", "texto"]) if (typeof evento.detalle[clave] === "string") return evento.detalle[clave];
  return null;
}

const comentarioDe = (evento: EventoTraza) => {
  const detalle = evento.detalle;
  for (const clave of ["comentario", "texto", "contenido"]) if (typeof detalle?.[clave] === "string") return detalle[clave];
  return evento.titulo;
};

const cifrasNoVerificadasDe = (evento: EventoTraza): string[] => {
  const valor = evento.detalle?.cifrasNoVerificadas;
  return Array.isArray(valor)
    ? valor.map((item) => objeto(item) && typeof item.texto === "string" ? item.texto : String(item))
    : [];
};

function Tabla({ tabla, idioma }: { tabla: TablaEvento; idioma: IdiomaOperaciones }) {
  const t = mensajesOperaciones[idioma];
  const completa = Array.isArray(tabla.filasCompletas) || (tabla.filasTotales ?? tabla.filas.length) === tabla.filas.length;
  const descargarCsv = () => {
    const csv = tablaACsv(tabla as TablaHerramienta);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `${tabla.titulo.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase() || "tabla"}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  };
  return <section className="overflow-x-auto rounded-md border border-subtle p-3">
    {tabla.avisoFilas && <p role="status" className="mb-2 font-semibold">{tabla.avisoFilas}</p>}
    {tabla.avisoTablas && <p role="status" className="mb-2 text-sm">{tabla.avisoTablas}</p>}
    <table className="w-full border-collapse text-left text-sm"><caption className="mb-2 text-left font-semibold">{tabla.titulo}</caption>
      <thead><tr>{tabla.columnas.map((columna) => <th key={columna.clave} scope="col" className="border border-subtle bg-surface p-2">{columna.etiqueta}</th>)}</tr></thead>
      <tbody>{tabla.filas.map((fila, indice) => <tr key={indice}>{fila.celdas.map((celda) => <td key={celda.columna} className="border border-subtle p-2 tabular-nums">{celda.texto}</td>)}</tr>)}</tbody>
    </table>
    <dl className="mt-3 grid gap-1 text-xs"><div><dt className="inline font-semibold">{t.fuente}: </dt><dd className="inline">{tabla.fuente || t.noDisponible}</dd></div>
      <div><dt className="inline font-semibold">{t.formula}: </dt><dd className="inline">{tabla.formula || t.noDisponible}</dd></div>
      <div><dt className="inline font-semibold">{t.filtros}: </dt><dd className="inline">{tabla.filtros?.join("; ") || t.noDisponible}</dd></div>
      <div><dt className="inline font-semibold">{t.corte}: </dt><dd className="inline">{typeof tabla.corte === "string" ? tabla.corte : JSON.stringify(tabla.corte) || t.noDisponible}</dd></div></dl>
    <button type="button" onClick={descargarCsv} className="mt-3 min-h-11 rounded-md border border-primary px-4 font-semibold">{t.descargarCsv}</button>
    {!completa && <p className="mt-2 text-xs text-muted">{t.csvRecortado}</p>}
  </section>;
}

export function ResultadosOperacion({ eventos, idioma }: { eventos: readonly EventoTraza[]; idioma: IdiomaOperaciones }) {
  const t = mensajesOperaciones[idioma];
  const tablas = tablasDeEventos(eventos);
  const comentarios = eventos.filter((evento) => evento.tipo === "comentario");
  const entregable = entregableDeEventos(eventos);
  const noVerificadas = eventos.filter((evento) => evento.tipo !== "comentario").flatMap(cifrasNoVerificadasDe);
  const descargar = () => {
    if (!entregable) return;
    const url = URL.createObjectURL(new Blob([entregable], { type: "text/markdown;charset=utf-8" }));
    const enlace = document.createElement("a"); enlace.href = url; enlace.download = "entregable.md"; enlace.click(); URL.revokeObjectURL(url);
  };
  return <section className="rounded-lg border border-subtle bg-raised p-4" aria-labelledby="titulo-resultados">
    <h2 id="titulo-resultados" className="mb-3 text-lg font-semibold">{t.resultados}</h2>
    {tablas.length === 0 && comentarios.length === 0 && !entregable ? <p className="text-muted">{t.sinResultados}</p> : <div className="space-y-4">
      {tablas.map((tabla, indice) => <Tabla key={`${tabla.titulo}-${indice}`} tabla={tabla} idioma={idioma} />)}
      {comentarios.map((evento) => <section key={evento.secuencia} aria-label={t.comentarioModelo} className="rounded-md border border-info bg-info-soft p-3">
        <h3 className="font-semibold">{t.comentarioModelo}</h3><p className="mb-2 text-sm">{t.comentarioAviso}</p>
        {bloquesRespuesta(comentarioDe(evento)).map((bloque, indice) => bloque.tipo === "titulo" ? <h4 key={indice} className="font-semibold">{bloque.texto}</h4> : bloque.tipo === "parrafo" ? <p key={indice}>{bloque.texto}</p> : <ul key={indice} className="list-inside list-disc">{bloque.items.map((item, i) => <li key={i}>{item.etiqueta ? `${item.etiqueta}: ` : ""}{item.texto}</li>)}</ul>)}
        {cifrasNoVerificadasDe(evento).length > 0 && <aside role="alert" className="mt-3 rounded-md border border-warning bg-warning-soft p-3"><h4 className="font-semibold">{t.cifrasNoVerificadas}</h4><ul className="list-inside list-disc">{cifrasNoVerificadasDe(evento).map((cifra, i) => <li key={`${cifra}-${i}`}>{cifra}</li>)}</ul><p>{t.cifrasAviso}</p></aside>}
      </section>)}
      {noVerificadas.length > 0 && <aside role="alert" className="rounded-md border border-warning bg-warning-soft p-3"><h3 className="font-semibold">{t.cifrasNoVerificadas}</h3><ul className="list-inside list-disc">{noVerificadas.map((cifra, i) => <li key={`${cifra}-${i}`}>{cifra}</li>)}</ul><p>{t.cifrasAviso}</p></aside>}
      {entregable && <div><button type="button" onClick={descargar} className="min-h-11 rounded-md border border-primary bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-hover">{t.descargar}</button><pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 text-sm">{entregable}</pre></div>}
    </div>}
  </section>;
}
