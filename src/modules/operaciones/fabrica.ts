import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import { fuenteSintetica, sembrarPresupuestosArea } from "@/modules/agentes-area";
import { crearModeloDesdeEntorno } from "@/orchestration/runtime/ollama";
import { obtenerPublicadorTraza } from "@/orchestration/traza/memoria";
import { ServicioOperaciones } from "./servicio";

/** Topes amplios de la oficina personal (datos sinteticos); los de cada agente vienen del catalogo. */
const AMPLIO = { tokens: 5_000_000, costo: 50, iteraciones: 10_000 };

const CLAVE = Symbol.for("oficina-virtual.servicioOperaciones");

/**
 * Servicio compartido del proceso: publicador de traza en memoria, auditoria en memoria,
 * fuente sintetica y modelo simulado (o el local de MODELO_LOCAL=ollama:<modelo>).
 * PENDIENTE (ola B): Postgres para operaciones, traza y auditoria.
 */
export function obtenerServicioOperaciones(): ServicioOperaciones {
  const g = globalThis as unknown as Record<symbol, ServicioOperaciones>;
  if (!g[CLAVE]) {
    const repoPresupuesto = new PresupuestoMemoriaRepo();
    const sembradas = new Set<string>();
    g[CLAVE] = new ServicioOperaciones({
      publicador: obtenerPublicadorTraza(),
      auditor: new Auditor(new AuditoriaMemoriaRepo()),
      presupuesto: new ServicioPresupuesto(repoPresupuesto),
      fuente: fuenteSintetica(),
      modelo: crearModeloDesdeEntorno() ?? undefined,
      asegurarPresupuesto: (orgId, proyectoId) => {
        const clave = `${orgId}\u0000${proyectoId}`;
        if (sembradas.has(clave)) return;
        sembrarPresupuestosArea(repoPresupuesto, { orgId, proyectoId, topeProyecto: AMPLIO, topeOrg: AMPLIO });
        sembradas.add(clave);
      },
    });
  }
  return g[CLAVE];
}
