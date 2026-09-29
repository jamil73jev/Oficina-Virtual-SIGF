import { readFile } from "node:fs/promises";
import path from "node:path";

/** Skills por rol: archivos Markdown cargados bajo demanda, no agentes permanentes. */
export const SKILLS_DISPONIBLES = [
  "pm",
  "analista",
  "qa",
  "control-estadistica",
  "cartera",
  "datos",
  "tesorero",
  "presupuestista",
  "contador",
  "pagador",
  "cajero-mayor",
  "rentas",
  "coactiva",
  "director",
  "planificacion",
] as const;
export type NombreSkill = (typeof SKILLS_DISPONIBLES)[number];

const cache = new Map<string, string>();

export const esSkill = (n: string): n is NombreSkill =>
  (SKILLS_DISPONIBLES as readonly string[]).includes(n);

/** El nombre se valida contra la lista blanca: no hay rutas arbitrarias. */
export async function cargarSkill(
  nombre: string,
  directorio = path.join(process.cwd(), "src", "orchestration", "skills"),
): Promise<string> {
  if (!esSkill(nombre)) throw new Error(`Skill desconocida: ${nombre}`);
  const clave = `${directorio}|${nombre}`;
  const previo = cache.get(clave);
  if (previo !== undefined) return previo;
  const contenido = await readFile(path.join(directorio, `${nombre}.md`), "utf8");
  cache.set(clave, contenido);
  return contenido;
}
