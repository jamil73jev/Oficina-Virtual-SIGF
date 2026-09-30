import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { AuditorPostgres, AuditoriaDrizzleRepo } from "@/core/audit/repo-drizzle";
import { obtenerBaseDatos } from "./cliente";
import type { Entorno, ModoPersistencia } from "./entorno";
import type { BaseDatos } from "./index";

export {
  PersistenciaNoDurableError,
  modoPersistencia,
  reiniciarUnicosParaPruebas,
  unicoPorProceso,
  type Entorno,
  type ModoPersistencia,
} from "./entorno";

export interface OpcionesFabrica {
  env?: Entorno;
  /** Base de datos inyectada (pruebas); por defecto obtenerBaseDatos(). */
  db?: () => BaseDatos;
}

/** Base de datos del modo drizzle (inyectable en pruebas). */
export const baseDatosDe = (opciones: OpcionesFabrica = {}): BaseDatos =>
  (opciones.db ?? obtenerBaseDatos)();

/**
 * Auditor del servicio. En drizzle, anexar usa el anexo atomico en Postgres (bloqueo por org
 * en la misma transaccion): varias instancias serverless nunca bifurcan la cadena. En memoria,
 * un auditor propio por servicio, como hasta ahora.
 */
export function crearAuditor(modo: ModoPersistencia, opciones: OpcionesFabrica = {}): Auditor {
  if (modo === "drizzle") {
    return new AuditorPostgres(new AuditoriaDrizzleRepo(baseDatosDe(opciones)));
  }
  return new Auditor(new AuditoriaMemoriaRepo());
}
