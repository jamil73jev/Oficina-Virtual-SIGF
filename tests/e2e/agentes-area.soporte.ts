import { expect } from "vitest";
import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import { PresupuestoMemoriaRepo, ServicioPresupuesto } from "@/core/budget";
import type { Alojamiento } from "@/core/datos";
import {
  ejecutarAgenteArea,
  fuenteSintetica,
  RepositorioEjecucionesMemoria,
  sembrarPresupuestosArea,
  type FuenteDatos,
  type IdAgenteArea,
} from "@/modules/agentes-area";
import type { Corte, DatosFinanzas, ResultadoCalculo } from "@/modules/finanzas";
import { AlmacenArtefactosMemoria, RepositorioTareasMemoria } from "@/orchestration/memoria";
import { ModeloSimulado, type GuionSimulado } from "@/orchestration/runtime/modelo";
import type { PoliticaCifras } from "@/orchestration/runtime/verificador-cifras";

/** Soporte compartido de las pruebas de extremo a extremo de los agentes de area. */

export const ORG = "00000000-0000-4000-8000-000000000001";
export const PROYECTO = "00000000-0000-4000-8000-0000000000a1";
const AMPLIO = { tokens: 1_000_000_000, costo: 1_000_000, iteraciones: 1_000_000 };

export class ModeloNube extends ModeloSimulado {
  override readonly alojamiento: Alojamiento = "nube";
}

/**
 * Fuente espia sobre la sintetica: cuenta las cargas de todos los modulos; opcionalmente altera
 * los datos de finanzas, declara otro tipo u omite los cargadores de modulos nuevos.
 */
export function fuenteEspia(
  opts: { tipo?: FuenteDatos["tipo"]; alterar?: (d: DatosFinanzas) => void; soloFinanzas?: boolean } = {},
) {
  const base = fuenteSintetica();
  const contar = <T>(f: () => Promise<T>) => {
    espia.cargas++;
    return f();
  };
  const espia: FuenteDatos & { cargas: number } = {
    cargas: 0,
    tipo: opts.tipo ?? "sintetico",
    descripcion: "espia de pruebas (datos sinteticos)",
    async cargar(orgId: string) {
      espia.cargas++;
      const d = await base.cargar(orgId);
      opts.alterar?.(d);
      return d;
    },
    ...(opts.soloFinanzas
      ? {}
      : {
          cargarContable: (orgId: string) => contar(() => base.cargarContable?.(orgId) ?? Promise.reject(new Error("sin cargador"))),
          cargarPagos: (orgId: string) => contar(() => base.cargarPagos?.(orgId) ?? Promise.reject(new Error("sin cargador"))),
          cargarRentas: (orgId: string) => contar(() => base.cargarRentas?.(orgId) ?? Promise.reject(new Error("sin cargador"))),
          cargarDireccion: (orgId: string) => contar(() => base.cargarDireccion?.(orgId) ?? Promise.reject(new Error("sin cargador"))),
        }),
  };
  return espia;
}

export function montar(opts: {
  guion?: GuionSimulado;
  modelo?: ModeloSimulado;
  fuente?: FuenteDatos;
  topeAgenteTokens?: number;
  politicaCifras?: PoliticaCifras;
}) {
  const auditor = new Auditor(new AuditoriaMemoriaRepo());
  const repoPresupuesto = new PresupuestoMemoriaRepo();
  sembrarPresupuestosArea(repoPresupuesto, {
    orgId: ORG,
    proyectoId: PROYECTO,
    topeProyecto: AMPLIO,
    topeOrg: AMPLIO,
    topeAgente: opts.topeAgenteTokens === undefined ? undefined : { tokens: opts.topeAgenteTokens },
  });
  const modelo = opts.modelo ?? new ModeloSimulado(opts.guion);
  const tareas = new RepositorioTareasMemoria();
  const ejecuciones = new RepositorioEjecucionesMemoria();
  const almacen = new AlmacenArtefactosMemoria();
  const deps = {
    modelo,
    auditor,
    presupuesto: new ServicioPresupuesto(repoPresupuesto),
    fuente: opts.fuente,
    tareas,
    ejecuciones,
    almacen,
    politicaCifras: opts.politicaCifras,
  };
  const consultar = (agente: IdAgenteArea, pregunta = "Informe del corte vigente") =>
    ejecutarAgenteArea(deps, { orgId: ORG, proyectoId: PROYECTO, agente, pregunta });
  return { auditor, repoPresupuesto, modelo, tareas, ejecuciones, consultar };
}

