import { randomUUID } from "node:crypto";

export interface AlmacenBlob {
  guardar(input: {
    orgId: string;
    documentoId: string;
    version: number;
    contenido: Uint8Array;
    tipo: string;
  }): Promise<{ url: string }>;
  leer(url: string): Promise<Uint8Array | null>;
}

const clonar = (contenido: Uint8Array) => new Uint8Array(contenido);

export class AlmacenBlobMemoria implements AlmacenBlob {
  private readonly blobs = new Map<string, Uint8Array>();

  async guardar(input: Parameters<AlmacenBlob["guardar"]>[0]) {
    const url = `memory://documentos/${encodeURIComponent(input.orgId)}/${input.documentoId}/${input.version}/${randomUUID()}`;
    this.blobs.set(url, clonar(input.contenido));
    return { url };
  }

  async leer(url: string) {
    const contenido = this.blobs.get(url);
    return contenido ? clonar(contenido) : null;
  }
}

