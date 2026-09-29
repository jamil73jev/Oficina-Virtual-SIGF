// Lighthouse (movil) sobre las rutas clave. Requiere servidor en AUDIT_BASE_URL (npm start).
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const base = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const paths = ["/es", "/en", "/es/aprobaciones"];
const MIN = 95;
const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
let failed = false;
try {
  for (const p of paths) {
    const { lhr } = await lighthouse(`${base}${p}`, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
    const s = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
    const a = lhr.audits;
    const lcp = a["largest-contentful-paint"].numericValue;
    const cls = a["cumulative-layout-shift"].numericValue;
    const tbt = a["total-blocking-time"].numericValue;
    const ok = Object.values(s).every((v) => v >= MIN) && lcp < 2500 && cls < 0.1 && tbt < 200;
    if (!ok) failed = true;
    console.log(`${ok ? "OK  " : "FAIL"} ${p}`, JSON.stringify(s), `LCP=${Math.round(lcp)}ms CLS=${cls.toFixed(3)} TBT=${Math.round(tbt)}ms`);
  }
} finally {
  try { await chrome.kill(); } catch {} // Windows: EPERM al borrar el perfil temporal
}
process.exit(failed ? 1 : 0);
