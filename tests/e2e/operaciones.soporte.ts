import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import { sembrarPresupuestosArea, type FuenteDatos } from "@/modules/agentes-area";
import { ServicioOperaciones, type DepsOperaciones } from "@/modules/operaciones";
import type { EventoTraza } from "@/orchestration/traza/eventos";
import { PublicadorTrazaMemoria } from "@/orchestration/traza/memoria";

/** Soporte de las pruebas de extremo a extremo de la Sala de operaciones. */

export const ORG_A = "00000000-0000-4000-8000-0000000000aa";
export const ORG_B = "00000000-0000-4000-8000-0000000000bb";
export const CTX_A = { orgId: ORG_A, usuarioId: "usuario-a" };
export const CTX_B = { orgId: ORG_B, usuarioId: "usuario-b" };
export const ENCARGO_CARTERA = "Analiza la cartera vencida y propon como priorizar la cobranza";

const AMPLIO = { tokens: 1_000_000_000, costo: 1_000_000, iteraciones: 1_000_000 };

export function montarOperaciones(
  opts: Partial<Pick<DepsOperaciones, "modelo" | "modeloDePaso" | "planificarConModelo" | "politicaCifras" | "programar">> & {
    fuente?: FuenteDatos;
    topeAgenteTokens?: number;
  } = {},
) {
  const auditoria = new AuditoriaMemoriaRepo();
  const auditor = new Auditor(auditoria);
  const repoPresupuesto = new PresupuestoMemoriaRepo();
  const publicador = new PublicadorTrazaMemoria();
  const servicio = new ServicioOperaciones({
    publicador,
    auditor,
    presupuesto: new ServicioPresupuesto(repoPresupuesto),
    fuente: opts.fuente,
    modelo: opts.modelo,
    modeloDePaso: opts.modeloDePaso,
    planificarConModelo: opts.planificarConModelo,
    politicaCifras: opts.politicaCifras,
    programar: opts.programar,
    asegurarPresupuesto: (orgId, proyectoId) => {
      if (repoPresupuesto.leer(orgId, { ambito: "org", refId: orgId })) return;
      sembrarPresupuestosArea(repoPresupuesto, {
        orgId,
        proyectoId,
        topeProyecto: AMPLIO,
        topeOrg: AMPLIO,
        topeAgente: opts.topeAgenteTokens === undefined ? undefined : { tokens: opts.topeAgenteTokens },
      });
    },
  });
  /** Encarga y espera a que termine; devuelve los eventos publicados. */
  const correr = async (texto = ENCARGO_CARTERA, idioma: "es" | "en" = "es", ctx = CTX_A) => {
    const { operacionId } = await servicio.encargar(texto, idioma, ctx);
    await servicio.esperar(ctx.orgId, operacionId);
    return { operacionId, eventos: await publicador.listar(ctx.orgId, operacionId) };
  };
  const acciones = async (orgId = ORG_A) => (await auditoria.listar(orgId)).map((e) => e.accion);
  return { auditoria, auditor, repoPresupuesto, publicador, servicio, correr, acciones };
}

export const deTipo = (eventos: readonly EventoTraza[], tipo: EventoTraza["tipo"]) => eventos.filter((e) => e.tipo === tipo);

/** Marco SSE parseado. */
export interface MarcoSse {
  id?: string;
  event?: string;
  data?: string;
  comentario?: string;
}

export function parsearSse(texto: string): MarcoSse[] {
  return texto
    .split("\n\n")
    .filter((b) => b.trim() !== "")
    .map((bloque) => {
      const marco: MarcoSse = {};
      for (const linea of bloque.split("\n")) {
        if (linea.startsWith(":")) marco.comentario = linea.slice(1).trim();
        else if (linea.startsWith("id: ")) marco.id = linea.slice(4);
        else if (linea.startsWith("event: ")) marco.event = linea.slice(7);
        else if (linea.startsWith("data: ")) marco.data = linea.slice(6);
      }
      return marco;
    });
}

/** Lee el flujo SSE hasta que el servidor lo cierra (con un tope de seguridad). */
export async function leerSseHastaCerrar(respuesta: Response, topeMs = 10_000): Promise<MarcoSse[]> {
  const lector = (respuesta.body as ReadableStream<Uint8Array>).getReader();
  const decodificador = new TextDecoder();
  let texto = "";
  const limite = Date.now() + topeMs;
  for (;;) {
    if (Date.now() > limite) {
      await lector.cancel();
      throw new Error("El flujo SSE no se cerro a tiempo");
    }
    const { done, value } = await lector.read();
    if (done) break;
    texto += decodificador.decode(value, { stream: true });
  }
  return parsearSse(texto);
}

export const eventosDeMarcos = (marcos: readonly MarcoSse[]) =>
  marcos.filter((m) => m.event === "traza").map((m) => JSON.parse(m.data as string) as EventoTraza);
