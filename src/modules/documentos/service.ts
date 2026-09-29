import { createHash, randomUUID } from "node:crypto";
import type { Auditor } from "@/core/audit";
import { can, type ContextoAcceso } from "@/core/rbac";
import type { AlmacenBlob } from "./blob";
import type { ArchivoEntrada, FiltroDocumentos, VersionDocumento } from "./domain";
import type { DocumentosRepo } from "./repo";

export type CodigoErrorDocumento = "no_encontrado" | "rol_insuficiente" | "archivo_invalido";

export class DocumentoError extends Error {
  constructor(readonly codigo: CodigoErrorDocumento) {
    super(`Documento: ${codigo}`);
    this.name = "DocumentoError";
  }
}

export interface OpcionesServicioDocumentos {
  ahora?: () => Date;
  nuevoId?: () => string;
}

export class ServicioDocumentos {
  private readonly ahora: () => Date;
  private readonly nuevoId: () => string;

  constructor(
    private readonly repo: DocumentosRepo,
    private readonly blobs: AlmacenBlob,
    private readonly auditor: Auditor,
    opciones: OpcionesServicioDocumentos = {},
  ) {
    this.ahora = opciones.ahora ?? (() => new Date());
    this.nuevoId = opciones.nuevoId ?? randomUUID;
  }

  async subir(
    datos: { proyectoId: string; tareaId?: string | null; archivo: ArchivoEntrada },
    ctx: ContextoAcceso,
  ): Promise<VersionDocumento> {
    await this.exigirEscritura(ctx, "documento:subir_denegado", "documento:nuevo");
    const id = this.nuevoId();
    const version = await this.crearVersion(id, 1, datos, ctx);
    await this.auditor.anexar({
      orgId: ctx.orgId,
      actor: ctx.usuarioId,
      accion: "documento:subir",
      entidad: `documento:${id}`,
      antes: null,
      despues: version,
    });
    await this.repo.crear(version);
    return version;
  }

  async versionar(id: string, archivo: ArchivoEntrada, ctx: ContextoAcceso) {
    await this.exigirEscritura(ctx, "documento:versionar_denegado", `documento:${id}`);
    const documento = await this.repo.obtener(ctx.orgId, id);
    if (!documento) throw new DocumentoError("no_encontrado");
    const version = await this.crearVersion(
      id,
      documento.versionActual + 1,
      { proyectoId: documento.proyectoId, tareaId: documento.tareaId, archivo },
      ctx,
    );
    await this.auditor.anexar({
      orgId: ctx.orgId,
      actor: ctx.usuarioId,
      accion: "documento:versionar",
      entidad: `documento:${id}`,
      antes: documento.versiones[documento.versiones.length - 1],
      despues: version,
    });
    await this.repo.agregarVersion(ctx.orgId, id, version);
    return version;
  }

  async listar(filtro: FiltroDocumentos, ctx: ContextoAcceso) {
    if (!can(ctx.rol, "proyecto:leer")) throw new DocumentoError("rol_insuficiente");
    return this.repo.listar(ctx.orgId, filtro);
  }

  async leerVersion(id: string, numero: number, ctx: ContextoAcceso) {
    if (!can(ctx.rol, "proyecto:leer")) throw new DocumentoError("rol_insuficiente");
    const version = await this.repo.obtenerVersion(ctx.orgId, id, numero);
    if (!version) throw new DocumentoError("no_encontrado");
    const contenido = await this.blobs.leer(version.blobUrl);
    if (!contenido) throw new DocumentoError("no_encontrado");
    return { version, contenido };
  }

  private async crearVersion(
    id: string,
    version: number,
    datos: { proyectoId: string; tareaId?: string | null; archivo: ArchivoEntrada },
    ctx: ContextoAcceso,
  ): Promise<VersionDocumento> {
    if (!datos.archivo.contenido.byteLength || !datos.archivo.tipo || !datos.archivo.nombre) {
      throw new DocumentoError("archivo_invalido");
    }
    const hash = createHash("sha256").update(datos.archivo.contenido).digest("hex");
    const blob = await this.blobs.guardar({
      orgId: ctx.orgId,
      documentoId: id,
      version,
      contenido: datos.archivo.contenido,
      tipo: datos.archivo.tipo,
    });
    return {
      id,
      orgId: ctx.orgId,
      proyectoId: datos.proyectoId,
      tareaId: datos.tareaId ?? null,
      blobUrl: blob.url,
      hash,
      version,
      tipo: datos.archivo.tipo,
      nombre: datos.archivo.nombre,
      tamano: datos.archivo.contenido.byteLength,
      creadoEn: this.ahora().toISOString(),
      creadoPor: ctx.usuarioId,
    };
  }

  private async exigirEscritura(ctx: ContextoAcceso, accion: string, entidad: string) {
    if (can(ctx.rol, "proyecto:editar")) return;
    await this.auditor.anexar({
      orgId: ctx.orgId,
      actor: ctx.usuarioId,
      accion,
      entidad,
      despues: { motivo: "rol_insuficiente", rol: ctx.rol },
    });
    throw new DocumentoError("rol_insuficiente");
  }
}

