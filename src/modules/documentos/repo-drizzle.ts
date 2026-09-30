import { and, asc, eq, inArray } from "drizzle-orm";
import { enTransaccionOrg, type BaseDatos, type TransaccionBd } from "@/core/db";
import { documento, documentoVersion } from "@/core/db/schema";
import type { DocumentoConVersiones, FiltroDocumentos, VersionDocumento } from "./domain";
import type { DocumentosRepo } from "./repo";

type FilaVersion = typeof documentoVersion.$inferSelect;

const aVersion = (f: FilaVersion): VersionDocumento => ({
  id: f.documentoId,
  orgId: f.orgId,
  proyectoId: f.proyectoId,
  tareaId: f.tareaId,
  blobUrl: f.blobUrl,
  hash: f.hash,
  version: f.version,
  tipo: f.tipo,
  nombre: f.nombre,
  tamano: f.tamano,
  creadoEn: f.creadoEn.toISOString(),
  creadoPor: f.creadoPor,
});

const filaVersion = (v: VersionDocumento) => ({
  orgId: v.orgId,
  documentoId: v.id,
  version: v.version,
  proyectoId: v.proyectoId,
  tareaId: v.tareaId,
  blobUrl: v.blobUrl,
  hash: v.hash,
  tipo: v.tipo,
  nombre: v.nombre,
  tamano: v.tamano,
  creadoEn: new Date(v.creadoEn),
  creadoPor: v.creadoPor,
});

/** Cabecera = version actual (misma forma que el resumen del repo en memoria). */
const cabecera = (v: VersionDocumento) => ({
  proyectoId: v.proyectoId,
  tareaId: v.tareaId,
  blobUrl: v.blobUrl,
  hash: v.hash,
  version: v.version,
  tipo: v.tipo,
  nombre: v.nombre,
});

function resumen(versiones: VersionDocumento[]): DocumentoConVersiones {
  const actual = versiones[versiones.length - 1];
  if (!actual) throw new Error("Documento sin versiones");
  return {
    id: actual.id,
    orgId: actual.orgId,
    proyectoId: actual.proyectoId,
    tareaId: actual.tareaId,
    nombre: actual.nombre,
    tipo: actual.tipo,
    versionActual: actual.version,
    versiones,
  };
}

/** Versiones de varios documentos de la org, agrupadas y en orden de version. */
async function versionesDe(tx: TransaccionBd, orgId: string, ids: string[]) {
  const porDocumento = new Map<string, VersionDocumento[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return porDocumento;
  const filas = await tx
    .select()
    .from(documentoVersion)
    .where(and(eq(documentoVersion.orgId, orgId), inArray(documentoVersion.documentoId, ids)))
    .orderBy(asc(documentoVersion.documentoId), asc(documentoVersion.version));
  for (const f of filas) porDocumento.get(f.documentoId)?.push(aVersion(f));
  return porDocumento;
}

/**
 * Documentos en PostgreSQL: `documento` es la cabecera (version actual) y `documento_version`
 * el historial inmutable. Todo en enTransaccionOrg (rol app_rw + app.org_id, RLS).
 */
export class DocumentosDrizzleRepo implements DocumentosRepo {
  constructor(private readonly db: BaseDatos) {}

  async crear(version: VersionDocumento) {
    if (version.version !== 1) throw new Error("Version invalida");
    await enTransaccionOrg(this.db, version.orgId, async (tx) => {
      // PK duplicada => error de unicidad, igual que "Documento duplicado" en memoria.
      await tx.insert(documento).values({ id: version.id, orgId: version.orgId, ...cabecera(version) });
      await tx.insert(documentoVersion).values(filaVersion(version));
    });
  }

  async agregarVersion(orgId: string, id: string, version: VersionDocumento) {
    if (version.orgId !== orgId || version.id !== id) throw new Error("Documento no encontrado");
    await enTransaccionOrg(this.db, orgId, async (tx) => {
      // Compare-and-set sobre la version actual: dos versiones concurrentes no se pisan.
      const avanzado = await tx
        .update(documento)
        .set(cabecera(version))
        .where(and(eq(documento.orgId, orgId), eq(documento.id, id), eq(documento.version, version.version - 1)))
        .returning({ id: documento.id });
      if (avanzado.length === 0) {
        const [existe] = await tx
          .select({ id: documento.id })
          .from(documento)
          .where(and(eq(documento.orgId, orgId), eq(documento.id, id)));
        throw new Error(existe ? "Version invalida" : "Documento no encontrado");
      }
      await tx.insert(documentoVersion).values(filaVersion(version));
    });
  }

  obtener(orgId: string, id: string) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const versiones = (await versionesDe(tx, orgId, [id])).get(id) ?? [];
      return versiones.length > 0 ? resumen(versiones) : null;
    });
  }

  obtenerVersion(orgId: string, id: string, numero: number) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const [f] = await tx
        .select()
        .from(documentoVersion)
        .where(
          and(
            eq(documentoVersion.orgId, orgId),
            eq(documentoVersion.documentoId, id),
            eq(documentoVersion.version, numero),
          ),
        );
      return f ? aVersion(f) : null;
    });
  }

  listar(orgId: string, filtro: FiltroDocumentos) {
    return enTransaccionOrg(this.db, orgId, async (tx) => {
      const condicion =
        "proyectoId" in filtro && filtro.proyectoId !== undefined
          ? eq(documento.proyectoId, filtro.proyectoId)
          : eq(documento.tareaId, filtro.tareaId as string);
      const cabeceras = await tx
        .select({ id: documento.id })
        .from(documento)
        .where(and(eq(documento.orgId, orgId), condicion));
      const versiones = await versionesDe(
        tx,
        orgId,
        cabeceras.map((c) => c.id),
      );
      // Orden en JS (localeCompare), igual que en memoria: la collation de la BD puede diferir.
      return [...versiones.values()]
        .filter((v) => v.length > 0)
        .map(resumen)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
  }
}
