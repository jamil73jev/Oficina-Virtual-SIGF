// axe-core (WCAG 2.2 AA) con Playwright, en tema claro y oscuro. Requiere servidor en AUDIT_BASE_URL (npm start).
import { chromium } from "playwright-core";
import { AxeBuilder } from "@axe-core/playwright";

const base = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const paths = [
  "/es",
  "/en",
  "/es/aprobaciones",
  "/en/aprobaciones",
  "/es/proyectos",
  "/en/proyectos",
  "/es/documentos",
  "/en/documentos",
  "/es/costos",
  "/en/costos",
  "/es/finanzas",
  "/en/finanzas",
  "/es/agentes",
  "/en/agentes",
  "/es/operaciones",
  "/en/operaciones",
  "/es/login",
  "/en/login",
  // Sin sesion, las rutas protegidas de MFA redirigen al login; axe audita el destino final.
  "/es/seguridad/mfa",
  "/en/seguridad/mfa",
];
// Clave de src/components/theme/tema.ts (CLAVE_TEMA): el script previo al pintado lee light o dark.
const CLAVE_TEMA = "ov-theme";
const temas = (process.env.AUDIT_TEMAS ?? "light,dark").split(",");
const browser = await chromium.launch({ channel: process.env.AUDIT_CHANNEL ?? "chrome" });
let failed = false;
try {
  for (const tema of temas) {
    for (const p of paths) {
      const context = await browser.newContext({ colorScheme: tema === "dark" ? "dark" : "light" });
      await context.addInitScript(([clave, valor]) => {
        try {
          localStorage.setItem(clave, valor);
        } catch {}
      }, [CLAVE_TEMA, tema]);
      const page = await context.newPage();
      await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
      const aplicado = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const bad = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      const tema_ok = aplicado === tema;
      if (bad.length || !tema_ok) failed = true;
      console.log(
        `${bad.length || !tema_ok ? "FAIL" : "OK  "} [${tema}] ${p} (${violations.length} violaciones, ${bad.length} serias/criticas${tema_ok ? "" : `, data-theme=${aplicado}`})`,
      );
      for (const v of violations) console.log(`  [${v.impact}] ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
