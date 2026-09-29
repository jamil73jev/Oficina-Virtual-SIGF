import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface EntradaAuditoria {
  id: string;
  orgId: string;
  /** Posicion en la cadena de la organizacion, desde 1. */
  seq: number;
  actor: string;
  accion: string;
  entidad: string;
  antes: unknown;
  despues: unknown;
  hashPrev: string | null;
  hash: string;
  creadoEn: string;
}

export type NuevaEntrada = Pick<
  EntradaAuditoria,
  "orgId" | "actor" | "accion" | "entidad"
> & {
  antes?: unknown;
  despues?: unknown;
};

/** Repositorio append-only: sin actualizar ni borrar. */
export interface AuditoriaRepo {
  ultima(orgId: string): Promise<EntradaAuditoria | null>;
  agregar(entrada: EntradaAuditoria): Promise<void>;
  listar(orgId: string): Promise<EntradaAuditoria[]>;
}

/** JSON canonico (claves ordenadas) para hash estable. */
export function canonico(valor: unknown): string {
  if (valor === undefined) return "null";
  if (valor === null || typeof valor !== "object")
    return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const o = valor as Record<string, unknown>;
  const claves = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
}

const CLAVE_SENSIBLE =
  /(password|passwd|secret|apikey|authorization|cookie|credential)|token$/;

/** Normaliza el nombre de un campo: minusculas y sin separadores. */
const normalizarClave = (k: string) => k.toLowerCase().replace(/[_\-\s]/g, "");

export const VALOR_REDACTADO = "[REDACTADO]";

/**
 * Copia profunda que sustituye el valor de campos sensibles (password, token,
 * secret, apikey, authorization...). "tokens" (contadores de uso) no se redacta.
 */
export function redactar<T>(valor: T): T {
  const visto = new WeakSet<object>();
  const rec = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (visto.has(v)) return "[CICLO]";
    visto.add(v);
    if (Array.isArray(v)) return v.map(rec);
    if (v instanceof Date) return v.toISOString();
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = CLAVE_SENSIBLE.test(normalizarClave(k)) ? VALOR_REDACTADO : rec(x);
    }
    visto.delete(v);
    return out;
  };
  return rec(valor) as T;
}

/** Clave HMAC: bytes (>=16) o cadena. */
export type ClaveHmac = string | Uint8Array;

const CLAVE_DESARROLLO = "clave-hmac-solo-desarrollo-no-usar-en-produccion";

/**
 * Resuelve la clave HMAC de auditoria. Sin valor por defecto en produccion:
 * si falta (o es demasiado corta) lanza. Solo en development/test se usa una
 * clave fija de desarrollo.
 */
export function resolverClaveHmac(
  explicita?: ClaveHmac,
  env: Record<string, string | undefined> = process.env,
): ClaveHmac {
  const c = explicita ?? env.AUDIT_HMAC_KEY;
  if (c !== undefined && c !== "") {
    if (c.length < 16) throw new Error("AUDIT_HMAC_KEY demasiado corta (min. 16)");
    return c;
  }
  const dev = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  if (dev && !env.VERCEL_ENV) return CLAVE_DESARROLLO;
  throw new Error("AUDIT_HMAC_KEY es obligatoria fuera de desarrollo/test");
}

/**
 * HMAC-SHA256 del contenido canonico. Con clave secreta fuera de la BD, quien
 * tenga acceso de escritura a la tabla no puede recalcular la cadena.
 */
export function calcularHash(
  e: Omit<EntradaAuditoria, "hash">,
  clave: ClaveHmac = resolverClaveHmac(),
): string {
  const contenido = canonico({
    id: e.id,
    orgId: e.orgId,
    seq: e.seq,
    actor: e.actor,
    accion: e.accion,
    entidad: e.entidad,
    antes: e.antes,
    despues: e.despues,
    hashPrev: e.hashPrev,
    creadoEn: e.creadoEn,
  });
  return createHmac("sha256", clave).update(contenido).digest("hex");
}

const clonar = <T>(v: T): T => structuredClone(v);

