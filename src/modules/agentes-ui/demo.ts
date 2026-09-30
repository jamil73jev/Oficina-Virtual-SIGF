import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import {
  ejecutarAgenteArea,
  fuenteSintetica,
  sembrarPresupuestosArea,
  LLAMADAS_DEMO,
  type IdAgenteArea,
} from "@/modules/agentes-area";
import { ModeloSimulado, type GuionSimulado } from "@/orchestration/runtime/modelo";
import { mensajesAgentes, type LocaleAgentes } from "./mensajes";

const AMPLIO = { tokens: 1_000_000, costo: 10_000, iteraciones: 1_000 };

/** Llamada guionada de la demo: una herramienta permitida del agente y las cifras que se muestran. */
export { LLAMADAS_DEMO } from "@/modules/agentes-area";

/**
 * Modelo guionado de la demo: llama a la herramienta del agente y redacta una respuesta legible
 * copiando cifras y procedencia de la salida (sin mostrar el sobre interno de datos no confiables).
 */
export function guionDemo(agente: IdAgenteArea, locale: LocaleAgentes = "es"): GuionSimulado {
  const llamada = LLAMADAS_DEMO[agente];
  const t = mensajesAgentes[locale];
  return {
    texto: (_peticion, numero) => {
      if (numero === 0) return { tipo: "llamada_herramienta", nombre: llamada.nombre, args: llamada.args };
      return {
        tipo: "texto",
        texto: [
          `## ${t.resumenEjecutivo}`,
          t.demoResumen.replace("{herramienta}", llamada.nombre),
          `## ${t.hallazgosSupuestos}`,
          t.demoHallazgo,
          `## ${t.pendientes}`,
          t.demoPendiente,
        ].join("\n"),
      };
    },
  };
}

export async function ejecutarDemoAgente(input: {
  agente: IdAgenteArea;
  orgId: string;
  proyectoId: string;
  pregunta: string;
  locale?: LocaleAgentes;
}) {
  const repoPresupuesto = new PresupuestoMemoriaRepo();
  sembrarPresupuestosArea(repoPresupuesto, {
    orgId: input.orgId,
    proyectoId: input.proyectoId,
    topeProyecto: AMPLIO,
    topeOrg: AMPLIO,
  });
  return ejecutarAgenteArea(
    {
      modelo: new ModeloSimulado(guionDemo(input.agente, input.locale)),
      auditor: new Auditor(new AuditoriaMemoriaRepo()),
      presupuesto: new ServicioPresupuesto(repoPresupuesto),
      fuente: fuenteSintetica(),
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
