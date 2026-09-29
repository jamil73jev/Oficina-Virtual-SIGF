"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, CardTitle, Input } from "@/components/ui";
import type { AgenteArea } from "@/modules/agentes-area";
import type { TablaHerramienta } from "@/modules/agentes-area";
import { mensajesAgentes, type LocaleAgentes } from "./mensajes";
import { bloquesRespuesta, type Bloque } from "./presentacion";

const PROYECTO_DEMO = "00000000-0000-4000-8000-0000000000a1";

interface VerificacionCifrasUi {
  noVerificadas: number;
  cifrasNoVerificadas: Array<{ texto: string }>;
}

type Estado = {
  cargando: boolean;
  respuesta?: string;
  tokens?: number;
  error?: string;
  verificacionCifras?: VerificacionCifrasUi;
  tablas?: TablaHerramienta[];
  comentario?: string;
};

interface ResultadoUi {
  estado: string;
  respuesta?: string;
  comentario?: string;
  tablas?: TablaHerramienta[];
  uso?: { tokens: number };
  verificacionCifras?: VerificacionCifrasUi;
}

function Tablas({ tablas, t }: { tablas: readonly TablaHerramienta[]; t: (typeof mensajesAgentes)[LocaleAgentes] }) {
  return (
    <div className="flex flex-col gap-4">
      {tablas.map((tabla, indice) => (
        <section key={`${tabla.ruta}-${indice}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="mb-2 text-left font-semibold">{tabla.titulo}</caption>
            <thead>
              <tr>{tabla.columnas.map((columna) => <th scope="col" className="border border-subtle p-2" key={columna.clave}>{columna.etiqueta}</th>)}</tr>
            </thead>
            <tbody>
              {tabla.filas.map((fila, filaIndice) => (
                <tr key={filaIndice}>{fila.celdas.map((celda) => <td className="border border-subtle p-2 tabular-nums" key={celda.columna}>{celda.texto}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-2 grid gap-1 text-xs">
            <div><dt className="inline font-semibold">{t.fuente}: </dt><dd className="inline">{tabla.fuente || t.noDisponible}</dd></div>
            <div><dt className="inline font-semibold">{t.formula}: </dt><dd className="inline">{tabla.formula || t.noDisponible}</dd></div>
            <div><dt className="inline font-semibold">{t.filtros}: </dt><dd className="inline">{tabla.filtros.join("; ") || t.noDisponible}</dd></div>
            <div><dt className="inline font-semibold">{t.corte}: </dt><dd className="inline">{JSON.stringify(tabla.corte) ?? t.noDisponible}</dd></div>
          </dl>
        </section>
      ))}
    </div>
  );
}

function Respuesta({ bloques }: { bloques: Bloque[] }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {bloques.map((b, i) =>
        b.tipo === "titulo" ? (
          <h3 key={i} className="mt-1 font-semibold">{b.texto}</h3>
        ) : b.tipo === "parrafo" ? (
          <p key={i}>{b.texto}</p>
        ) : (
          <ul key={i} className="flex flex-col gap-1">
            {b.items.map((item, j) => (
              <li key={j} className="break-words">
                {item.etiqueta && <span className="font-semibold">{item.etiqueta}: </span>}
                <span className="tabular-nums">{item.texto}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export function PanelAgentes({ agentes, locale }: { agentes: readonly AgenteArea[]; locale: LocaleAgentes }) {
  const t = mensajesAgentes[locale];
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [preguntas, setPreguntas] = useState<Record<string, string>>({});
  const [modeloLocal, setModeloLocal] = useState<{ comprobando: boolean; disponible: boolean; nombre: string | null }>({
    comprobando: true,
    disponible: false,
    nombre: null,
  });

  useEffect(() => {
    let activo = true;
    void fetch("/api/agents/modelo-local", { cache: "no-store" })
      .then(async (respuesta) => respuesta.json() as Promise<{ disponible?: boolean; modelo?: string | null }>)
      .then((estado) => {
        if (activo) setModeloLocal({ comprobando: false, disponible: estado.disponible === true, nombre: estado.modelo ?? null });
      })
      .catch(() => {
        if (activo) setModeloLocal({ comprobando: false, disponible: false, nombre: null });
      });
    return () => { activo = false; };
  }, []);

  async function ejecutar(id: string) {
    setEstados((actual) => ({ ...actual, [id]: { cargando: true } }));
    try {
      const respuesta = await fetch(`/api/agents/${id}/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proyectoId: PROYECTO_DEMO, pregunta: "Informe del corte sintético vigente", locale }),
      });
      const cuerpo = (await respuesta.json()) as { resultado?: ResultadoUi };
      if (!respuesta.ok || cuerpo.resultado?.estado !== "completado") throw new Error("demo");
      setEstados((actual) => ({
        ...actual,
        [id]: {
          cargando: false,
          respuesta: cuerpo.resultado?.respuesta,
          tokens: cuerpo.resultado?.uso?.tokens,
          verificacionCifras: cuerpo.resultado?.verificacionCifras,
          tablas: cuerpo.resultado?.tablas,
          comentario: cuerpo.resultado?.comentario,
        },
      }));
    } catch {
      setEstados((actual) => ({ ...actual, [id]: { cargando: false, error: t.error } }));
    }
  }

  async function consultar(id: string) {
    const pregunta = preguntas[id]?.trim();
    if (!pregunta) {
      setEstados((actual) => ({ ...actual, [id]: { cargando: false, error: t.preguntaRequerida } }));
      return;
    }
    setEstados((actual) => ({ ...actual, [id]: { cargando: true } }));
    try {
      const respuesta = await fetch(`/api/agents/${id}/consulta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proyectoId: PROYECTO_DEMO, pregunta, locale }),
      });
      const cuerpo = (await respuesta.json()) as { resultado?: ResultadoUi };
      const resultado = cuerpo.resultado;
      if (!respuesta.ok || resultado?.estado !== "completado") throw new Error("consulta");
      setEstados((actual) => ({
        ...actual,
        [id]: {
          cargando: false,
          respuesta: resultado.respuesta,
          tokens: resultado.uso?.tokens,
          verificacionCifras: resultado.verificacionCifras,
          tablas: resultado.tablas,
          comentario: resultado.comentario,
        },
      }));
    } catch {
      setEstados((actual) => ({ ...actual, [id]: { cargando: false, error: t.error } }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <aside className="rounded-lg border border-warning bg-warning-soft p-4 text-foreground" aria-label={t.avisoTitulo}>
        <p className="font-semibold">{t.avisoTitulo}</p>
        <p>{t.aviso}</p>
      </aside>
      <aside className="rounded-lg border border-subtle bg-surface p-4" aria-live="polite">
        <p>
          {modeloLocal.comprobando
            ? t.verificandoModeloLocal
            : modeloLocal.disponible
              ? t.modeloLocalDisponible.replace("{modelo}", modeloLocal.nombre ?? "Ollama")
              : t.modeloLocalNoDisponible}
        </p>
        <p className="mt-1 text-sm text-muted">{t.avisoLentitud}</p>
      </aside>
      <ul className="grid gap-5 lg:grid-cols-2">
        {agentes.map((agente) => {
          const estado = estados[agente.id];
          return (
            <li key={agente.id}>
              <Card className="flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle>{agente.nombre}</CardTitle>
                  <Badge tone="warning">{agente.modelo}</Badge>
                </div>
                <dl className="grid gap-3 text-sm">
                  <div><dt className="font-semibold">{t.area}</dt><dd>{agente.area}</dd></div>
                  <div><dt className="font-semibold">{t.modulos}</dt><dd>{agente.modulos.join(", ")}</dd></div>
                  <div><dt className="font-semibold">{t.herramientas}</dt><dd>{agente.herramientasPermitidas.join(", ")}</dd></div>
                  <div><dt className="font-semibold">{t.alojamiento}</dt><dd>{agente.alojamiento}</dd></div>
                  <div><dt className="font-semibold">{t.presupuesto}</dt><dd>{agente.presupuesto.tokens.toLocaleString(locale)}</dd></div>
                </dl>
                <Button onClick={() => void ejecutar(agente.id)} disabled={estado?.cargando} aria-describedby={`resultado-${agente.id}`}>
                  {estado?.cargando ? t.ejecutando : t.ejecutar}
                </Button>
                <div className="flex flex-col gap-2">
                  <Input
                    id={`pregunta-${agente.id}`}
                    label={t.pregunta}
                    hint={modeloLocal.disponible ? t.avisoLentitud : t.modeloLocalNoDisponible}
                    value={preguntas[agente.id] ?? ""}
                    maxLength={500}
                    placeholder={t.preguntaPlaceholder}
                    onChange={(evento) => setPreguntas((actual) => ({ ...actual, [agente.id]: evento.target.value }))}
                    disabled={!modeloLocal.disponible || estado?.cargando}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void consultar(agente.id)}
                    disabled={!modeloLocal.disponible || estado?.cargando}
                    aria-describedby={`pregunta-${agente.id}-hint resultado-${agente.id}`}
                  >
                    {estado?.cargando ? t.consultandoLocal : t.consultarLocal}
                  </Button>
                </div>
                <div id={`resultado-${agente.id}`} aria-live="polite" aria-atomic="true" className="min-h-6">
                  {estado?.error && <p role="alert" className="text-danger">{estado.error}</p>}
                  {(estado?.respuesta || estado?.tablas?.length) && (
                    <section aria-label={t.resultado} className="rounded-md border border-subtle bg-surface p-3">
                      <Tablas tablas={estado.tablas ?? []} t={t} />
                      <section className="mt-4" aria-label={t.comentarioModelo}>
                        <h3 className="font-semibold">{t.comentarioModelo}</h3>
                        <p className="mb-2 text-sm">{t.comentarioModeloAviso}</p>
                      {estado.verificacionCifras && estado.verificacionCifras.noVerificadas > 0 && (
                        <aside role="alert" className="mb-3 rounded-md border border-warning bg-warning-soft p-3">
                          <p className="font-semibold">{t.cifrasNoVerificadasTitulo}</p>
                          <ul className="list-inside list-disc tabular-nums">
                            {estado.verificacionCifras.cifrasNoVerificadas.map((cifra, indice) => (
                              <li key={`${cifra.texto}-${indice}`}>{cifra.texto}</li>
                            ))}
                          </ul>
                          <p>{t.cifrasNoVerificadasAviso}</p>
                        </aside>
                      )}
                        <Respuesta bloques={bloquesRespuesta(estado.comentario ?? "")} />
                      </section>
                      <p className="mt-2 text-sm font-semibold">{t.consumo}: {estado.tokens}</p>
                    </section>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
