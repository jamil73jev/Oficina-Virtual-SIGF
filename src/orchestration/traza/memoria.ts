import { randomUUID } from "node:crypto";
import { unicoPorProceso } from "@/core/db/entorno";
import { EventoTraza, type PublicadorTraza } from "./eventos";

type Oyente = (evento: EventoTraza) => void;

interface TrazaOperacion {
  orgId: string;
  operacionId: string;
  eventos: EventoTraza[];
  oyentes: Set<Oyente>;
}

export interface OpcionesPublicadorMemoria {
  /** Operaciones retenidas; al superarse se descartan las mas antiguas sin suscriptores. */
  maxOperaciones?: number;
  nuevoId?: () => string;
  ahora?: () => Date;
}

/** Copia apta para JSON (fechas a ISO, sin undefined): lo mismo que viaja por SSE. */
const aJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Publicador de traza en memoria (una instancia por proceso; ver obtenerPublicadorTraza).
 * - Secuencia contigua por operacion: se asigna de forma sincrona dentro de `publicar`.
 * - Aislamiento estricto: la clave incluye orgId; leer o suscribirse desde otra org no ve nada.
 * - Cancelar una suscripcion libera el oyente y la entrada vacia (sin fugas).
 */
export class PublicadorTrazaMemoria implements PublicadorTraza {
  private readonly operaciones = new Map<string, TrazaOperacion>();
  private readonly maxOperaciones: number;
  private readonly nuevoId: () => string;
  private readonly ahora: () => Date;

  constructor(opciones: OpcionesPublicadorMemoria = {}) {
    this.maxOperaciones = opciones.maxOperaciones ?? 1000;
    this.nuevoId = opciones.nuevoId ?? randomUUID;
    this.ahora = opciones.ahora ?? (() => new Date());
  }

  private static clave(orgId: string, operacionId: string) {
    return `${orgId}\u0000${operacionId}`;
  }

  private entrada(orgId: string, operacionId: string, crear: true): TrazaOperacion;
  private entrada(orgId: string, operacionId: string, crear: false): TrazaOperacion | undefined;
  private entrada(orgId: string, operacionId: string, crear: boolean) {
    const clave = PublicadorTrazaMemoria.clave(orgId, operacionId);
    let t = this.operaciones.get(clave);
    if (!t && crear) {
      t = { orgId, operacionId, eventos: [], oyentes: new Set() };
      this.operaciones.set(clave, t);
      this.podar();
    }
    return t;
  }

  /** Descarta las operaciones mas antiguas sin eventos en vivo que escuchar. */
  private podar() {
    if (this.operaciones.size <= this.maxOperaciones) return;
    for (const [clave, t] of this.operaciones) {
      if (this.operaciones.size <= this.maxOperaciones) break;
      if (t.oyentes.size === 0) this.operaciones.delete(clave);
    }
  }

  async publicar(evento: Omit<EventoTraza, "id" | "secuencia" | "ts">): Promise<EventoTraza> {
    const t = this.entrada(evento.orgId, evento.operacionId, true);
    // Valida el contrato completo antes de ocupar la secuencia: un evento invalido no deja huecos.
    const completo = EventoTraza.parse(
      aJson({ ...evento, id: this.nuevoId(), secuencia: t.eventos.length + 1, ts: this.ahora().toISOString() }),
    );
    t.eventos.push(completo);
    for (const oyente of [...t.oyentes]) {
      try {
        oyente(structuredClone(completo));
      } catch {
        // Un suscriptor que falla no impide notificar a los demas ni la publicacion.
      }
    }
    return structuredClone(completo);
  }

  async listar(orgId: string, operacionId: string, desdeSecuencia = 0): Promise<EventoTraza[]> {
    const t = this.entrada(orgId, operacionId, false);
    if (!t || t.orgId !== orgId) return [];
    return t.eventos.filter((e) => e.secuencia > desdeSecuencia).map((e) => structuredClone(e));
  }

  suscribir(orgId: string, operacionId: string, alRecibir: (evento: EventoTraza) => void): () => void {
    const clave = PublicadorTrazaMemoria.clave(orgId, operacionId);
    const t = this.entrada(orgId, operacionId, true);
    // Envoltorio propio: suscribir dos veces la misma funcion son dos suscripciones.
    const oyente: Oyente = (e) => alRecibir(e);
    t.oyentes.add(oyente);
    let activa = true;
    return () => {
      if (!activa) return;
      activa = false;
      t.oyentes.delete(oyente);
      // Una entrada creada solo para escuchar y ya sin oyentes ni eventos se libera.
      if (t.oyentes.size === 0 && t.eventos.length === 0 && this.operaciones.get(clave) === t) {
        this.operaciones.delete(clave);
      }
    };
  }

  /** Suscriptores activos (diagnostico y pruebas de fugas). */
  suscriptoresActivos(orgId?: string, operacionId?: string): number {
    let total = 0;
    for (const t of this.operaciones.values()) {
      if (orgId !== undefined && t.orgId !== orgId) continue;
      if (operacionId !== undefined && t.operacionId !== operacionId) continue;
      total += t.oyentes.size;
    }
    return total;
  }

  /** Operaciones retenidas (diagnostico y pruebas de fugas). */
  get operacionesRetenidas(): number {
    return this.operaciones.size;
  }
}

/**
 * Publicador en memoria compartido del proceso (desarrollo y pruebas). La seleccion por
 * entorno (Postgres con PERSISTENCIA=drizzle) esta en ./fabrica (obtenerPublicadorTrazaEntorno).
 */
export function obtenerPublicadorTraza(): PublicadorTrazaMemoria {
  return unicoPorProceso("publicadorTraza", () => new PublicadorTrazaMemoria());
}
