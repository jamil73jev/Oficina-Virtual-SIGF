import { z } from "zod";
import type { ProveedorIdentidad } from "@/core/approvals";
import {
  MAX_DOCUMENTO_BYTES,
  MetadatosDocumento,
  TIPOS_DOCUMENTO_PERMITIDOS,
} from "./domain";
import { DocumentoError, type ServicioDocumentos } from "./service";

const Id = z.uuid();
const Version = z.coerce.number().int().positive();
const Filtro = z.union([
  z.strictObject({ proyectoId: z.uuid() }),
  z.strictObject({ tareaId: z.uuid() }),
]);

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
const error = (status: number, codigo: string) => json({ error: codigo }, status);

const ESTADO: Record<string, number> = {
  no_encontrado: 404,
  rol_insuficiente: 403,
  archivo_invalido: 400,
};

export interface DepsHttpDocumentos {
  servicio: ServicioDocumentos;
  identidad: ProveedorIdentidad;
}

async function archivoDeFormulario(req: Request) {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    return { ok: false, response: error(415, "content_type_no_soportado") } as const;
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, response: error(400, "formulario_invalido") } as const;
  }
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, response: error(400, "archivo_requerido") } as const;
  if (archivo.size <= 0 || archivo.size > MAX_DOCUMENTO_BYTES) {
    return { ok: false, response: error(413, "tamano_invalido") } as const;
  }
  if (!(TIPOS_DOCUMENTO_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    return { ok: false, response: error(415, "tipo_no_permitido") } as const;
  }
  return {
    ok: true,
    form,
    archivo: {
      nombre: archivo.name,
      tipo: archivo.type,
      contenido: new Uint8Array(await archivo.arrayBuffer()),
    },
  } as const;
}

export function crearManejadoresDocumentos({ servicio, identidad }: DepsHttpDocumentos) {
  const manejarError = (e: unknown): Response => {
    if (e instanceof DocumentoError) return error(ESTADO[e.codigo] ?? 400, e.codigo);
    throw e;
  };

  return {
    async listar(req: Request) {
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");
      const url = new URL(req.url);
      const crudo = Object.fromEntries(url.searchParams);
      const filtro = Filtro.safeParse(crudo);
      if (!filtro.success) return error(400, "filtro_invalido");
      try {
        return json({ documentos: await servicio.listar(filtro.data, ctx) }, 200);
      } catch (e) {
        return manejarError(e);
      }
    },

    async subir(req: Request) {
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");
      const entrada = await archivoDeFormulario(req);
      if (!entrada.ok) return entrada.response;
      const metadatos = MetadatosDocumento.safeParse({
        proyectoId: entrada.form.get("proyectoId"),
        tareaId: entrada.form.get("tareaId") || null,
      });
      if (!metadatos.success) return error(400, "metadatos_invalidos");
      try {
        const documento = await servicio.subir({ ...metadatos.data, archivo: entrada.archivo }, ctx);
        return json({ documento }, 201);
      } catch (e) {
        return manejarError(e);
      }
    },

    async versionar(req: Request, idCrudo: string) {
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");
      const id = Id.safeParse(idCrudo);
      if (!id.success) return error(400, "id_invalido");
      const entrada = await archivoDeFormulario(req);
      if (!entrada.ok) return entrada.response;
      try {
        return json({ documento: await servicio.versionar(id.data, entrada.archivo, ctx) }, 201);
      } catch (e) {
        return manejarError(e);
      }
    },

    async leerVersion(req: Request, idCrudo: string, versionCruda: string) {
      const ctx = await identidad(req);
      if (!ctx) return error(401, "no_autenticado");
      const id = Id.safeParse(idCrudo);
      const version = Version.safeParse(versionCruda);
      if (!id.success || !version.success) return error(400, "parametros_invalidos");
      try {
        const resultado = await servicio.leerVersion(id.data, version.data, ctx);
        const cuerpo = resultado.contenido.buffer.slice(
          resultado.contenido.byteOffset,
          resultado.contenido.byteOffset + resultado.contenido.byteLength,
        ) as ArrayBuffer;
        return new Response(cuerpo, {
          status: 200,
          headers: {
            "Content-Type": resultado.version.tipo,
            "Content-Length": String(resultado.version.tamano),
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(resultado.version.nombre)}`,
            "X-Content-SHA256": resultado.version.hash,
            "Cache-Control": "private, no-store",
          },
        });
      } catch (e) {
        return manejarError(e);
      }
    },
  };
}