export class AuditoriaMemoriaRepo implements AuditoriaRepo {
  private readonly porOrg = new Map<string, EntradaAuditoria[]>();

  async ultima(orgId: string) {
    const l = this.porOrg.get(orgId);
    const u = l?.[l.length - 1];
    return u ? clonar(u) : null;
  }

  async agregar(entrada: EntradaAuditoria) {
    const l = this.porOrg.get(entrada.orgId) ?? [];
    if (entrada.seq !== l.length + 1)
      throw new Error("Secuencia de auditoria invalida");
    l.push(clonar(entrada));
    this.porOrg.set(entrada.orgId, l);
  }

  async listar(orgId: string) {
    return clonar(this.porOrg.get(orgId) ?? []);
  }

  /** Solo para pruebas: acceso a la lista interna para simular manipulacion. */
  _internoParaPruebas(orgId: string): EntradaAuditoria[] {
    return this.porOrg.get(orgId) ?? [];
  }
}

export interface OpcionesAuditor {
  ahora?: () => Date;
  nuevoId?: () => string;
  /** Clave HMAC inyectada; si falta se toma AUDIT_HMAC_KEY (obligatoria en produccion). */
  claveHmac?: ClaveHmac;
}

export type ResultadoVerificacion =
  | { valida: true; total: number }
  | {
      valida: false;
      indice: number;
      motivo: "org_distinta" | "secuencia" | "hash_prev" | "hash";
    };

export class Auditor {
  private cola: Promise<unknown> = Promise.resolve();
  private readonly ahora: () => Date;
  private readonly nuevoId: () => string;
  private readonly clave: ClaveHmac;

  constructor(
    private readonly repo: AuditoriaRepo,
    opciones: OpcionesAuditor = {},
  ) {
    this.clave = resolverClaveHmac(opciones.claveHmac);
    this.ahora = opciones.ahora ?? (() => new Date());
    this.nuevoId = opciones.nuevoId ?? randomUUID;
  }

  /** Anexa una entrada encadenada al hash de la anterior de la misma org (serializado). */
  anexar(nueva: NuevaEntrada): Promise<EntradaAuditoria> {
    const tarea = this.cola.then(async () => {
      const prev = await this.repo.ultima(nueva.orgId);
      const base = {
        id: this.nuevoId(),
        orgId: nueva.orgId,
        seq: (prev?.seq ?? 0) + 1,
        actor: nueva.actor,
        accion: nueva.accion,
        entidad: nueva.entidad,
        antes: redactar(nueva.antes ?? null),
        despues: redactar(nueva.despues ?? null),
        hashPrev: prev?.hash ?? null,
        creadoEn: this.ahora().toISOString(),
      };
      const entrada: EntradaAuditoria = { ...base, hash: calcularHash(base, this.clave) };
      await this.repo.agregar(entrada);
      return entrada;
    });
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  listar(orgId: string) {
    return this.repo.listar(orgId);
  }

  async verificar(orgId: string): Promise<ResultadoVerificacion> {
    return verificarCadena(orgId, await this.repo.listar(orgId), this.clave);
  }
}

const hashIgual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Recorre la cadena y detecta modificacion, borrado, reordenamiento o insercion. */
export function verificarCadena(
  orgId: string,
  entradas: readonly EntradaAuditoria[],
  clave: ClaveHmac = resolverClaveHmac(),
): ResultadoVerificacion {
  let prev: EntradaAuditoria | null = null;
  for (let i = 0; i < entradas.length; i++) {
    const e = entradas[i] as EntradaAuditoria;
    if (e.orgId !== orgId)
      return { valida: false, indice: i, motivo: "org_distinta" };
    if (e.seq !== i + 1)
      return { valida: false, indice: i, motivo: "secuencia" };
    if (e.hashPrev !== (prev?.hash ?? null)) {
      return { valida: false, indice: i, motivo: "hash_prev" };
    }
    const { hash, ...resto } = e;
    if (!hashIgual(calcularHash(resto, clave), hash))
      return { valida: false, indice: i, motivo: "hash" };
    prev = e;
  }
  return { valida: true, total: entradas.length };
}
