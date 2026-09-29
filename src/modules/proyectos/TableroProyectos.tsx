"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, CardTitle, Dialog, Input } from "@/components/ui";
import { COLUMNAS_TABLERO, transicionesDesde, type EstadoDeTarea } from "./domain";

interface ProyectoVista {
  id: string;
  objetivo: string;
  estado: string;
}

interface TareaVista {
  id: string;
  estado: EstadoDeTarea;
  agenteId: string | null;
  criteriosVerificacion: string[];
  deps: string[];
}

interface Permisos {
  crearProyecto: boolean;
  crearTarea: boolean;
  editarTarea: boolean;
  asignarTarea: boolean;
}

type Aviso = { tono: "ok" | "error"; texto: string };

const CODIGOS_CONOCIDOS = [
  "no_autenticado",
  "rol_insuficiente",
  "no_encontrado",
  "solicitud_invalida",
  "cuerpo_invalido",
  "ciclo_dependencias",
  "transicion_invalida",
  "dependencias_incompletas",
  "sin_agente",
  "proyecto_cerrado",
] as const;

const corto = (id: string) => id.slice(0, 8);

const CLASE_SELECT =
  "min-h-11 rounded-md border border-border bg-raised px-3 text-sm text-foreground";

/** Select nativo con etiqueta visible (accesible por teclado y lector de pantalla). */
function Selector({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CLASE_SELECT}
      >
        {children}
      </select>
    </div>
  );
}

