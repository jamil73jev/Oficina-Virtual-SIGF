import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import {
  ejecutarAgenteArea,
  fuenteSintetica,
  sembrarPresupuestosArea,
  type IdAgenteArea,
  type NombreHerramientaArea,
} from "@/modules/agentes-area";
import { ModeloSimulado, type GuionSimulado } from "@/orchestration/runtime/modelo";
import { mensajesAgentes, type LocaleAgentes } from "./mensajes";

const AMPLIO = { tokens: 1_000_000, costo: 10_000, iteraciones: 1_000 };

/** Llamada guionada de la demo: una herramienta permitida del agente y las cifras que se muestran. */
export interface LlamadaDemo {
  nombre: NombreHerramientaArea;
  args: Record<string, unknown>;
  /** Rutas dentro de `valor` que se copian a la respuesta (nunca se calculan). */
  cifras: readonly string[];
}

export const LLAMADAS_DEMO: Record<IdAgenteArea, LlamadaDemo> = {
  "control-estadistica": {
    nombre: "recaudacion_neta",
    args: {},
    cifras: ["bruto", "reversosNormales", "reversosExtemporaneos", "neto"],
  },
  cartera: { nombre: "saldo_cartera_por_titulo", args: {}, cifras: ["totalSaldo", "cantidadTitulos", "titulosConVariosJuicios"] },
  datos: {
    nombre: "calidad_datos",
    args: {},
    cifras: ["totalGeneral", "identificaciones.invalidas.cantidad", "sinParroquia.cantidad"],
  },
  tesorero: {
    nombre: "conciliar_banco",
    args: {},
    cifras: ["conciliado.valor", "pendiente.valor", "diferencias.valorNeto", "cuadra"],
  },
  presupuestista: {
    nombre: "ejecucion_presupuestaria",
    args: {},
    cifras: ["totales.ingreso.codificado", "totales.ingreso.recaudadoOPagado", "totales.gasto.codificado", "totales.gasto.devengado"],
  },
  contador: {
    nombre: "balance_comprobacion",
    args: {},
    cifras: ["totalDebe", "totalHaber", "diferencia", "cuadra", "cantidadAsientos"],
  },
  pagador: {
    nombre: "resumen_ordenes_pago",
    args: {},
    cifras: ["total.cantidad", "total.valor", "porEstado.solicitada.valor", "porEstado.validada.valor"],
  },
  "cajero-mayor": { nombre: "arqueo_caja", args: {}, cifras: ["totalTurnos", "cerrados", "sobrante", "faltante", "cuadre"] },
  rentas: {
    nombre: "emision_por_rubro",
    args: {},
    cifras: ["totalTitulos", "totalValorEmitido", "titulosPosterioresAlCorte"],
  },
  coactiva: {
    nombre: "recuperacion_coactiva",
    args: {},
    cifras: ["cantidadTitulos", "totalBaseCoactiva", "totalRecuperado", "porcentajeRecuperado"],
  },
  director: {
    nombre: "tablero_ejecutivo",
    args: {},
    cifras: ["totalIndicadores", "totalAlertas", "compromisosAbiertos"],
  },
  planificacion: {
    nombre: "comparativo_interanual",
    args: {},
    cifras: ["filas.0.actual", "filas.0.anterior", "filas.0.variacionAbsoluta", "filas.0.variacionPct"],
  },
};

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