export interface Salida {
  tipoDatos?: string;
  fuente?: string;
  formula?: string;
  filtros?: string[];
  corte?: unknown;
  valor?: unknown;
  error?: string;
  estado?: string;
}

const SOBRE = /^<datos_herramienta nombre="([^"]*)" confiable="false">\n([\s\S]*)\n<\/datos_herramienta>$/;

export function salidaDe(contenido: string): Salida {
  const m = SOBRE.exec(contenido);
  if (!m?.[2]) throw new Error(`Salida fuera del sobre: ${contenido.slice(0, 80)}`);
  return JSON.parse(m[2]) as Salida;
}

export const leer = (v: unknown, ruta: string): unknown =>
  ruta.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], v);

export interface Llamada {
  nombre: string;
  args: unknown;
  /** Rutas dentro de `valor` que el modelo copia a la respuesta. */
  cifras: string[];
}

export const lineaCifra = (herramienta: string, ruta: string, valor: unknown) => `- ${herramienta}.${ruta} = ${String(valor)}`;
export const lineaProcedencia = (s: { fuente: string; formula: string; filtros: string[]; corte: unknown }) =>
  `  Fuente: ${s.fuente} | Formula: ${s.formula} | Filtros: ${s.filtros.join("; ")} | Corte: ${JSON.stringify(s.corte)}`;

/**
 * Modelo guionado: llama las herramientas en orden y luego redacta copiando las cifras de las
 * salidas (nunca calcula) con fuente, formula, filtros y corte.
 */
export function guionConsulta(llamadas: Llamada[]): GuionSimulado {
  return {
    texto: (p, n) => {
      const l = llamadas[n];
      if (l) return { tipo: "llamada_herramienta", nombre: l.nombre, args: l.args };
      const bloques = p.mensajes
        .filter((m) => m.rol === "herramienta")
        .map((m, i) => {
          const s = salidaDe(m.contenido);
          const nombre = m.herramienta ?? "?";
          if (s.estado) return `- ${nombre}: ${s.estado}`;
          if (s.error) return `- ${nombre}: error ${s.error}`;
          const cifras = (llamadas[i]?.cifras ?? []).map((c) => lineaCifra(nombre, c, leer(s.valor, c)));
          return [...cifras, lineaProcedencia(s as Parameters<typeof lineaProcedencia>[0])].join("\n");
        });
      return {
        tipo: "texto",
        texto: `## Resumen ejecutivo\nCifras calculadas con herramientas.\n\n## Tabla de cifras\n${bloques.join("\n")}`,
      };
    },
  };
}

const corteJson = (c: Corte | Corte[]) =>
  JSON.stringify(
    (Array.isArray(c) ? c : [c]).map((x) => ({ ...x, fechaCorte: x.fechaCorte.toISOString() })),
  );

/** La respuesta contiene exactamente las cifras de la calculadora directa y su procedencia. */
export function esperarCifras(respuesta: string, herramienta: string, directo: ResultadoCalculo<unknown>, rutas: string[]) {
  for (const ruta of rutas) {
    const valor = leer(directo.valor, ruta);
    expect(typeof valor === "number" || typeof valor === "boolean" || typeof valor === "string", `${herramienta}.${ruta}`).toBe(true);
    expect(respuesta).toContain(lineaCifra(herramienta, ruta, valor));
  }
  const corte = corteJson(directo.corte);
  expect(respuesta).toContain(
    lineaProcedencia({
      fuente: directo.fuente,
      formula: directo.formula,
      filtros: directo.filtros,
      corte: JSON.parse(Array.isArray(directo.corte) ? corte : corte.slice(1, -1)),
    }),
  );
}
