import { randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos, type TransaccionBd } from "@/core/db";
import { auditoria } from "@/core/db/schema";
import {
  Auditor,
  calcularHash,
  redactar,
  resolverClaveHmac,
  type AuditoriaRepo,
  type EntradaAuditoria,
  type NuevaEntrada,
  type OpcionesAuditor,
} from "./index";

type Fila = typeof auditoria.$inferSelect;

const aEntrada = (f: Fila): EntradaAuditoria => ({
  id: f.id,
  orgId: f.orgId,
  seq: f.seq,
  actor: f.actor,
  accion: f.accion,
  entidad: f.entidad,
  antes: f.antes ?? null,
  despues: f.despues ?? null,
  hashPrev: f.hashPrev,
  hash: f.hash,
  creadoEn: f.creadoEn.toISOString(),
});

const ultimaEn = async (tx: TransaccionBd, orgId: string) => {
  const [f] = await tx
    .select()
    .from(auditoria)
    .where(eq(auditoria.orgId, orgId))
    .orderBy(desc(auditoria.seq))
    .limit(1);
  return f ? aEntrada(f) : null;
};

const insertarEn = (tx: TransaccionBd, e: EntradaAuditoria) =>
  tx.insert(auditoria).values({
    id: e.id,
    orgId: e.orgId,
    seq: e.seq,
    actor: e.actor,
    accion: e.accion,
    entidad: e.entidad,
    antes: e.antes ?? null,
    despues: e.despues ?? null,
    hashPrev: e.hashPrev,
    hash: e.hash,
    creadoEn: new Date(e.creadoEn),
  });

/**
 * Auditoria append-only en PostgreSQL. Cada operacion corre en una transaccion con
 * `app.org_id` fijado (RLS). La BD (0001_auditoria_endurecimiento.sql) garantiza que la
 * cadena no se bifurca: el trigger toma pg_advisory_xact_lock por org y exige
 * seq = ultima.seq + 1 y hash_prev = ultima.hash; UNIQUE(org_id, seq) es el respaldo.
 */
export class AuditoriaDrizzleRepo implements AuditoriaRepo {
  constructor(private readonly db: BaseDatos) {}

  ultima(orgId: string) {
    return enTransaccionOrg(this.db, orgId, (tx) => ultimaEn(tx, orgId));
  }

  /** Inserta tal cual; si otro escritor ya ocupo ese seq, la BD lo rechaza (sin bifurcar). */
  async agregar(entrada: EntradaAuditoria) {
    await enTransaccionOrg(this.db, entrada.orgId, (tx) => insertarEn(tx, entrada));
  }

  listar(orgId: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) =>
      (
        await tx
          .select()
          .from(auditoria)
          .where(eq(auditoria.orgId, orgId))
          .orderBy(asc(auditoria.seq))
      ).map(aEntrada),
    );
  }

  /**
   * Anexo atomico para varios procesos: bloqueo por org, lectura de la ultima entrada,
   * HMAC y alta en la MISMA transaccion. A diferencia de `Auditor.anexar` (que serializa
   * solo dentro de un proceso), aqui escritores concurrentes nunca chocan por el seq.
   */
  anexarAtomico(nueva: NuevaEntrada, opciones: OpcionesAuditor = {}): Promise<EntradaAuditoria> {
    const clave = resolverClaveHmac(opciones.claveHmac);
    const ahora = opciones.ahora ?? (() => new Date());
    const nuevoId = opciones.nuevoId ?? randomUUID;
    return enTransaccionOrg(this.db, nueva.orgId, async (tx) => {
      // Misma clave de bloqueo que el trigger (reentrante dentro de la transaccion).
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"auditoria:" + nueva.orgId}, 0))`,
      );
      const prev = await ultimaEn(tx, nueva.orgId);
      const base = {
        id: nuevoId(),
        orgId: nueva.orgId,
        seq: (prev?.seq ?? 0) + 1,
        actor: nueva.actor,
        accion: nueva.accion,
        entidad: nueva.entidad,
        antes: redactar(nueva.antes ?? null),
        despues: redactar(nueva.despues ?? null),
        hashPrev: prev?.hash ?? null,
        creadoEn: ahora().toISOString(),
      };
      const entrada: EntradaAuditoria = { ...base, hash: calcularHash(base, clave) };
      await insertarEn(tx, entrada);
      return entrada;
    });
  }
}

/**
 * Auditor para varias instancias: `anexar` delega en el anexo atomico de Postgres en lugar de
 * leer-calcular-insertar en pasos separados (que solo serializa dentro de un proceso). Mismo
 * contrato que Auditor; listar y verificar no cambian.
 */
export class AuditorPostgres extends Auditor {
  constructor(
    private readonly repoPg: AuditoriaDrizzleRepo,
    private readonly opcionesPg: OpcionesAuditor = {},
  ) {
    super(repoPg, opcionesPg);
  }

  override anexar(nueva: NuevaEntrada): Promise<EntradaAuditoria> {
    return this.repoPg.anexarAtomico(nueva, this.opcionesPg);
  }
}
