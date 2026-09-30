import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocumentosMemoriaRepo, type DocumentosRepo, type VersionDocumento } from "@/modules/documentos";
import { DocumentosDrizzleRepo } from "@/modules/documentos/repo-drizzle";
import { TIMEOUT_ARRANQUE, crearBdPrueba, orgEnMemoria, type OrgSembrada } from "./pglite";

/** Org con un proyecto y una tarea propios (el documento exige ambos de la misma org). */
interface OrgDocs extends OrgSembrada {
  tareaId: string;
}

interface Montaje {
  repo: DocumentosRepo;
  nuevaOrg(): Promise<OrgDocs>;
  cerrar(): Promise<void>;
}

const implementaciones: { nombre: string; montar(): Promise<Montaje> }[] = [
  {
    nombre: "memoria",
    montar: async () => ({
      repo: new DocumentosMemoriaRepo(),
      nuevaOrg: async () => ({ ...(await orgEnMemoria()), tareaId: randomUUID() }),
      cerrar: async () => {},
    }),
  },
  {
    nombre: "drizzle (PGlite)",
    montar: async () => {
      const bd = await crearBdPrueba();
      return {
        repo: new DocumentosDrizzleRepo(bd.db),
        nuevaOrg: async () => {
          const o = await bd.nuevaOrg();
          const { rows } = await bd.comoPropietario(() =>
            bd.client.query<{ id: string }>("select id from tarea where org_id = $1", [o.orgId]),
          );
          return { ...o, tareaId: (rows[0] as { id: string }).id };
        },
        cerrar: bd.cerrar,
      };
    },
  },
];

let reloj = Date.UTC(2026, 8, 1, 10, 0, 0, 0);
const version = (o: OrgDocs, over: Partial<VersionDocumento> = {}): VersionDocumento => ({
  id: randomUUID(),
  orgId: o.orgId,
  proyectoId: o.proyectoId,
  tareaId: null,
  blobUrl: `memory://documentos/${o.orgId}/${randomUUID()}`,
  hash: "a".repeat(64),
  version: 1,
  tipo: "text/markdown",
  nombre: "informe.md",
  tamano: 42,
  creadoEn: new Date((reloj += 1000)).toISOString(),
  creadoPor: o.usuarios[0],
  ...over,
});

describe.each(implementaciones)("contrato DocumentosRepo: $nombre", ({ montar }) => {
  let m: Montaje;
  beforeAll(async () => {
    m = await montar();
  }, TIMEOUT_ARRANQUE);
  afterAll(() => m.cerrar());

  it("crea y obtiene el documento con su primera version", async () => {
    const o = await m.nuevaOrg();
    const v1 = version(o, { tareaId: o.tareaId });
    await m.repo.crear(v1);
    expect(await m.repo.obtener(o.orgId, v1.id)).toEqual({
      id: v1.id,
      orgId: o.orgId,
      proyectoId: o.proyectoId,
      tareaId: o.tareaId,
      nombre: v1.nombre,
      tipo: v1.tipo,
      versionActual: 1,
      versiones: [v1],
    });
    expect(await m.repo.obtenerVersion(o.orgId, v1.id, 1)).toEqual(v1);
    expect(await m.repo.obtenerVersion(o.orgId, v1.id, 2)).toBeNull();
    await expect(m.repo.crear(v1)).rejects.toThrow();
  });

  it("agrega versiones contiguas; la cabecera refleja la ultima", async () => {
    const o = await m.nuevaOrg();
    const v1 = version(o);
    await m.repo.crear(v1);
    const v2 = version(o, { id: v1.id, version: 2, nombre: "informe-v2.md", tipo: "text/plain", hash: "b".repeat(64) });
    await m.repo.agregarVersion(o.orgId, v1.id, v2);
    const doc = await m.repo.obtener(o.orgId, v1.id);
    expect(doc).toMatchObject({ versionActual: 2, nombre: "informe-v2.md", tipo: "text/plain" });
    expect(doc?.versiones).toEqual([v1, v2]);
    // Version repetida o salteada: invalida. Documento ajeno o inexistente: no encontrado.
    await expect(m.repo.agregarVersion(o.orgId, v1.id, { ...v2 })).rejects.toThrow("Version invalida");
    await expect(m.repo.agregarVersion(o.orgId, v1.id, { ...v2, version: 4 })).rejects.toThrow("Version invalida");
    const huerfano = randomUUID();
    await expect(m.repo.agregarVersion(o.orgId, huerfano, { ...v2, id: huerfano })).rejects.toThrow("Documento no encontrado");
    expect((await m.repo.obtener(o.orgId, v1.id))?.versiones).toHaveLength(2);
  });

  it("lista por proyecto o por tarea, ordenado por nombre", async () => {
    const o = await m.nuevaOrg();
    const docs = [
      version(o, { nombre: "zeta.pdf" }),
      version(o, { nombre: "Árbol.md", tareaId: o.tareaId }),
      version(o, { nombre: "alfa.json" }),
    ];
    for (const d of docs) await m.repo.crear(d);
    const porProyecto = await m.repo.listar(o.orgId, { proyectoId: o.proyectoId });
    expect(porProyecto.map((d) => d.nombre)).toEqual(["alfa.json", "Árbol.md", "zeta.pdf"]);
    const porTarea = await m.repo.listar(o.orgId, { tareaId: o.tareaId });
    expect(porTarea.map((d) => d.id)).toEqual([docs[1]?.id]);
  });

  it("aisla estrictamente por org", async () => {
    const a = await m.nuevaOrg();
    const b = await m.nuevaOrg();
    const v1 = version(a);
    await m.repo.crear(v1);
    expect(await m.repo.obtener(b.orgId, v1.id)).toBeNull();
    expect(await m.repo.obtenerVersion(b.orgId, v1.id, 1)).toBeNull();
    expect(await m.repo.listar(b.orgId, { proyectoId: a.proyectoId })).toEqual([]);
    await expect(
      m.repo.agregarVersion(b.orgId, v1.id, { ...v1, orgId: b.orgId, version: 2 }),
    ).rejects.toThrow("Documento no encontrado");
    expect((await m.repo.obtener(a.orgId, v1.id))?.versionActual).toBe(1);
  });
});
