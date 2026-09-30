"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventoTraza } from "@/orchestration/traza/eventos";
import { bloquesRespuesta } from "@/modules/agentes-ui/presentacion";
import { tablaACsv, type TablaHerramienta } from "@/modules/agentes-area/tablas";
import { mensajesOperaciones, type IdiomaOperaciones } from "./mensajes";
import { cargarEntregableOperacion, cargarEventoOperacion } from "./conexion";

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

export function ResultadosOperacion({ eventos, idioma, operacionId }: { eventos: readonly EventoTraza[]; idioma: IdiomaOperaciones; operacionId?: string }) {
  const t = mensajesOperaciones[idioma];
  const [detalles, setDetalles] = useState<Record<number, EventoTraza>>({});
  const [cargandoTablas, setCargandoTablas] = useState(false);
  const [errorTablas, setErrorTablas] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [mostrarEntregable, setMostrarEntregable] = useState(false);
  const [cargandoEntregable, setCargandoEntregable] = useState(false);
  const [errorEntregable, setErrorEntregable] = useState(false);
  const eventosResueltos = useMemo(() => eventos.map((evento) => detalles[evento.secuencia] ?? evento), [eventos, detalles]);
  const pendientes = useMemo(
    () => eventos.filter((evento) => evento.tipo === "tabla" && evento.detalle?.ligero === true && !detalles[evento.secuencia]),
    [eventos, detalles],
  );
  useEffect(() => {
    if (!operacionId || pendientes.length === 0) return;
    let activo = true;
    void Promise.resolve().then(() => {
      if (activo) { setCargandoTablas(true); setErrorTablas(false); }
    });
    void Promise.all(pendientes.map((evento) => cargarEventoOperacion(operacionId, evento.secuencia))).then((cargados) => {
      if (!activo) return;
      setDetalles((actual) => ({ ...actual, ...Object.fromEntries(cargados.map((evento) => [evento.secuencia, evento])) }));
    }).catch(() => { if (activo) setErrorTablas(true); }).finally(() => { if (activo) setCargandoTablas(false); });
    return () => { activo = false; };
  }, [operacionId, pendientes]);
  const tablas = tablasDeEventos(eventosResueltos);
  const comentarios = eventos.filter((evento) => evento.tipo === "comentario");
  const entregable = markdown ?? entregableDeEventos(eventosResueltos);
  const noVerificadas = eventos.filter((evento) => evento.tipo !== "comentario").flatMap(cifrasNoVerificadasDe);
  const cargarEntregable = async () => {
    if (entregable) return entregable;
    if (!operacionId) return null;
    setCargandoEntregable(true);
    setErrorEntregable(false);
    try {
      const contenido = await cargarEntregableOperacion(operacionId);
      setMarkdown(contenido);
      return contenido;
    } catch {
      setErrorEntregable(true);
      return null;
    } finally {
      setCargandoEntregable(false);
    }
  };
  const descargar = async () => {
    const contenido = await cargarEntregable();
    if (!contenido) return;
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/markdown;charset=utf-8" }));
    const enlace = document.createElement("a"); enlace.href = url; enlace.download = "entregable.md"; enlace.click(); URL.revokeObjectURL(url);
  };
  return <section className="rounded-lg border border-subtle bg-raised p-4" aria-labelledby="titulo-resultados">
    <h2 id="titulo-resultados" className="mb-3 text-lg font-semibold">{t.resultados}</h2>
    {tablas.length === 0 && comentarios.length === 0 && !eventos.some((evento) => evento.tipo === "entregable") && pendientes.length === 0 ? <p className="text-muted">{t.sinResultados}</p> : <div className="space-y-4">
      {(cargandoTablas || (pendientes.length > 0 && !errorTablas)) && <p role="status" aria-live="polite">{t.cargandoTablas}</p>}
      {errorTablas && <p role="alert" className="text-danger">{t.errorTablas}</p>}
      {tablas.map((tabla, indice) => <Tabla key={`${tabla.titulo}-${indice}`} tabla={tabla} idioma={idioma} />)}
      {comentarios.map((evento) => <section key={evento.secuencia} aria-label={t.comentarioModelo} className="rounded-md border border-info bg-info-soft p-3">
        <h3 className="font-semibold">{t.comentarioModelo}</h3><p className="mb-2 text-sm">{t.comentarioAviso}</p>
        {bloquesRespuesta(comentarioDe(evento)).map((bloque, indice) => bloque.tipo === "titulo" ? <h4 key={indice} className="font-semibold">{bloque.texto}</h4> : bloque.tipo === "parrafo" ? <p key={indice}>{bloque.texto}</p> : <ul key={indice} className="list-inside list-disc">{bloque.items.map((item, i) => <li key={i}>{item.etiqueta ? `${item.etiqueta}: ` : ""}{item.texto}</li>)}</ul>)}
        {cifrasNoVerificadasDe(evento).length > 0 && <aside role="alert" className="mt-3 rounded-md border border-warning bg-warning-soft p-3"><h4 className="font-semibold">{t.cifrasNoVerificadas}</h4><ul className="list-inside list-disc">{cifrasNoVerificadasDe(evento).map((cifra, i) => <li key={`${cifra}-${i}`}>{cifra}</li>)}</ul><p>{t.cifrasAviso}</p></aside>}
      </section>)}
      {noVerificadas.length > 0 && <aside role="alert" className="rounded-md border border-warning bg-warning-soft p-3"><h3 className="font-semibold">{t.cifrasNoVerificadas}</h3><ul className="list-inside list-disc">{noVerificadas.map((cifra, i) => <li key={`${cifra}-${i}`}>{cifra}</li>)}</ul><p>{t.cifrasAviso}</p></aside>}
      {eventos.some((evento) => evento.tipo === "entregable") && <div className="space-x-2"><button type="button" onClick={() => { void cargarEntregable().then((contenido) => { if (contenido) setMostrarEntregable(true); }); }} disabled={cargandoEntregable} className="min-h-11 rounded-md border border-primary px-4 font-semibold">{cargandoEntregable ? t.cargandoEntregable : t.verEntregable}</button><button type="button" onClick={() => { void descargar(); }} disabled={cargandoEntregable} className="min-h-11 rounded-md border border-primary bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-hover">{t.descargar}</button>{errorEntregable && <p role="alert" className="mt-2 text-danger">{t.errorEntregable}</p>}{mostrarEntregable && entregable && <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 text-sm">{entregable}</pre>}</div>}
    </div>}
  </section>;
}
