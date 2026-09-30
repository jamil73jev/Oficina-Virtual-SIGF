import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos } from "@/core/db";
import { eventoTraza, operacion } from "@/core/db/schema";
import { EventoTraza, type PublicadorTraza } from "./eventos";

type Fila = typeof eventoTraza.$inferSelect;
type NuevoEvento = Omit<EventoTraza, "id" | "secuencia" | "ts">;

/** Intervalo de sondeo de `suscribir`. */
export const INTERVALO_SONDEO_MS = 500;
/** Vida maxima de una suscripcion (duracion maxima de una funcion en Vercel Hobby). */
export const VIDA_MAXIMA_SUSCRIPCION_MS = 5 * 60_000;
/** Retencion por defecto de la traza. */
export const DIAS_RETENCION_TRAZA = 30;

export interface OpcionesPublicadorPostgres {
  intervaloSondeoMs?: number;
  vidaMaximaMs?: number;
  nuevoId?: () => string;
  ahora?: () => Date;
}

/** Copia apta para JSON (fechas a ISO, sin undefined): lo mismo que viaja por SSE. */
const aJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const aEvento = (f: Fila): EventoTraza => ({
  id: f.id,
  orgId: f.orgId,
  operacionId: f.operacionId,
  secuencia: f.secuencia,
  ts: f.ts.toISOString(),
  tipo: f.tipo as EventoTraza["tipo"],
  ...(f.agenteId !== null ? { agenteId: f.agenteId } : {}),
  ...(f.haciaAgenteId !== null ? { haciaAgenteId: f.haciaAgenteId } : {}),
  ...(f.ejecucionId !== null ? { ejecucionId: f.ejecucionId } : {}),
  ...(f.padreEjecucionId !== null ? { padreEjecucionId: f.padreEjecucionId } : {}),
  titulo: f.titulo,
  ...(f.detalle !== null ? { detalle: f.detalle as Record<string, unknown> } : {}),
  ...(f.estado !== null ? { estado: f.estado as EventoTraza["estado"] } : {}),
  ...(f.tokens !== null ? { tokens: f.tokens as EventoTraza["tokens"] } : {}),
});

const aFila = (e: EventoTraza) => ({
  id: e.id,
  orgId: e.orgId,
  operacionId: e.operacionId,
  secuencia: e.secuencia,
  ts: new Date(e.ts),
  tipo: e.tipo,
  agenteId: e.agenteId ?? null,
  haciaAgenteId: e.haciaAgenteId ?? null,
  ejecucionId: e.ejecucionId ?? null,
  padreEjecucionId: e.padreEjecucionId ?? null,
  titulo: e.titulo,
  detalle: e.detalle ?? null,
  estado: e.estado ?? null,
  tokens: e.tokens ?? null,
});

/**
 * Traza persistida en PostgreSQL (tablas operacion y evento_traza, RLS por organizacion).
 * - publicar: `UPDATE operacion SET ultima_secuencia = ultima_secuencia + 1 RETURNING` e
 *   INSERT del evento en la MISMA transaccion. El UPDATE bloquea la fila de la operacion, asi
 *   que publicadores concurrentes (de cualquier instancia) obtienen secuencias contiguas; si
 *   el INSERT falla se revierte todo y no queda hueco. La operacion debe existir antes.
 * - suscribir: SONDEO cada 500 ms de `secuencia > ultima vista`. En Vercel el SSE y la
 *   operacion corren en instancias distintas: una suscripcion en memoria no veria nada.
 *   Cancelable, sin solapar sondeos, con vida maxima y fin tras operacion_finalizada.
 * - padreEjecucionId: null y ausente se guardan igual (NULL) y se leen como ausente.
 */
export class PublicadorTrazaPostgres implements PublicadorTraza {
  private readonly intervaloMs: number;
  private readonly vidaMaximaMs: number;
  private readonly nuevoId: () => string;
  private readonly ahora: () => Date;
  private readonly activas = new Set<() => void>();

