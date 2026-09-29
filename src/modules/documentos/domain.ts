import { z } from "zod";
import type { Documento } from "@/types";

export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;
export const TIPOS_DOCUMENTO_PERMITIDOS = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
] as const;

export const MetadatosDocumento = z.strictObject({
  proyectoId: z.uuid(),
  tareaId: z.uuid().nullable().optional().default(null),
});

export interface VersionDocumento extends Documento {
  nombre: string;
  tamano: number;
  creadoEn: string;
  creadoPor: string;
}

export interface DocumentoConVersiones {
  id: string;
  orgId: string;
  proyectoId: string;
  tareaId: string | null;
  nombre: string;
  tipo: string;
  versionActual: number;
  versiones: VersionDocumento[];
}

export interface ArchivoEntrada {
  nombre: string;
  tipo: string;
  contenido: Uint8Array;
}

export type FiltroDocumentos =
  | { proyectoId: string; tareaId?: never }
  | { tareaId: string; proyectoId?: never };

