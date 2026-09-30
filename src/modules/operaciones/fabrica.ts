import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import { PresupuestoDrizzleRepo } from "@/core/budget/repo-drizzle";
import { exigirAlojamientoPermitido, exigirFuentePermitida, obtenerConfiguracionDatos } from "@/core/datos";
import { baseDatosDe, crearAuditor, modoPersistencia, unicoPorProceso, type OpcionesFabrica } from "@/core/db/persistencia";
import { AGENTES_AREA, fuenteSintetica, sembrarPresupuestosArea } from "@/modules/agentes-area";
import {
  AlmacenArtefactosDrizzle,
  RepositorioEjecucionesDrizzle,
  RepositorioTareasDrizzle,
} from "@/modules/agentes-area/repo-drizzle";
import { crearModeloDesdeEntorno } from "@/orchestration/runtime/ollama";
import { obtenerPublicadorTrazaEntorno } from "@/orchestration/traza/fabrica";
import type { Uso } from "@/orchestration/runtime";
import type { DepsOperaciones } from "./servicio";
import { RepositorioOperacionesDrizzle } from "./repo-drizzle";
import { ServicioOperaciones } from "./servicio";

/** Topes amplios de la oficina personal (datos sinteticos); los de cada agente vienen del catalogo. */
const AMPLIO = { tokens: 5_000_000, costo: 50, iteraciones: 10_000 };

const vacio = (): Uso => ({ tokens: 0, costo: 0, iteraciones: 0 });

/** Persistencia de la Sala de operaciones segun el modo (traza, operaciones, tareas, presupuesto). */
function persistencia(opciones: OpcionesFabrica): Pick<
  DepsOperaciones,
  "publicador" | "auditor" | "presupuesto" | "asegurarPresupuesto" | "repositorio" | "tareas" | "ejecuciones" | "almacen"
> {
  const modo = modoPersistencia(opciones.env);
  const publicador = obtenerPublicadorTrazaEntorno(opciones);
  const auditor = crearAuditor(modo, opciones);
  if (modo === "drizzle") {
    const db = baseDatosDe(opciones);
    const repoPresupuesto = new PresupuestoDrizzleRepo(db);
    return {
      publicador,
      auditor,
      presupuesto: new ServicioPresupuesto(repoPresupuesto),
      // Solo da de alta lo que falte: nunca reinicia el consumo al arrancar otra instancia.
      asegurarPresupuesto: async (orgId, proyectoId) => {
        for (const a of AGENTES_AREA) {
          await repoPresupuesto.definirSiFalta(orgId, { ambito: "agente", refId: a.agenteId }, {
            ambito: "agente",
            tope: { ...a.presupuesto },
            consumido: vacio(),
          });
        }
        await repoPresupuesto.definirSiFalta(orgId, { ambito: "proyecto", refId: proyectoId }, {
          ambito: "proyecto",
          tope: { ...AMPLIO },
          consumido: vacio(),
        });
        await repoPresupuesto.definirSiFalta(orgId, { ambito: "org", refId: orgId }, {
          ambito: "org",
          tope: { ...AMPLIO },
          consumido: vacio(),
        });
      },
      repositorio: new RepositorioOperacionesDrizzle(db),
      tareas: new RepositorioTareasDrizzle(db),
      ejecuciones: new RepositorioEjecucionesDrizzle(db),
      almacen: new AlmacenArtefactosDrizzle(db),
    };
  }
  const repoPresupuesto = new PresupuestoMemoriaRepo();
  const sembradas = new Set<string>();
  return {
    publicador,
    auditor,
    presupuesto: new ServicioPresupuesto(repoPresupuesto),
    asegurarPresupuesto: (orgId, proyectoId) => {
      const clave = `${orgId}\u0000${proyectoId}`;
      if (sembradas.has(clave)) return;
      sembrarPresupuestosArea(repoPresupuesto, { orgId, proyectoId, topeProyecto: AMPLIO, topeOrg: AMPLIO });
      sembradas.add(clave);
    },
  };
}

/**
 * Servicio de la Sala de operaciones: persistencia segun el entorno (Postgres con
 * PERSISTENCIA=drizzle; memoria en desarrollo y pruebas), fuente sintetica y modelo simulado
 * (o el configurado por entorno), sujetos a la politica de datos.
 */
export function crearServicioOperaciones(opciones: OpcionesFabrica = {}): ServicioOperaciones {
  const configuracionDatos = obtenerConfiguracionDatos(opciones.env);
    const fuenteBase = fuenteSintetica();
    exigirFuentePermitida(configuracionDatos, fuenteBase.tipo);
    // El proxy repite la guarda al usar cualquier operación de la fuente, no solo al arrancar.
    const fuente = new Proxy(fuenteBase, {
      get(objetivo, propiedad, receptor) {
        const valor = Reflect.get(objetivo, propiedad, receptor) as unknown;
        if (typeof valor !== "function") return valor;
        return (...args: unknown[]) => {
          exigirFuentePermitida(configuracionDatos, objetivo.tipo);
          return Reflect.apply(valor, objetivo, args) as unknown;
        };
      },
    });
  const modelo = crearModeloDesdeEntorno();
  if (modelo) exigirAlojamientoPermitido(configuracionDatos, modelo.alojamiento);
  return new ServicioOperaciones({
    ...persistencia(opciones),
    fuente,
    modelo: modelo ?? undefined,
  });
}

/** Servicio compartido del proceso (en Vercel exige PERSISTENCIA=drizzle). */
export function obtenerServicioOperaciones(): ServicioOperaciones {
  return unicoPorProceso("servicioOperaciones", () => crearServicioOperaciones());
}
