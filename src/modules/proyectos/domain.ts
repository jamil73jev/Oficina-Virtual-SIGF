import type { z } from "zod";
import type { EstadoTarea, Proyecto, Tarea } from "@/types";

export type ProyectoRegistro = z.infer<typeof Proyecto>;
export type TareaRegistro = z.infer<typeof Tarea>;
export type EstadoDeTarea = z.infer<typeof EstadoTarea>;

/** Orden de las columnas del tablero Kanban. */
export const COLUMNAS_TABLERO: readonly EstadoDeTarea[] = [
  "pendiente",
  "asignada",
  "en_curso",
  "en_verificacion",
  "completada",
  "fallida",
  "bloqueada",
];

const TRANSICIONES: Readonly<Record<EstadoDeTarea, readonly EstadoDeTarea[]>> = {
  pendiente: ["asignada", "bloqueada"],
  asignada: ["pendiente", "en_curso", "bloqueada"],
  en_curso: ["asignada", "en_verificacion", "fallida", "bloqueada"],
  en_verificacion: ["en_curso", "completada", "fallida"],
  bloqueada: ["pendiente", "asignada", "en_curso"],
  fallida: ["pendiente", "asignada"],
  completada: [],
};

export const transicionPermitida = (
  de: EstadoDeTarea,
  a: EstadoDeTarea,
): boolean => TRANSICIONES[de].includes(a);

export const transicionesDesde = (de: EstadoDeTarea): readonly EstadoDeTarea[] =>
  TRANSICIONES[de];

/** Estados que exigen agente asignado. */
export const EXIGEN_AGENTE: readonly EstadoDeTarea[] = [
  "asignada",
  "en_curso",
  "en_verificacion",
  "completada",
];

/** Estados que exigen todas las dependencias completadas. */
export const EXIGEN_DEPS_COMPLETAS: readonly EstadoDeTarea[] = [
  "en_curso",
  "en_verificacion",
  "completada",
];

/**
 * True si anadir la dependencia `tareaId -> depId` crearia un ciclo: ocurre si
 * `tareaId` es alcanzable desde `depId` siguiendo deps (o si son la misma).
 */
export function crearaCiclo(
  tareas: readonly Pick<TareaRegistro, "id" | "deps">[],
  tareaId: string,
  depId: string,
): boolean {
  if (tareaId === depId) return true;
  const deps = new Map(tareas.map((t) => [t.id, t.deps]));
  const visto = new Set<string>();
  const pila = [depId];
  while (pila.length > 0) {
    const actual = pila.pop() as string;
    if (actual === tareaId) return true;
    if (visto.has(actual)) continue;
    visto.add(actual);
    pila.push(...(deps.get(actual) ?? []));
  }
  return false;
}
