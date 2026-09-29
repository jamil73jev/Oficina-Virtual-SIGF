import type { z } from "zod";
import { Rol } from "@/types";

export type RolUsuario = z.infer<typeof Rol>;

export const ROLES = Rol.options;

/** Acciones "recurso:verbo" por dominio. */
export const ACCIONES = [
  "proyecto:leer",
  "proyecto:crear",
  "proyecto:editar",
  "proyecto:archivar",
  "tarea:leer",
  "tarea:crear",
  "tarea:editar",
  "tarea:asignar",
  "agente:leer",
  "agente:crear",
  "agente:editar",
  "agente:pausar",
  "aprobacion:leer",
  "aprobacion:decidir",
  "presupuesto:leer",
  "presupuesto:editar",
  "presupuesto:ampliar",
  "auditoria:leer",
  "auditoria:exportar",
] as const;

export type Accion = (typeof ACCIONES)[number];

const LECTURA: readonly Accion[] = [
  "proyecto:leer",
  "tarea:leer",
  "agente:leer",
  "aprobacion:leer",
  "presupuesto:leer",
];

const SUPERVISOR: readonly Accion[] = [
  ...LECTURA,
  "proyecto:crear",
  "proyecto:editar",
  "tarea:crear",
  "tarea:editar",
  "tarea:asignar",
  "agente:pausar",
  "aprobacion:decidir",
  "auditoria:leer",
];

const ADMIN: readonly Accion[] = [
  ...SUPERVISOR,
  "proyecto:archivar",
  "agente:crear",
  "agente:editar",
  "presupuesto:editar",
  "auditoria:exportar",
];

const OWNER: readonly Accion[] = [...ADMIN, "presupuesto:ampliar"];

export const MATRIZ_PERMISOS: Readonly<
  Record<RolUsuario, ReadonlySet<Accion>>
> = {
  owner: new Set(OWNER),
  admin: new Set(ADMIN),
  supervisor: new Set(SUPERVISOR),
  viewer: new Set(LECTURA),
};

/** Deniega por defecto: rol o accion desconocidos no tienen permiso. */
export function can(rol: RolUsuario, accion: Accion): boolean {
  const permisos = (
    MATRIZ_PERMISOS as Partial<Record<string, ReadonlySet<Accion>>>
  )[rol];
  return permisos?.has(accion) ?? false;
}

export interface ContextoAcceso {
  usuarioId: string;
  /** Organizacion de la membresia activa del usuario. */
  orgId: string;
  rol: RolUsuario;
}

export type Decision =
  | { permitido: true }
  | {
      permitido: false;
      motivo: "otra_org" | "rol_insuficiente" | "org_invalida";
    };

/**
 * Autoriza una accion sobre un recurso. Nunca permite acceso entre organizaciones,
 * sea cual sea el rol (incluido owner).
 */
export function autorizar(
  ctx: ContextoAcceso,
  accion: Accion,
  recurso: { orgId: string },
): Decision {
  if (!ctx.orgId || !recurso.orgId)
    return { permitido: false, motivo: "org_invalida" };
  if (ctx.orgId !== recurso.orgId)
    return { permitido: false, motivo: "otra_org" };
  return can(ctx.rol, accion)
    ? { permitido: true }
    : { permitido: false, motivo: "rol_insuficiente" };
}

export class AccesoDenegadoError extends Error {
  constructor(
    readonly motivo: Extract<Decision, { permitido: false }>["motivo"],
  ) {
    super(`Acceso denegado: ${motivo}`);
    this.name = "AccesoDenegadoError";
  }
}

export function exigir(
  ctx: ContextoAcceso,
  accion: Accion,
  recurso: { orgId: string },
): void {
  const d = autorizar(ctx, accion, recurso);
  if (!d.permitido) throw new AccesoDenegadoError(d.motivo);
}

/** Filtra una coleccion dejando solo lo de la organizacion del contexto. */
export function soloDeOrg<T extends { orgId: string }>(
  ctx: ContextoAcceso,
  items: readonly T[],
): T[] {
  return items.filter((i) => i.orgId === ctx.orgId);
}
