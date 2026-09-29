import { z } from "zod";
import type { ProveedorIdentidad } from "@/core/approvals";
import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import { can } from "@/core/rbac";
import {
  esIdAgenteArea,
  ejecutarAgenteArea,
  fuenteSintetica,
  sembrarPresupuestosArea,
  type FuenteDatos,
  type IdAgenteArea,
} from "@/modules/agentes-area";
import { crearModeloDesdeEntorno, type ModeloOllama } from "@/orchestration/runtime/ollama";

const AMPLIO = { tokens: 1_000_000, costo: 10_000, iteraciones: 1_000 };
const IdAgente = z.string().trim().min(1).max(64).regex(/^[a-z-]+$/);
const CuerpoConsulta = z.strictObject({
  proyectoId: z.uuid(),
  pregunta: z.string().trim().min(1).max(500),
  locale: z.enum(["es", "en"]).default("es"),
});

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export async function ejecutarConsultaLocal(input: {
  agente: IdAgenteArea;
  orgId: string;
  proyectoId: string;
  pregunta: string;
  modelo: ModeloOllama;
  fuente?: FuenteDatos;
  locale?: "es" | "en";
}) {
  const repo = new PresupuestoMemoriaRepo();
  sembrarPresupuestosArea(repo, {
    orgId: input.orgId,
    proyectoId: input.proyectoId,
    topeProyecto: AMPLIO,
    topeOrg: AMPLIO,
  });
  return ejecutarAgenteArea(
    {
      modelo: input.modelo,
      auditor: new Auditor(new AuditoriaMemoriaRepo()),
      presupuesto: new ServicioPresupuesto(repo),
      fuente: input.fuente ?? fuenteSintetica(),
    },
    {
      orgId: input.orgId,
      proyectoId: input.proyectoId,
      agente: input.agente,
      pregunta: input.pregunta,
      idioma: input.locale ?? "es",
    },
  );
}

type CrearModelo = () => ModeloOllama | null;

export function crearManejadorEstadoModeloLocal(
  crearModelo: CrearModelo = () => crearModeloDesdeEntorno(),
) {
  return async (): Promise<Response> => {
    let modelo: ModeloOllama | null;
    try {
      modelo = crearModelo();
    } catch {
      return json({ configurado: false, disponible: false, modelo: null }, 200);
    }
    if (!modelo) return json({ configurado: false, disponible: false, modelo: null }, 200);
    const disponible = await modelo.disponible();
    return json({ configurado: true, disponible, modelo: modelo.nombreModelo }, 200);
  };
}

export interface DepsConsultaLocal {
  identidad: ProveedorIdentidad;
  crearModelo?: CrearModelo;
  ejecutar?: typeof ejecutarConsultaLocal;
}

export function crearManejadorConsultaLocal({
  identidad,
  crearModelo = () => crearModeloDesdeEntorno(),
  ejecutar = ejecutarConsultaLocal,
}: DepsConsultaLocal) {
  return async (req: Request, idCrudo: string): Promise<Response> => {
    const ctx = await identidad(req);
    if (!ctx) return json({ error: "no_autenticado" }, 401);
    if (!can(ctx.rol, "agente:editar")) return json({ error: "rol_insuficiente" }, 403);
    const id = IdAgente.safeParse(idCrudo);
    if (!id.success) return json({ error: "id_invalido" }, 400);
    if (!esIdAgenteArea(id.data)) return json({ error: "agente_no_encontrado" }, 404);
    if ((req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return json({ error: "content_type_no_soportado" }, 415);
    }
    let cuerpo: unknown;
    try { cuerpo = await req.json(); } catch { return json({ error: "json_invalido" }, 400); }
    const entrada = CuerpoConsulta.safeParse(cuerpo);
    if (!entrada.success) return json({ error: "cuerpo_invalido" }, 400);

    let modelo: ModeloOllama | null;
    try { modelo = crearModelo(); } catch { modelo = null; }
    if (!modelo) return json({ error: "modelo_local_no_configurado" }, 503);
    if (!(await modelo.disponible())) return json({ error: "modelo_local_no_disponible" }, 503);

    try {
      const resultado = await ejecutar({
        agente: id.data,
        orgId: ctx.orgId,
        proyectoId: entrada.data.proyectoId,
        pregunta: entrada.data.pregunta,
        modelo,
        locale: entrada.data.locale,
      });
      return json({ resultado }, 200);
    } catch {
      return json({ error: "modelo_local_no_disponible" }, 503);
    }
  };
}
