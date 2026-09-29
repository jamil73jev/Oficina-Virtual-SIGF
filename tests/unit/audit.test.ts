import { describe, expect, it } from "vitest";
import {
  Auditor,
  AuditoriaMemoriaRepo,
  canonico,
  verificarCadena,
  type EntradaAuditoria,
} from "@/core/audit";

const mk = () => {
  const repo = new AuditoriaMemoriaRepo();
  let t = 0;
  const auditor = new Auditor(repo, {
    ahora: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)),
  });
  return { repo, auditor };
};

const llenar = async (a: Auditor, orgId: string, n: number) => {
  for (let i = 0; i < n; i++) {
    await a.anexar({
      orgId,
      actor: "u1",
      accion: `a${i}`,
      entidad: "proyecto:1",
      despues: { i },
    });
  }
};

describe("canonico", () => {
  it("ignora el orden de claves y undefined", () => {
    expect(canonico({ b: 1, a: [1, { d: 1, c: undefined }] })).toBe(
      canonico({ a: [1, { d: 1 }], b: 1 }),
    );
  });
});

describe("anexar", () => {
  it("encadena por hash SHA-256 con hashPrev", async () => {
    const { auditor } = mk();
    const e1 = await auditor.anexar({
      orgId: "o1",
      actor: "u",
      accion: "x",
      entidad: "e",
    });
    const e2 = await auditor.anexar({
      orgId: "o1",
      actor: "u",
      accion: "y",
      entidad: "e",
    });
    expect(e1.hashPrev).toBeNull();
    expect(e1.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(e2.hashPrev).toBe(e1.hash);
    expect([e1.seq, e2.seq]).toEqual([1, 2]);
  });
  it("cada org tiene su propia cadena", async () => {
    const { auditor } = mk();
    await llenar(auditor, "o1", 3);
    const b = await auditor.anexar({
      orgId: "o2",
      actor: "u",
      accion: "x",
      entidad: "e",
    });
    expect(b.hashPrev).toBeNull();
    expect(b.seq).toBe(1);
    expect(await auditor.listar("o2")).toHaveLength(1);
    expect(await auditor.listar("o1")).toHaveLength(3);
  });
  it("anexados concurrentes no rompen la cadena", async () => {
    const { auditor } = mk();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        auditor.anexar({
          orgId: "o1",
          actor: "u",
          accion: `a${i}`,
          entidad: "e",
        }),
      ),
    );
    expect(await auditor.verificar("o1")).toEqual({ valida: true, total: 20 });
  });
  it("el repo devuelve copias: mutar el resultado no altera lo almacenado", async () => {
    const { auditor } = mk();
    const e = await auditor.anexar({
      orgId: "o1",
      actor: "u",
      accion: "x",
      entidad: "e",
      despues: { a: 1 },
    });
    e.actor = "atacante";
    (await auditor.listar("o1"))[0]!.accion = "otra";
    expect(await auditor.verificar("o1")).toEqual({ valida: true, total: 1 });
  });
});

describe("verificar", () => {
  it("cadena vacia y cadena valida", async () => {
    const { auditor } = mk();
    expect(await auditor.verificar("o1")).toEqual({ valida: true, total: 0 });
    await llenar(auditor, "o1", 5);
    expect(await auditor.verificar("o1")).toEqual({ valida: true, total: 5 });
  });

  const base = async () => {
    const { repo, auditor } = mk();
    await llenar(auditor, "o1", 5);
    return { repo, auditor, lista: await auditor.listar("o1") };
  };

  it("detecta modificar el contenido de una entrada", async () => {
    const { repo, auditor } = await base();
    (repo._internoParaPruebas("o1")[2] as EntradaAuditoria).actor = "otro";
    expect(await auditor.verificar("o1")).toEqual({
      valida: false,
      indice: 2,
      motivo: "hash",
    });
  });
  it("detecta modificar el payload despues", async () => {
    const { repo, auditor } = await base();
    (repo._internoParaPruebas("o1")[1] as EntradaAuditoria).despues = {
      i: 999,
    };
    expect(await auditor.verificar("o1")).toMatchObject({
      valida: false,
      indice: 1,
      motivo: "hash",
    });
  });
  it("detecta modificar entrada y recalcular solo su hash (rompe el eslabon siguiente)", async () => {
    const { lista } = await base();
    const copia = structuredClone(lista);
    copia[1]!.accion = "falsa";
    const { calcularHash } = await import("@/core/audit");
    const { hash: _h, ...resto } = copia[1]!;
    void _h;
    copia[1]!.hash = calcularHash(resto);
    expect(verificarCadena("o1", copia)).toEqual({
      valida: false,
      indice: 2,
      motivo: "hash_prev",
    });
  });
  it("detecta borrado de una entrada intermedia", async () => {
    const { lista } = await base();
    lista.splice(2, 1);
    expect(verificarCadena("o1", lista)).toMatchObject({
      valida: false,
      indice: 2,
      motivo: "secuencia",
    });
  });
  it("detecta borrado de la primera entrada", async () => {
    const { lista } = await base();
    lista.shift();
    expect(verificarCadena("o1", lista).valida).toBe(false);
  });
  it("detecta reordenamiento", async () => {
    const { lista } = await base();
    [lista[1], lista[2]] = [lista[2]!, lista[1]!];
    expect(verificarCadena("o1", lista).valida).toBe(false);
  });
  it("detecta insercion de una entrada falsa", async () => {
    const { lista } = await base();
    lista.splice(2, 0, { ...structuredClone(lista[1]!), id: "falso" });
    expect(verificarCadena("o1", lista).valida).toBe(false);
  });
  it("detecta entrada de otra organizacion mezclada en la cadena", async () => {
    const { lista } = await base();
    lista[3]!.orgId = "o2";
    expect(verificarCadena("o1", lista)).toEqual({
      valida: false,
      indice: 3,
      motivo: "org_distinta",
    });
  });
  it("una cadena de otra org no valida como la propia", async () => {
    const { auditor } = mk();
    await llenar(auditor, "o2", 2);
    expect(verificarCadena("o1", await auditor.listar("o2")).valida).toBe(
      false,
    );
  });
  it("detecta truncar la cola solo si se conoce el ultimo hash (truncar deja cadena consistente)", async () => {
    const { lista } = await base();
    const ultimoHash = lista[4]!.hash;
    lista.pop();
    expect(verificarCadena("o1", lista).valida).toBe(true);
    expect(lista.at(-1)!.hash).not.toBe(ultimoHash);
  });
});
