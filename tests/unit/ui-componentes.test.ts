import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, DataTable, EmptyState, Icon, Skeleton, StatCard, Tabs, Tooltip } from "@/components/ui";

describe("componentes de interfaz", () => {
  it("Button: type=button por defecto y variantes", () => {
    const m = html(h(Button, { variant: "danger", size: "sm" }, "Borrar"));
    expect(m).toContain('type="button"');
    expect(m).toContain("text-danger");
    expect(html(h(Button, { variant: "ghost" }, "x"))).toContain("bg-transparent");
  });

  it("Badge: cada tono usa color y borde de la misma familia semántica", () => {
    for (const tono of ["success", "warning", "danger", "info", "accent"] as const) {
      expect(html(h(Badge, { tone: tono }, "x"))).toContain(`border-${tono === "accent" ? "primary" : tono}`);
    }
  });

  it("Card: variantes", () => {
    expect(html(h(Card, { variant: "flat" }, "x"))).toContain("bg-surface");
  });

  it("Icon: decorativo (aria-hidden, no enfocable)", () => {
    const m = html(h(Icon, { name: "home" }));
    expect(m).toContain('aria-hidden="true"');
    expect(m).toContain('focusable="false"');
  });

  it("Skeleton: oculto a lectores de pantalla", () => {
    expect(html(h(Skeleton))).toContain('aria-hidden="true"');
  });

  it("EmptyState: título, descripción y acción", () => {
    const m = html(h(EmptyState, { title: "Sin datos", description: "Crea uno", action: h("a", { href: "/x" }, "Crear") }));
    expect(m).toContain("<h3");
    expect(m).toContain("Sin datos");
    expect(m).toContain("Crea uno");
    expect(m).toContain('href="/x"');
  });

  it("StatCard: etiqueta, cifra tabular y nota", () => {
    const m = html(h(StatCard, { label: "Costo", value: "$ 82,50", hint: "del tope", icon: "coins" }));
    expect(m).toContain("Costo");
    expect(m).toContain("tabular");
    expect(m).toContain("$ 82,50");
    expect(m).toContain("del tope");
  });

  it("Tooltip: enlaza aria-describedby con el role=tooltip oculto", () => {
    const m = html(h(Tooltip, { label: "Ayuda", children: h("button", { type: "button" }, "?") }));
    const id = /aria-describedby="([^"]+)"/.exec(m)?.[1];
    expect(id).toBeTruthy();
    expect(m).toContain(`id="${id}"`);
    expect(m).toContain('role="tooltip"');
    expect(m).toMatch(/<span[^>]*role="tooltip"[^>]*hidden|<span[^>]*hidden=""[^>]*role="tooltip"/);
  });

  it("Tabs: roles, selección y tabindex móvil", () => {
    const m = html(
      h(Tabs, {
        label: "Vistas",
        tabs: [
          { id: "a", label: "A", content: "uno" },
          { id: "b", label: "B", content: "dos" },
        ],
      }),
    );
    expect(m).toContain('role="tablist"');
    expect(m).toContain('aria-label="Vistas"');
    expect(m.match(/role="tab"/g)).toHaveLength(2);
    expect(m).toContain('aria-selected="true"');
    expect(m).toContain('tabindex="-1"');
    expect(m.match(/role="tabpanel"/g)).toHaveLength(2);
  });

  describe("DataTable", () => {
    type Fila = { id: string; nombre: string; monto: string };
    const filas: Fila[] = [{ id: "1", nombre: "Rentas", monto: "1.250,00" }];
    const columns = [
      { key: "n", header: "Área", rowHeader: true, render: (f: Fila) => f.nombre },
      { key: "m", header: "Monto", align: "right" as const, render: (f: Fila) => f.monto },
    ];
    const base = { columns, rows: filas, rowKey: (f: Fila) => f.id };

    it("tiene caption, th con scope, fila con th scope=row y cifras a la derecha", () => {
      const m = html(h(DataTable<Fila>, { caption: "Recaudación", ...base }));
      expect(m).toContain("<caption");
      expect(m).toContain("Recaudación");
      expect(m.match(/<th[^>]*scope="col"/g)).toHaveLength(2);
      expect(m).toContain('scope="row"');
      expect(m).toMatch(/<td[^>]*text-right[^>]*>1\.250,00/);
      expect(m).toContain('role="region"');
      expect(m).toContain('tabindex="0"');
    });

    it("densidad compacta reduce el relleno", () => {
      const c = html(h(DataTable<Fila>, { caption: "x", density: "compact", ...base }));
      const g = html(h(DataTable<Fila>, { caption: "x", ...base }));
      expect(c).toContain("py-1.5");
      expect(g).toContain("py-3");
    });

    it("sin filas muestra el texto vacío ocupando todas las columnas", () => {
      const m = html(h(DataTable<Fila>, { caption: "x", ...base, rows: [], emptyText: "Sin registros" }));
      expect(m).toContain("Sin registros");
      expect(m).toContain('colSpan="2"');
    });

    it("caption puede ocultarse visualmente sin quitarlo del árbol", () => {
      const m = html(h(DataTable<Fila>, { caption: "Oculto", hideCaption: true, ...base }));
      expect(m).toMatch(/<caption[^>]*sr-only/);
    });
  });
});