export function TableroProyectos() {
  const t = useTranslations("projects");

  const [proyectos, setProyectos] = useState<ProyectoVista[] | null>(null);
  const [permisos, setPermisos] = useState<Permisos | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [tareas, setTareas] = useState<TareaVista[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [objetivo, setObjetivo] = useState("");
  const [criterios, setCriterios] = useState("");
  const [depsNuevas, setDepsNuevas] = useState<string[]>([]);

  const [editando, setEditando] = useState<string | null>(null);
  const [estadoDestino, setEstadoDestino] = useState("");
  const [agente, setAgente] = useState("");
  const [depElegida, setDepElegida] = useState("");
  const botonEdicion = useRef<HTMLElement | null>(null);

  const textoError = useCallback(
    (codigo: string | undefined) =>
      (CODIGOS_CONOCIDOS as readonly string[]).includes(codigo ?? "")
        ? t(`errors.${codigo as (typeof CODIGOS_CONOCIDOS)[number]}`)
        : t("errors.generico"),
    [t],
  );

  const cargarTablero = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
        const cuerpo = (await res.json().catch(() => ({}))) as {
          tareas?: TareaVista[];
          permisos?: Permisos;
          error?: string;
        };
        if (!res.ok) {
          setErrorCarga(textoError(cuerpo.error));
          return;
        }
        setErrorCarga(null);
        setTareas(cuerpo.tareas ?? []);
        if (cuerpo.permisos) setPermisos(cuerpo.permisos);
      } catch {
        setErrorCarga(t("errors.generico"));
      }
    },
    [t, textoError],
  );

  const cargarProyectos = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const cuerpo = (await res.json().catch(() => ({}))) as {
        proyectos?: ProyectoVista[];
        permisos?: Permisos;
        error?: string;
      };
      if (!res.ok) {
        setErrorCarga(textoError(cuerpo.error));
        return;
      }
      setErrorCarga(null);
      const lista = cuerpo.proyectos ?? [];
      setProyectos(lista);
      setPermisos(cuerpo.permisos ?? null);
      setSeleccion((actual) => actual ?? lista[0]?.id ?? null);
    } catch {
      setErrorCarga(t("errors.generico"));
    }
  }, [t, textoError]);

  useEffect(() => {
    // Carga inicial: el estado se actualiza tras el fetch asincrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarProyectos();
  }, [cargarProyectos]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seleccion) void cargarTablero(seleccion);
  }, [seleccion, cargarTablero]);

  /** Ejecuta una peticion de escritura y refresca el tablero; anuncia el resultado. */
  const enviar = async (
    url: string,
    metodo: "POST" | "PATCH",
    cuerpo: unknown,
    exito: string,
  ): Promise<boolean> => {
    setEnviando(true);
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setAviso({ tono: "error", texto: textoError(r.error) });
        return false;
      }
      setAviso({ tono: "ok", texto: exito });
      return true;
    } catch {
      setAviso({ tono: "error", texto: t("errors.generico") });
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const crearProyecto = async (e: FormEvent) => {
    e.preventDefault();
    if (await enviar("/api/projects", "POST", { objetivo }, t("done.proyecto"))) {
      setObjetivo("");
      await cargarProyectos();
    }
  };

  const crearTarea = async (e: FormEvent) => {
    e.preventDefault();
    if (!seleccion) return;
    const lineas = criterios.split("\n").map((l) => l.trim()).filter(Boolean);
    const ok = await enviar(
      `/api/projects/${seleccion}/tasks`,
      "POST",
      { criteriosVerificacion: lineas, deps: depsNuevas },
      t("done.tarea"),
    );
    if (ok) {
      setCriterios("");
      setDepsNuevas([]);
      await cargarTablero(seleccion);
    }
  };

  const actualizar = async (tareaId: string, cuerpo: unknown, exito: string) => {
    if (!seleccion) return;
    const ok = await enviar(
      `/api/projects/${seleccion}/tasks/${tareaId}`,
      "PATCH",
      cuerpo,
      exito,
    );
    if (ok) await cargarTablero(seleccion);
  };

  const abrirEdicion = (tarea: TareaVista, origen: HTMLElement) => {
    botonEdicion.current = origen;
    setEstadoDestino("");
    setAgente(tarea.agenteId ?? "");
    setDepElegida("");
    setEditando(tarea.id);
  };

  const cerrarEdicion = () => {
    setEditando(null);
    // <dialog> ya devuelve el foco; se asegura tras el re-render del tablero.
    const el = botonEdicion.current;
    if (el?.isConnected) requestAnimationFrame(() => el.focus());
  };

  const tareaEditada = tareas.find((x) => x.id === editando) ?? null;
  const proyecto = proyectos?.find((p) => p.id === seleccion) ?? null;
  const puedeEditar = permisos?.editarTarea ?? false;
  const puedeAsignar = permisos?.asignarTarea ?? false;
  const destinos = tareaEditada ? transicionesDesde(tareaEditada.estado) : [];
  const candidatas = tareaEditada
    ? tareas.filter((x) => x.id !== tareaEditada.id && !tareaEditada.deps.includes(x.id))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("listTitle")}</h2>
        <Button
          variant="secondary"
          onClick={() => {
            void cargarProyectos();
            if (seleccion) void cargarTablero(seleccion);
          }}
        >
          {t("refresh")}
        </Button>
      </div>

      <div role="status" aria-live="polite" className="min-h-6 text-sm">
        {aviso && (
          <p className={aviso.tono === "ok" ? "text-success" : "text-danger"}>{aviso.texto}</p>
        )}
      </div>

      {errorCarga && (
        <p role="alert" className="text-sm text-danger">
          {errorCarga}
        </p>
      )}

      {proyectos === null && !errorCarga && <p className="text-sm text-muted">{t("loading")}</p>}

      {permisos?.crearProyecto && (
        <Card>
          <form onSubmit={(e) => void crearProyecto(e)} className="flex flex-col gap-3">
            <CardTitle as="h3">{t("newProject.title")}</CardTitle>
            <Input
              label={t("newProject.objective")}
              hint={t("newProject.hint")}
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              required
              maxLength={2000}
            />
            <div>
              <Button type="submit" disabled={enviando}>
                {t("newProject.submit")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {proyectos !== null && proyectos.length === 0 && (
        <Card className="flex flex-col gap-1">
          <CardTitle as="h3">{t("emptyTitle")}</CardTitle>
          <p className="text-sm text-muted">{t("emptyBody")}</p>
        </Card>
      )}

      {proyectos !== null && proyectos.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t("listTitle")}>
          {proyectos.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="text-sm font-medium">{p.objetivo}</span>
                <Button
                  variant={p.id === seleccion ? "primary" : "secondary"}
                  aria-pressed={p.id === seleccion}
                  aria-label={`${t("select")}: ${p.objetivo}`}
                  onClick={() => setSeleccion(p.id)}
                >
                  {t("select")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {proyecto && (
        <section aria-labelledby="tablero-titulo" className="flex flex-col gap-4">
          <h2 id="tablero-titulo" className="text-lg font-semibold">
            {t("boardTitle", { objetivo: proyecto.objetivo })}
          </h2>

          {permisos?.crearTarea && (
            <Card>
              <form onSubmit={(e) => void crearTarea(e)} className="flex flex-col gap-3">
                <CardTitle as="h3">{t("newTask.title")}</CardTitle>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="criterios-nuevos" className="text-sm font-medium">
                    {t("newTask.criteria")}
                  </label>
                  <textarea
                    id="criterios-nuevos"
                    value={criterios}
                    onChange={(e) => setCriterios(e.target.value)}
                    required
                    rows={3}
                    aria-describedby="criterios-nuevos-hint"
                    className="rounded-md border border-border bg-raised px-3 py-2 text-sm text-foreground"
                  />
                  <p id="criterios-nuevos-hint" className="text-sm text-muted">
                    {t("newTask.hint")}
                  </p>
                </div>
                {tareas.length > 0 && (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="text-sm font-medium">{t("newTask.deps")}</legend>
                    {tareas.map((x) => (
                      <label key={x.id} className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-5"
                          checked={depsNuevas.includes(x.id)}
                          onChange={(e) =>
                            setDepsNuevas((d) =>
                              e.target.checked ? [...d, x.id] : d.filter((i) => i !== x.id),
                            )
                          }
                        />
                        {t("task.id", { id: corto(x.id) })}: {x.criteriosVerificacion[0]}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div>
                  <Button type="submit" disabled={enviando}>
                    {t("newTask.submit")}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {tareas.length === 0 && <p className="text-sm text-muted">{t("board.noTasks")}</p>}

          <div
            role="group"
            aria-label={t("board.label")}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {COLUMNAS_TABLERO.map((estado) => {
              const enColumna = tareas.filter((x) => x.estado === estado);
              return (
                <section
                  key={estado}
                  aria-labelledby={`col-${estado}`}
                  className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3"
                >
                  <h3 id={`col-${estado}`} className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {t(`states.${estado}`)}
                    <Badge>{t("board.tasksCount", { count: enColumna.length })}</Badge>
                  </h3>
                  {enColumna.length === 0 ? (
                    <p className="text-sm text-muted">{t("board.emptyColumn")}</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {enColumna.map((x) => (
                        <li key={x.id}>
                          <Card className="flex flex-col gap-2 p-3">
                            <CardTitle as="h4" className="text-sm">
                              {t("task.id", { id: corto(x.id) })}
                            </CardTitle>
                            <div className="text-sm">
                              <p className="font-semibold">{t("task.criteria")}</p>
                              <ul className="list-disc pl-5">
                                {x.criteriosVerificacion.map((c, i) => (
                                  <li key={i}>{c}</li>
                                ))}
                              </ul>
                            </div>
                            <p className="text-sm">
                              <span className="font-semibold">{t("task.agent")}:</span>{" "}
                              {x.agenteId ?? t("task.noAgent")}
                            </p>
                            <p className="text-sm">
                              <span className="font-semibold">{t("task.deps")}:</span>{" "}
                              {x.deps.length === 0
                                ? t("task.noDeps")
                                : x.deps.map(corto).join(", ")}
                            </p>
                            {(puedeEditar || puedeAsignar) && (
                              <div>
                                <Button
                                  variant="secondary"
                                  onClick={(e) => abrirEdicion(x, e.currentTarget)}
                                  aria-label={`${t("task.edit")}: ${t("task.id", { id: corto(x.id) })}`}
                                >
                                  {t("task.edit")}
                                </Button>
                              </div>
                            )}
                          </Card>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}

      <Dialog
        open={tareaEditada !== null}
        onClose={cerrarEdicion}
        title={tareaEditada ? t("edit.title", { id: corto(tareaEditada.id) }) : ""}
        description={
          tareaEditada
            ? t("edit.keepState", { estado: t(`states.${tareaEditada.estado}`) })
            : undefined
        }
        closeLabel={t("edit.close")}
        footer={
          <Button variant="secondary" onClick={cerrarEdicion}>
            {t("edit.close")}
          </Button>
        }
      >
        {tareaEditada && (
          <div className="flex flex-col gap-5">
            {puedeEditar && destinos.length > 0 && (
              <div className="flex flex-col gap-2">
                <Selector label={t("edit.state")} value={estadoDestino} onChange={setEstadoDestino}>
                  <option value="" disabled>
                    —
                  </option>
                  {destinos.map((d) => (
                    <option key={d} value={d}>
                      {t(`states.${d}`)}
                    </option>
                  ))}
                </Selector>
                <div>
                  <Button
                    disabled={enviando || !estadoDestino}
                    onClick={() =>
                      void actualizar(
                        tareaEditada.id,
                        { accion: "mover", estado: estadoDestino },
                        t("done.mover"),
                      )
                    }
                  >
                    {t("edit.move")}
                  </Button>
                </div>
              </div>
            )}

            {puedeAsignar && (
              <div className="flex flex-col gap-2">
                <Input
                  label={t("edit.agent")}
                  hint={t("edit.agentHint")}
                  value={agente}
                  onChange={(e) => setAgente(e.target.value)}
                  maxLength={100}
                />
                <div>
                  <Button
                    disabled={enviando}
                    onClick={() =>
                      void actualizar(
                        tareaEditada.id,
                        { accion: "asignar", agenteId: agente.trim() || null },
                        t("done.asignar"),
                      )
                    }
                  >
                    {t("edit.assign")}
                  </Button>
                </div>
              </div>
            )}

            {puedeEditar && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">{t("edit.currentDeps")}</p>
                {tareaEditada.deps.length === 0 ? (
                  <p className="text-sm text-muted">{t("task.noDeps")}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {tareaEditada.deps.map((d) => (
                      <li key={d} className="flex items-center justify-between gap-2 text-sm">
                        {t("task.id", { id: corto(d) })}
                        <Button
                          variant="secondary"
                          disabled={enviando}
                          aria-label={t("edit.removeDep", { id: corto(d) })}
                          onClick={() =>
                            void actualizar(
                              tareaEditada.id,
                              { accion: "dependencia_quitar", depId: d },
                              t("done.dependencia"),
                            )
                          }
                        >
                          ×
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {candidatas.length === 0 ? (
                  <p className="text-sm text-muted">{t("edit.noCandidates")}</p>
                ) : (
                  <>
                    <Selector label={t("edit.addDep")} value={depElegida} onChange={setDepElegida}>
                      <option value="" disabled>
                        —
                      </option>
                      {candidatas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {t("task.id", { id: corto(c.id) })}: {c.criteriosVerificacion[0]}
                        </option>
                      ))}
                    </Selector>
                    <div>
                      <Button
                        disabled={enviando || !depElegida}
                        onClick={() =>
                          void actualizar(
                            tareaEditada.id,
                            { accion: "dependencia_agregar", depId: depElegida },
                            t("done.dependencia"),
                          )
                        }
                      >
                        {t("edit.addDepButton")}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
