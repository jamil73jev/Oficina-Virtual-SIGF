import { describe, expect, it } from "vitest";
import { Auditor, AuditoriaMemoriaRepo } from "@/core/audit";
import type { ContextoAcceso } from "@/core/rbac";
import {
  AlmacenBlobMemoria,
  crearManejadoresDocumentos,
  DocumentosMemoriaRepo,
  ServicioDocumentos,
} from "@/modules/documentos";

const ID_DOC = "00000000-0000-4000-8000-000000000001";
const PROYECTO = "00000000-0000-4000-8000-000000000002";
const ctx = (orgId: string, rol: ContextoAcceso["rol"] = "admin"): ContextoAcceso => ({
  usuarioId: `usuario-${orgId}`,
  orgId,
  rol,
});
const archivo = (contenido: string, tipo = "text/plain") => ({
  nombre: "informe.txt",
  tipo,
  contenido: new TextEncoder().encode(contenido),
});

function entorno() {
  const auditoria = new AuditoriaMemoriaRepo();
  const auditor = new Auditor(auditoria, { claveHmac: "clave-documentos-pruebas-segura" });
  const servicio = new ServicioDocumentos(
    new DocumentosMemoriaRepo(),
    new AlmacenBlobMemoria(),
    auditor,
    { nuevoId: () => ID_DOC },
  );
  return { servicio, auditor };
}

describe("documentos", () => {
  it("aisla consultas y versiones entre organizaciones", async () => {
    const { servicio } = entorno();
    await servicio.subir({ proyectoId: PROYECTO, archivo: archivo("org-a") }, ctx("org-a"));
    expect(await servicio.listar({ proyectoId: PROYECTO }, ctx("org-b"))).toEqual([]);
    await expect(servicio.leerVersion(ID_DOC, 1, ctx("org-b"))).rejects.toMatchObject({ codigo: "no_encontrado" });
  });

  it("deniega escritura al viewer y audita la denegacion", async () => {
    const { servicio, auditor } = entorno();
    await expect(servicio.subir({ proyectoId: PROYECTO, archivo: archivo("x") }, ctx("org-a", "viewer")))
      .rejects.toMatchObject({ codigo: "rol_insuficiente" });
    expect(await auditor.verificar("org-a")).toEqual({ valida: true, total: 1 });
  });

  it("conserva la version anterior y calcula un hash distinto", async () => {
    const { servicio, auditor } = entorno();
    const primera = await servicio.subir({ proyectoId: PROYECTO, archivo: archivo("primera") }, ctx("org-a"));
    const segunda = await servicio.versionar(ID_DOC, archivo("segunda"), ctx("org-a"));
    expect(segunda.hash).not.toBe(primera.hash);
    expect(new TextDecoder().decode((await servicio.leerVersion(ID_DOC, 1, ctx("org-a"))).contenido)).toBe("primera");
    expect(new TextDecoder().decode((await servicio.leerVersion(ID_DOC, 2, ctx("org-a"))).contenido)).toBe("segunda");
    expect(await auditor.verificar("org-a")).toEqual({ valida: true, total: 2 });
  });

  it("rechaza MIME o tamano invalido en HTTP sin persistir", async () => {
    const { servicio } = entorno();
    const handlers = crearManejadoresDocumentos({ servicio, identidad: () => ctx("org-a") });
    const form = new FormData();
    form.set("proyectoId", PROYECTO);
    form.set("archivo", new File(["contenido"], "mal.exe", { type: "application/x-msdownload" }));
    const tipo = await handlers.subir(new Request("http://local/api/documents", { method: "POST", body: form }));
    expect(tipo.status).toBe(415);

    const vacio = new FormData();
    vacio.set("proyectoId", PROYECTO);
    vacio.set("archivo", new File([], "vacio.txt", { type: "text/plain" }));
    const tamano = await handlers.subir(new Request("http://local/api/documents", { method: "POST", body: vacio }));
    expect(tamano.status).toBe(413);
    expect(await servicio.listar({ proyectoId: PROYECTO }, ctx("org-a"))).toEqual([]);
  });
});

