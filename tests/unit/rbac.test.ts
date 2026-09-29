import { describe, expect, it } from "vitest";
import {
  ACCIONES,
  AccesoDenegadoError,
  ROLES,
  autorizar,
  can,
  exigir,
  soloDeOrg,
  type Accion,
  type ContextoAcceso,
  type RolUsuario,
} from "@/core/rbac";

const ctx = (rol: RolUsuario, orgId = "org-a"): ContextoAcceso => ({
  usuarioId: "u1",
  orgId,
  rol,
});

describe("can", () => {
  it("viewer solo lee", () => {
    for (const a of ACCIONES)
      expect(can("viewer", a)).toBe(
        a.endsWith(":leer") && a !== "auditoria:leer",
      );
  });
  it("viewer no ve auditoria", () => {
    expect(can("viewer", "auditoria:leer")).toBe(false);
  });
  it("supervisor decide aprobaciones pero no toca presupuesto ni crea agentes", () => {
    expect(can("supervisor", "aprobacion:decidir")).toBe(true);
    expect(can("supervisor", "auditoria:leer")).toBe(true);
    expect(can("supervisor", "presupuesto:editar")).toBe(false);
    expect(can("supervisor", "agente:crear")).toBe(false);
    expect(can("supervisor", "proyecto:archivar")).toBe(false);
  });
  it("admin gestiona pero no amplia presupuesto", () => {
    expect(can("admin", "presupuesto:editar")).toBe(true);
    expect(can("admin", "presupuesto:ampliar")).toBe(false);
    expect(can("admin", "auditoria:exportar")).toBe(true);
  });
  it("owner tiene todas las acciones", () => {
    for (const a of ACCIONES) expect(can("owner", a)).toBe(true);
  });
  it("la jerarquia es monotona: cada rol incluye los permisos del inferior", () => {
    const orden: RolUsuario[] = ["viewer", "supervisor", "admin", "owner"];
    for (let i = 1; i < orden.length; i++) {
      for (const a of ACCIONES) {
        if (can(orden[i - 1] as RolUsuario, a))
          expect(can(orden[i] as RolUsuario, a)).toBe(true);
      }
    }
    expect(ROLES).toHaveLength(4);
  });
  it("deniega por defecto rol o accion desconocidos", () => {
    expect(can("root" as RolUsuario, "proyecto:leer")).toBe(false);
    expect(can("owner", "proyecto:borrar_todo" as Accion)).toBe(false);
  });
});

describe("autorizar y aislamiento por org", () => {
  it("permite en la propia organizacion", () => {
    expect(autorizar(ctx("admin"), "agente:crear", { orgId: "org-a" })).toEqual(
      { permitido: true },
    );
  });
  it("rol insuficiente", () => {
    expect(autorizar(ctx("viewer"), "tarea:crear", { orgId: "org-a" })).toEqual(
      {
        permitido: false,
        motivo: "rol_insuficiente",
      },
    );
  });
  it("acceso cruzado denegado para todos los roles y acciones", () => {
    for (const rol of ROLES) {
      for (const a of ACCIONES) {
        expect(autorizar(ctx(rol), a, { orgId: "org-b" })).toEqual({
          permitido: false,
          motivo: "otra_org",
        });
      }
    }
  });
  it("owner de otra org tampoco accede", () => {
    expect(() =>
      exigir(ctx("owner", "org-b"), "proyecto:leer", { orgId: "org-a" }),
    ).toThrow(AccesoDenegadoError);
  });
  it("orgId vacio es invalido (no coincide por accidente)", () => {
    expect(autorizar(ctx("owner", ""), "proyecto:leer", { orgId: "" })).toEqual(
      {
        permitido: false,
        motivo: "org_invalida",
      },
    );
  });
  it("comparacion estricta: sin normalizar mayusculas ni espacios", () => {
    expect(
      autorizar(ctx("owner", "ORG-A"), "proyecto:leer", { orgId: "org-a" })
        .permitido,
    ).toBe(false);
    expect(
      autorizar(ctx("owner", "org-a "), "proyecto:leer", { orgId: "org-a" })
        .permitido,
    ).toBe(false);
  });
  it("exigir no lanza cuando esta permitido y expone el motivo al denegar", () => {
    expect(() =>
      exigir(ctx("viewer"), "proyecto:leer", { orgId: "org-a" }),
    ).not.toThrow();
    try {
      exigir(ctx("viewer"), "proyecto:editar", { orgId: "org-a" });
      expect.unreachable();
    } catch (e) {
      expect((e as AccesoDenegadoError).motivo).toBe("rol_insuficiente");
    }
  });
  it("soloDeOrg filtra recursos ajenos", () => {
    const items = [
      { id: 1, orgId: "org-a" },
      { id: 2, orgId: "org-b" },
      { id: 3, orgId: "org-a" },
    ];
    expect(soloDeOrg(ctx("viewer"), items).map((i) => i.id)).toEqual([1, 3]);
  });
});
