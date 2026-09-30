// Lighthouse (movil) sobre las rutas clave. Requiere servidor en AUDIT_BASE_URL (npm start).
// Con AUDIT_DETALLE=1 imprime que elemento define el LCP y donde se va el tiempo.
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const base = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const paths = (process.env.AUDIT_RUTAS ?? "/es,/en,/es/aprobaciones").split(",");
const MIN = 95;
const detalle = process.env.AUDIT_DETALLE === "1";
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
    // SEO no cuenta para aprobar: la aplicacion es privada y sus paginas llevan noindex A PROPOSITO.
    // Ademas, sin sesion las rutas redirigen al login (tambien noindex), que es lo que se mide aqui.
    const ok = Object.entries(s).every(([k, v]) => k === "seo" || v >= MIN) && lcp < 2500 && cls < 0.1 && tbt < 200;
    if (!ok) failed = true;
    console.log(`${ok ? "OK  " : "FAIL"} ${p}`, JSON.stringify(s), `LCP=${Math.round(lcp)}ms CLS=${cls.toFixed(3)} TBT=${Math.round(tbt)}ms`);
    if (detalle) {
      const el = a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node;
      console.log(`   elemento LCP: ${el?.nodeLabel?.slice(0, 70) ?? "?"} | ${el?.selector ?? ""}`);
      const fcp = a["first-contentful-paint"].numericValue;
      const ttfb = a["server-response-time"]?.numericValue;
      console.log(`   FCP=${Math.round(fcp)}ms  TTFB(servidor)=${Math.round(ttfb ?? 0)}ms`);
      const insight = a["lcp-breakdown-insight"]?.details?.items?.[0]?.items;
      if (Array.isArray(insight)) console.log("   desglose LCP:", insight.map((i) => `${i.label ?? i.subpart}=${Math.round(i.duration ?? i.timing ?? 0)}ms`).join(", "));
      const reqs = a["network-requests"]?.details?.items ?? [];
      const js = reqs.filter((r) => r.resourceType === "Script");
      const css = reqs.filter((r) => r.resourceType === "Stylesheet");
      const font = reqs.filter((r) => r.resourceType === "Font");
      const kb = (l) => Math.round(l.reduce((t, r) => t + (r.transferSize ?? 0), 0) / 1024);
      console.log(`   recursos: ${js.length} JS (${kb(js)} KB), ${css.length} CSS (${kb(css)} KB), ${font.length} fuentes (${kb(font)} KB), ${reqs.length} peticiones`);
      const unused = a["unused-javascript"]?.details?.overallSavingsBytes;
      const boot = a["bootup-time"]?.numericValue;
      console.log(`   JS sin usar: ${Math.round((unused ?? 0) / 1024)} KB | tiempo de arranque JS: ${Math.round(boot ?? 0)}ms`);
      const cand = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.details?.type === "opportunity").map((x) => `${x.id}(${Math.round(x.numericValue ?? 0)}ms)`);
      if (cand.length) console.log(`   oportunidades: ${cand.slice(0, 6).join(", ")}`);
    }
  }
} finally {
  try { await chrome.kill(); } catch {} // Windows: EPERM al borrar el perfil temporal
}
process.exit(failed ? 1 : 0);
