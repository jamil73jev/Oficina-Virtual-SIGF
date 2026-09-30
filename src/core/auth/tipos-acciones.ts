import type { RolUsuario } from "@/core/rbac";

/** Estados que devuelven las acciones de servidor (codigos; los textos estan en mensajes.ts). */
export type ErrorLogin = "datos" | "credenciales" | "servicio" | "desarrollo";
export interface EstadoLogin {
  error: ErrorLogin | null;
}

export type ErrorDesafio = "formato" | "codigo" | "sin_factor" | "desarrollo";
export interface EstadoDesafio {
  error: ErrorDesafio | null;
}

export type ResultadoInicioInscripcion =
  | { ok: true; factorId: string; qr: string; secreto: string }
  | { ok: false; error: "inscripcion" | "ya_activa" | "desarrollo" };

export type ErrorConfirmacion = "formato" | "codigo" | "inscripcion" | "desarrollo";
export interface EstadoConfirmacion {
  ok: boolean;
  error: ErrorConfirmacion | null;
}

export interface SesionVisible {
  correo: string | null;
  rol: RolUsuario;
}
