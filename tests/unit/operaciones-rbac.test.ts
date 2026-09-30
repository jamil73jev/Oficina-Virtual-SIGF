import { describe, expect, it } from "vitest";
import { ACCIONES, can, ROLES } from "@/core/rbac";

describe("rbac: acciones de operaciones", () => {
  it("estan registradas", () => {
    expect(ACCIONES).toContain("operacion:crear");
    expect(ACCIONES).toContain("operacion:leer");
  });

  it("operacion:crear solo owner, admin y supervisor", () => {
    expect(ROLES.filter((r) => can(r, "operacion:crear")).sort()).toEqual(["admin", "owner", "supervisor"]);
  });

  it("operacion:leer para todos los roles", () => {
    for (const rol of ROLES) expect(can(rol, "operacion:leer")).toBe(true);
  });
});
