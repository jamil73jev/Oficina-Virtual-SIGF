// axe-core (WCAG 2.2 AA) con Playwright. Requiere servidor en AUDIT_BASE_URL (npm start).
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
];
const browser = await chromium.launch({ channel: process.env.AUDIT_CHANNEL ?? "chrome" });
let failed = false;
try {
  for (const p of paths) {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${base}${p}`, { waitUntil: "networkidle" });
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    if (bad.length) failed = true;
    console.log(`${bad.length ? "FAIL" : "OK  "} ${p} (${violations.length} violaciones, ${bad.length} serias/criticas)`);
    for (const v of violations) console.log(`  [${v.impact}] ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