  constructor(
    private readonly db: BaseDatos,
    opciones: OpcionesPublicadorPostgres = {},
  ) {
    this.intervaloMs = opciones.intervaloSondeoMs ?? INTERVALO_SONDEO_MS;
    this.vidaMaximaMs = opciones.vidaMaximaMs ?? VIDA_MAXIMA_SUSCRIPCION_MS;
    this.nuevoId = opciones.nuevoId ?? randomUUID;
    this.ahora = opciones.ahora ?? (() => new Date());
  }

  async publicar(evento: NuevoEvento): Promise<EventoTraza> {
    // Valida el contrato completo antes de ocupar la secuencia: un evento invalido no deja huecos.
    const base = EventoTraza.parse(aJson({ ...evento, id: this.nuevoId(), secuencia: 1, ts: this.ahora().toISOString() }));
    return enTransaccionOrg(this.db, base.orgId, async (tx) => {
      const [op] = await tx
        .update(operacion)
        .set({ ultimaSecuencia: sql`${operacion.ultimaSecuencia} + 1` })
        .where(and(eq(operacion.orgId, base.orgId), eq(operacion.id, base.operacionId)))
        .returning({ secuencia: operacion.ultimaSecuencia });
      if (!op) throw new Error("Operacion inexistente");
      const completo: EventoTraza = { ...base, secuencia: op.secuencia };
      await tx.insert(eventoTraza).values(aFila(completo));
      return completo;
    });
  }

  listar(orgId: string, operacionId: string, desdeSecuencia = 0): Promise<EventoTraza[]> {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(eventoTraza)
          .where(
            and(
              eq(eventoTraza.orgId, orgId),
              eq(eventoTraza.operacionId, operacionId),
              gt(eventoTraza.secuencia, desdeSecuencia),
            ),
          )
          .orderBy(asc(eventoTraza.secuencia))
      ).map(aEvento),
    );
  }

  suscribir(orgId: string, operacionId: string, alRecibir: (evento: EventoTraza) => void): () => void {
    let activa = true;
    let ultima = 0;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const vence = Date.now() + this.vidaMaximaMs;

    const cancelar = () => {
      if (!activa) return;
      activa = false;
      if (temporizador) clearTimeout(temporizador);
      temporizador = null;
      this.activas.delete(cancelar);
    };

    const programar = () => {
      if (!activa) return;
      if (Date.now() >= vence) return cancelar();
      temporizador = setTimeout(sondear, this.intervaloMs);
      // No retiene el proceso vivo solo por una suscripcion.
      (temporizador as { unref?: () => void }).unref?.();
    };

    const sondear = async () => {
      temporizador = null;
      if (!activa) return;
      try {
        for (const evento of await this.listar(orgId, operacionId, ultima)) {
          if (!activa) return;
          ultima = evento.secuencia;
          try {
            alRecibir(evento);
          } catch {
            // Un suscriptor que falla no detiene el sondeo.
          }
          if (evento.tipo === "operacion_finalizada") return cancelar();
        }
      } catch {
        // BD no disponible momentaneamente: se reintenta en el siguiente ciclo.
      }
      programar();
    };

    this.activas.add(cancelar);
    programar();
    return cancelar;
  }

  /** Suscripciones con sondeo activo en este proceso (diagnostico y pruebas de fugas). */
  get suscripcionesActivas(): number {
    return this.activas.size;
  }

  /** Cancela todas las suscripciones de este proceso (cierre ordenado y pruebas). */
  cancelarTodas(): void {
    for (const cancelar of [...this.activas]) cancelar();
  }
}

/**
 * Retencion: borra los eventos de traza con `ts` anterior a `ahora - dias` (por defecto 30)
 * de TODAS las organizaciones. Es mantenimiento: corre con la cuenta de conexion (propietaria),
 * no con app_rw, que no tiene DELETE. Devuelve cuantos eventos se borraron.
 */
export async function purgarEventosAntiguos(
  db: BaseDatos,
  dias: number = DIAS_RETENCION_TRAZA,
  ahora: Date = new Date(),
): Promise<number> {
  if (!Number.isInteger(dias) || dias < 1) throw new Error("dias debe ser un entero >= 1");
  const limite = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
  const borrados = await db.delete(eventoTraza).where(lt(eventoTraza.ts, limite)).returning({ id: eventoTraza.id });
  return borrados.length;
}
