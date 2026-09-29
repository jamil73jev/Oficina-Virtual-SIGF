import type { DocumentoConVersiones, FiltroDocumentos, VersionDocumento } from "./domain";

export interface DocumentosRepo {
  crear(version: VersionDocumento): Promise<void>;
  agregarVersion(orgId: string, id: string, version: VersionDocumento): Promise<void>;
  obtener(orgId: string, id: string): Promise<DocumentoConVersiones | null>;
  obtenerVersion(orgId: string, id: string, version: number): Promise<VersionDocumento | null>;
  listar(orgId: string, filtro: FiltroDocumentos): Promise<DocumentoConVersiones[]>;
}

const clonar = <T>(valor: T): T => structuredClone(valor);

export class DocumentosMemoriaRepo implements DocumentosRepo {
  private readonly porOrg = new Map<string, Map<string, VersionDocumento[]>>();

  async crear(version: VersionDocumento) {
    const documentos = this.porOrg.get(version.orgId) ?? new Map();
    if (documentos.has(version.id)) throw new Error("Documento duplicado");
    documentos.set(version.id, [clonar(version)]);
    this.porOrg.set(version.orgId, documentos);
  }

  async agregarVersion(orgId: string, id: string, version: VersionDocumento) {
    const versiones = this.porOrg.get(orgId)?.get(id);
    if (!versiones || version.orgId !== orgId || version.id !== id) {
      throw new Error("Documento no encontrado");
    }
    if (version.version !== versiones.length + 1) throw new Error("Version invalida");
    versiones.push(clonar(version));
  }

  async obtener(orgId: string, id: string) {
    const versiones = this.porOrg.get(orgId)?.get(id);
    return versiones ? this.resumen(versiones) : null;
  }

  async obtenerVersion(orgId: string, id: string, version: number) {
    const encontrada = this.porOrg.get(orgId)?.get(id)?.find((v) => v.version === version);
    return encontrada ? clonar(encontrada) : null;
  }

  async listar(orgId: string, filtro: FiltroDocumentos) {
    const documentos = [...(this.porOrg.get(orgId)?.values() ?? [])]
      .filter((versiones) => {
        const actual = versiones[versiones.length - 1];
        return actual && ("proyectoId" in filtro
          ? actual.proyectoId === filtro.proyectoId
          : actual.tareaId === filtro.tareaId);
      })
      .map((versiones) => this.resumen(versiones));
    return documentos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  private resumen(versiones: VersionDocumento[]): DocumentoConVersiones {
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
      versiones: clonar(versiones),
    };
  }
}

