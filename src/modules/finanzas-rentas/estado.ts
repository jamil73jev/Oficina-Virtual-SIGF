import { z } from "zod";
import {
  Corte,
  Titulo,
  titulosUnicos,
  type EstadoTitulo,
  type ResultadoCalculo,
} from "@/modules/finanzas";
import { diasEntre, fechaISO, filtrosDeCorte, hastaElCorte } from "@/modules/finanzas/comun";
import { HistorialTitulo } from "./domain";

export type OrigenEstado = "historial" | "emision" | "sin_historial" | "no_emitido";

export interface EstadoReconstruido {
  tituloId: string;
  estadoAlCorte: EstadoTitulo | null;
  estadoActual: EstadoTitulo;
  origen: OrigenEstado;
  fechaUltimoCambio: Date | null;
  transicionesHastaCorte: number;
  transicionesPosteriores: number;
  cambioDesdeElCorte: boolean;
  inconsistencias: string[];
}

export interface EstadosAlCorte {
  titulos: EstadoReconstruido[];
  conteoPorEstado: Partial<Record<EstadoTitulo, number>>;
  sinHistorial: number;
  cambiaronDespuesDelCorte: number;
  historialSinTitulo: number;
}

/** Eventos del titulo sin ids repetidos, ordenados por fecha (empate: orden de carga). */
function eventosOrdenados(eventos: readonly HistorialTitulo[]): HistorialTitulo[] {
  const vistos = new Set<string>();
  const unicos = eventos.filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)));
  return unicos
    .map((e, i) => ({ e, i }))
    .sort((a, b) => diasEntre(b.e.fecha, a.e.fecha) || a.i - b.i)
    .map(({ e }) => e);
}

/** Reconstruye el estado de un titulo a la fecha de corte a partir de su historial. */
export function estadoDelTituloAlCorte(
  titulo: Titulo,
  historial: readonly HistorialTitulo[],
  corte: Corte,
): EstadoReconstruido {
  const eventos = eventosOrdenados(historial);
  const hasta = eventos.filter((e) => hastaElCorte(e.fecha, corte));
  const inconsistencias: string[] = [];
  eventos.forEach((e, i) => {
    const previo = eventos[i - 1];
    if (previo && e.estadoAnterior && e.estadoAnterior !== previo.estadoNuevo) {
      inconsistencias.push(`${e.id}: estadoAnterior ${e.estadoAnterior} no coincide con ${previo.estadoNuevo} de ${previo.id}`);
    }
  });

  const base = {
    tituloId: titulo.id,
    estadoActual: titulo.estado,
    transicionesHastaCorte: hasta.length,
    transicionesPosteriores: eventos.length - hasta.length,
    inconsistencias,
  };
  const ultimo = hasta[hasta.length - 1];
  const cerrar = (estadoAlCorte: EstadoTitulo | null, origen: OrigenEstado): EstadoReconstruido => ({
    ...base,
    estadoAlCorte,
    origen,
    fechaUltimoCambio: ultimo?.fecha ?? null,
    cambioDesdeElCorte: estadoAlCorte !== null && estadoAlCorte !== titulo.estado,
  });

  if (!hastaElCorte(titulo.fechaEmision, corte)) return cerrar(null, "no_emitido");
  if (ultimo) return cerrar(ultimo.estadoNuevo, "historial");
  const primero = eventos[0];
  if (primero) return cerrar(primero.estadoAnterior ?? "emitido", "emision");
  inconsistencias.push("sin historial: se usa el estado actual, no verificable a la fecha de corte");
  return { ...cerrar(titulo.estado, "sin_historial"), cambioDesdeElCorte: false };
}

export const EntradaEstadoVigente = z.object({
  corte: Corte,
  titulos: z.array(Titulo),
  historial: z.array(HistorialTitulo),
});
export type EntradaEstadoVigente = z.infer<typeof EntradaEstadoVigente>;

export const FORMULA_ESTADO_VIGENTE =
  "estado(titulo, corte) = estadoNuevo del ultimo HistorialTitulo con fecha <= corte (empate por orden de carga); " +
  "sin eventos hasta el corte: estadoAnterior del primer evento posterior, o 'emitido'; nunca se usa el estado actual " +
  "salvo titulos sin historial, que se marcan 'sin_historial'; titulos emitidos despues del corte: sin estado";

export function estadoVigenteAlCorte(entrada: EntradaEstadoVigente): ResultadoCalculo<EstadosAlCorte> {
  const { corte } = entrada;
  const { unicos } = titulosUnicos(entrada.titulos);
  const porTitulo = new Map<string, HistorialTitulo[]>();
  for (const h of entrada.historial) porTitulo.set(h.tituloId, [...(porTitulo.get(h.tituloId) ?? []), h]);
  const ids = new Set(unicos.map((t) => t.id));
  const historialSinTitulo = entrada.historial.filter((h) => !ids.has(h.tituloId)).length;

  const titulos = unicos.map((t) => estadoDelTituloAlCorte(t, porTitulo.get(t.id) ?? [], corte));
  const conteoPorEstado: Partial<Record<EstadoTitulo, number>> = {};
  for (const r of titulos) {
    if (r.estadoAlCorte) conteoPorEstado[r.estadoAlCorte] = (conteoPorEstado[r.estadoAlCorte] ?? 0) + 1;
  }
  return {
    valor: {
      titulos,
      conteoPorEstado,
      sinHistorial: titulos.filter((r) => r.origen === "sin_historial").length,
      cambiaronDespuesDelCorte: titulos.filter((r) => r.cambioDesdeElCorte).length,
      historialSinTitulo,
    },
    fuente: corte.fuente,
    formula: FORMULA_ESTADO_VIGENTE,
    filtros: [...filtrosDeCorte(corte), `eventos hasta ${fechaISO(corte.fechaCorte)}`, "titulo.id unico"],
    corte,
  };
}
