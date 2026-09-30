import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { AlmacenBlob } from "./blob";

/**
 * Subconjunto del cliente de Supabase Storage que usa el almacen (inyectable: en pruebas un
 * cliente falso, sin red). Coincide con `createClient(...).storage` de @supabase/supabase-js.
 */
export interface ClienteStorage {
  from(bucket: string): {
    upload(
      ruta: string,
      cuerpo: Uint8Array,
      opciones: { contentType: string; upsert: boolean },
    ): Promise<{ data: unknown; error: { message: string; statusCode?: string | number } | null }>;
    download(ruta: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  };
}

export const BUCKET_DOCUMENTOS = "documentos";
const ESQUEMA = "supabase-storage:";
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (contenido: Uint8Array) => createHash("sha256").update(contenido).digest("hex");

/** El objeto ya existe: con rutas por hash es el mismo contenido (subida idempotente). */
const yaExiste = (error: { message: string; statusCode?: string | number }) =>
  String(error.statusCode) === "409" || /already exists|duplicate/i.test(error.message);

/**
 * Documentos en Supabase Storage (bucket privado "documentos").
 * - Ruta `<orgId>/<sha256>`: por organizacion y direccionada por contenido (dos versiones
 *   iguales comparten objeto; nada se sobrescribe: upsert=false).
 * - Al leer se recalcula el SHA-256 y se descarta lo que no coincida con la ruta (integridad).
 * - Solo servidor: usa la service role (SUPABASE_SERVICE_ROLE_KEY), que nunca llega al cliente.
 *   El aislamiento por organizacion lo garantiza la BD: la URL solo se obtiene de una version
 *   leida bajo RLS de la propia organizacion.
 */
export class AlmacenBlobSupabase implements AlmacenBlob {
  constructor(
    private readonly storage: ClienteStorage,
    private readonly bucket = BUCKET_DOCUMENTOS,
  ) {}

  async guardar(input: Parameters<AlmacenBlob["guardar"]>[0]) {
    if (!UUID.test(input.orgId)) throw new Error("orgId invalido para Storage");
    const hash = sha256(input.contenido);
    const ruta = `${input.orgId}/${hash}`;
    const { error } = await this.storage.from(this.bucket).upload(ruta, input.contenido, {
      contentType: input.tipo,
      upsert: false,
    });
    if (error && !yaExiste(error)) throw new Error(`Storage: no se pudo guardar el documento (${error.message})`);
    return { url: `${ESQUEMA}//${this.bucket}/${ruta}` };
  }

  async leer(url: string) {
    const ref = this.analizar(url);
    if (!ref) return null;
    const { data, error } = await this.storage.from(this.bucket).download(`${ref.orgId}/${ref.hash}`);
    if (error || !data) return null;
    const contenido = new Uint8Array(await data.arrayBuffer());
    return sha256(contenido) === ref.hash ? contenido : null;
  }

  private analizar(url: string): { orgId: string; hash: string } | null {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== ESQUEMA || u.host !== this.bucket) return null;
    const [orgId, hash, ...resto] = u.pathname.replace(/^\//, "").split("/");
    if (resto.length > 0 || !orgId || !hash || !UUID.test(orgId) || !SHA256_HEX.test(hash)) return null;
    return { orgId, hash };
  }
}

/** Almacen desde el entorno (solo servidor): SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. */
export function crearAlmacenBlobSupabaseDesdeEntorno(
  env: Record<string, string | undefined> = process.env,
): AlmacenBlobSupabase {
  const url = env.SUPABASE_URL?.trim();
  const clave = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !clave) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para guardar documentos");
  }
  const cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new AlmacenBlobSupabase(cliente.storage as unknown as ClienteStorage);
}
