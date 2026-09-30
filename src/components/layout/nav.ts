import type { NombreIcono } from "@/components/ui/icons";

/** Estructura de navegación: una entrada principal y tres secciones. Rutas relativas al locale. */
export type ClaveNav =
  | "home"
  | "operations"
  | "projects"
  | "approvals"
  | "documents"
  | "finance"
  | "costs"
  | "agents";

export type ClaveGrupo = "work" | "analysis" | "team";

export interface ItemNav {
  key: ClaveNav;
  path: string;
  icon: NombreIcono;
}

export const NAV_PRINCIPAL: readonly ItemNav[] = [
  { key: "home", path: "", icon: "home" },
  { key: "operations", path: "/operaciones", icon: "radar" },
];

export const NAV_GRUPOS: ReadonlyArray<{ key: ClaveGrupo; items: readonly ItemNav[] }> = [
  {
    key: "work",
    items: [
      { key: "projects", path: "/proyectos", icon: "folder" },
      { key: "approvals", path: "/aprobaciones", icon: "checkCircle" },
      { key: "documents", path: "/documentos", icon: "file" },
    ],
  },
  {
    key: "analysis",
    items: [
      { key: "finance", path: "/finanzas", icon: "chart" },
      { key: "costs", path: "/costos", icon: "coins" },
    ],
  },
  { key: "team", items: [{ key: "agents", path: "/agentes", icon: "bot" }] },
];
