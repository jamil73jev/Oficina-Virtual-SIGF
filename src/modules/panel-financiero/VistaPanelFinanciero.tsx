import { Badge, Card, CardTitle } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/core/i18n/format";
import type { Locale } from "@/core/i18n/config";
import type { Corte } from "@/modules/finanzas";
import type { PanelFinanciero } from "./domain";
import type { LocalePanelFinanciero } from "./mensajes";
import { mensajesPanelFinanciero } from "./mensajes";

export interface VistaPanelFinancieroProps {
  panel: PanelFinanciero;
  locale: LocalePanelFinanciero;
}

function formatearCorte(corte: Corte | Corte[], locale: Locale): { fecha: string; fuente: string } {
  const c = Array.isArray(corte) ? corte[0] : corte;
  if (!c) return { fecha: "N/D", fuente: "N/D" };
  const f = formatDate(c.fechaCorte, locale, "America/Guayaquil", {
    dateStyle: "medium",
  });
  return {
    fecha: `${f} ${c.horaExtraccion ?? ""}`.trim(),
    fuente: c.fuente,
  };
}

export function VistaPanelFinanciero({ panel, locale }: VistaPanelFinancieroProps) {
  const t = mensajesPanelFinanciero[locale] ?? mensajesPanelFinanciero.es;
  const loc = locale as Locale;

  // Cortes formateados para cada cálculo
  const corteRec = formatearCorte(panel.recaudacion.corte, loc);
  const corteCart = formatearCorte(panel.saldoCartera.corte, loc);
  const cortePareto = formatearCorte(panel.pareto.corte, loc);
  const corteConc = formatearCorte(panel.conciliacion.corte, loc);
  const corteCalidad = formatearCorte(panel.calidadDatos.corte, loc);
  const corteCruces = formatearCorte(panel.cruceIdentificaciones.corte, loc);

  // Máximos para escalas de gráficos SVG
  const maxSaldoTramo = Math.max(
    ...panel.antiguedadCartera.valor.tramos.map((tr) => tr.saldo),
    1,
  );
  const maxValorPareto = Math.max(...panel.pareto.valor.segmentos.map((s) => s.valor), 1);
  const maxMontoRecaudacion = Math.max(
    panel.recaudacion.valor.bruto,
    panel.recaudacion.valor.neto,
    1,
  );
  const maxMontoConciliacion = Math.max(
    panel.conciliacion.valor.conciliado.valor,
    panel.conciliacion.valor.pendiente.valor,
    1,
  );
  const totalContribuyentes = panel.calidadDatos.valor.totalGeneral || 1;
  const maxParesCruce = panel.cruceIdentificaciones.valor.totalPares || 1;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 pb-16">
      {/* Encabezado Principal */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t.titulo}
          </h1>
          <Badge tone="warning" className="text-xs font-semibold">
            {t.badgeSintetico}
          </Badge>
        </div>
        <p className="text-sm text-muted sm:text-base">{t.subtitulo}</p>
      </header>

      {/* AVISO VISIBLE Y PERMANENTE: DATOS SINTÉTICOS */}
      <aside
        role="alert"
        aria-label={t.avisoSinteticoTitulo}
        className="flex flex-col gap-2 rounded-lg border-2 border-warning bg-warning-soft/25 p-5 text-foreground shadow-xs"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-warning" aria-hidden="true" />
          <h2 className="text-base font-bold text-foreground sm:text-lg">
            {t.avisoSinteticoTitulo}
          </h2>
        </div>
        <p className="text-sm font-medium text-foreground">{t.avisoSinteticoTexto}</p>
      </aside>

      {/* SECCIÓN 1: Tarjetas de KPI */}
      <section aria-labelledby="kpi-heading" className="flex flex-col gap-4">
        <h2 id="kpi-heading" className="text-lg font-bold text-foreground">
          Indicadores Financieros Principales
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* KPI 1: Recaudación Neta */}
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">{t.kpiRecaudacionTitulo}</CardTitle>
                <Badge tone="success">{panel.recaudacion.fuente}</Badge>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-foreground">
                {formatCurrency(panel.recaudacion.valor.neto, loc, "USD")}
              </div>
              <p className="text-xs text-muted">{t.kpiRecaudacionNeto}</p>

              {/* Desglose de recaudación */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-xs">
                <div>
                  <span className="text-muted">{t.kpiRecaudacionBruto}:</span>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(panel.recaudacion.valor.bruto, loc, "USD")}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiRecaudacionNormales}:</span>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(panel.recaudacion.valor.reversosNormales, loc, "USD")}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiRecaudacionExtemporaneos}:</span>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(panel.recaudacion.valor.reversosExtemporaneos, loc, "USD")}
                  </div>
                </div>
              </div>
            </div>

            {/* Metadatos obligatorios */}
            <footer className="rounded border border-subtle bg-surface/50 p-2.5 text-xs text-muted">
              <div>
                <strong className="text-foreground">{t.fuente}:</strong> {corteRec.fuente}
              </div>
              <div>
                <strong className="text-foreground">{t.fechaCorte}:</strong> {corteRec.fecha}
              </div>
              <div>
                <strong className="text-foreground">{t.formula}:</strong>{" "}
                <code className="text-xs">{panel.recaudacion.formula}</code>
              </div>
              <div>
                <strong className="text-foreground">{t.filtros}:</strong>{" "}
                {panel.recaudacion.filtros.join("; ") || t.sinFiltros}
              </div>
            </footer>
          </Card>

          {/* KPI 2: Saldo de Cartera por Título */}
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">{t.kpiCarteraTitulo}</CardTitle>
                <Badge tone="neutral">{panel.saldoCartera.fuente}</Badge>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-foreground">
                {formatCurrency(panel.saldoCartera.valor.totalSaldo, loc, "USD")}
              </div>
              <p className="text-xs text-muted">{t.kpiCarteraTotal}</p>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-xs">
                <div>
                  <span className="text-muted">{t.kpiCarteraTitulos}:</span>
                  <div className="font-semibold text-foreground">
                    {formatNumber(panel.saldoCartera.valor.cantidadTitulos, loc)}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiCarteraConJuicio}:</span>
                  <div className="font-semibold text-foreground">
                    {formatNumber(panel.saldoCartera.valor.titulosConJuicio, loc)}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiCarteraVariosJuicios}:</span>
                  <div className="font-semibold text-foreground">
                    {formatNumber(panel.saldoCartera.valor.titulosConVariosJuicios, loc)}
                  </div>
                </div>
              </div>
            </div>

            <footer className="rounded border border-subtle bg-surface/50 p-2.5 text-xs text-muted">
              <div>
                <strong className="text-foreground">{t.fuente}:</strong> {corteCart.fuente}
              </div>
              <div>
                <strong className="text-foreground">{t.fechaCorte}:</strong> {corteCart.fecha}
              </div>
              <div>
                <strong className="text-foreground">{t.formula}:</strong>{" "}
                <code className="text-xs">{panel.saldoCartera.formula}</code>
              </div>
              <div>
                <strong className="text-foreground">{t.filtros}:</strong>{" "}
                {panel.saldoCartera.filtros.join("; ") || t.sinFiltros}
              </div>
            </footer>
          </Card>

          {/* KPI 3: Concentración Pareto (Top 20%) */}
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">{t.kpiParetoTitulo}</CardTitle>
                <Badge tone="warning">
                  {Math.round(panel.pareto.valor.concentracionTop20 * 100)}%
                </Badge>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-foreground">
                {(panel.pareto.valor.concentracionTop20 * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted">{t.kpiParetoConcentracion}</p>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-subtle pt-3 text-xs">
                <div>
                  <span className="text-muted">{t.kpiParetoTotal}:</span>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(panel.pareto.valor.total, loc, "USD")}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiParetoClaves}:</span>
                  <div className="font-semibold text-foreground">
                    {formatNumber(panel.pareto.valor.cantidadClaves, loc)}
                  </div>
                </div>
              </div>
            </div>

            <footer className="rounded border border-subtle bg-surface/50 p-2.5 text-xs text-muted">
              <div>
                <strong className="text-foreground">{t.fuente}:</strong> {cortePareto.fuente}
              </div>
              <div>
                <strong className="text-foreground">{t.fechaCorte}:</strong> {cortePareto.fecha}
              </div>
              <div>
                <strong className="text-foreground">{t.formula}:</strong>{" "}
                <code className="text-xs">{panel.pareto.formula}</code>
              </div>
              <div>
                <strong className="text-foreground">{t.filtros}:</strong>{" "}
                {panel.pareto.filtros.join("; ") || t.sinFiltros}
              </div>
            </footer>
          </Card>

          {/* KPI 4: Conciliación Bancaria */}
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">{t.kpiConciliacionTitulo}</CardTitle>
                <Badge tone={panel.conciliacion.valor.cuadra ? "success" : "warning"}>
                  {panel.conciliacion.valor.cuadra ? "Cuadrada" : "Descuadre"}
                </Badge>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-foreground">
                {formatCurrency(panel.conciliacion.valor.conciliado.valor, loc, "USD")}
              </div>
              <p className="text-xs text-muted">
                {t.kpiConciliacionConciliado} ({panel.conciliacion.valor.conciliado.cantidad} pares)
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-subtle pt-3 text-xs">
                <div>
                  <span className="text-muted">{t.kpiConciliacionPendiente}:</span>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(panel.conciliacion.valor.pendiente.valor, loc, "USD")} (
                    {panel.conciliacion.valor.pendiente.cantidad})
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiConciliacionTransacciones}:</span>
                  <div className="font-semibold text-foreground">
                    {formatNumber(panel.conciliacion.valor.totalTransacciones, loc)}
                  </div>
                </div>
              </div>
            </div>

            <footer className="rounded border border-subtle bg-surface/50 p-2.5 text-xs text-muted">
              <div>
                <strong className="text-foreground">{t.fuente}:</strong> {corteConc.fuente}
              </div>
              <div>
                <strong className="text-foreground">{t.fechaCorte}:</strong> {corteConc.fecha}
              </div>
              <div>
                <strong className="text-foreground">{t.formula}:</strong>{" "}
                <code className="text-xs">{panel.conciliacion.formula}</code>
              </div>
              <div>
                <strong className="text-foreground">{t.filtros}:</strong>{" "}
                {panel.conciliacion.filtros.join("; ") || t.sinFiltros}
              </div>
            </footer>
          </Card>

          {/* KPI 5: Calidad de Datos */}
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">{t.kpiCalidadTitulo}</CardTitle>
                <Badge tone="neutral">
                  Total: {formatNumber(panel.calidadDatos.valor.totalGeneral, loc)}
                </Badge>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-foreground">
                {formatNumber(panel.calidadDatos.valor.identificaciones.validas.cantidad, loc)}
              </div>
              <p className="text-xs text-muted">{t.kpiCalidadValidas}</p>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-xs">
                <div>
                  <span className="text-muted">{t.kpiCalidadInvalidas}:</span>
                  <div className="font-semibold text-foreground">
                    {panel.calidadDatos.valor.identificaciones.invalidas.cantidad}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiCalidadDuplicadas}:</span>
                  <div className="font-semibold text-foreground">
                    {panel.calidadDatos.valor.identificaciones.duplicadas.contribuyentes}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.sinUbicacionSuficiente}:</span>
                  <div className="font-semibold text-foreground">
                    {panel.calidadDatos.valor.sinUbicacionSuficiente.cantidad}
                  </div>
                </div>
              </div>
            </div>

            <footer className="rounded border border-subtle bg-surface/50 p-2.5 text-xs text-muted">
              <div>
                <strong className="text-foreground">{t.fuente}:</strong> {corteCalidad.fuente}
              </div>
              <div>
                <strong className="text-foreground">{t.fechaCorte}:</strong> {corteCalidad.fecha}
              </div>
              <div>
                <strong className="text-foreground">{t.formula}:</strong>{" "}
                <code className="text-xs">{panel.calidadDatos.formula}</code>
              </div>
              <div>
                <strong className="text-foreground">{t.filtros}:</strong>{" "}
                {panel.calidadDatos.filtros.join("; ") || t.sinFiltros}
              </div>
            </footer>
          </Card>

          {/* KPI 6: Cruce de Identificaciones */}
          <Card className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between">
                <CardTitle as="h3">{t.kpiCrucesTitulo}</CardTitle>
                <Badge tone="neutral">
                  {formatNumber(panel.cruceIdentificaciones.valor.totalPares, loc)} pares
                </Badge>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-foreground">
                {formatNumber(panel.cruceIdentificaciones.valor.conteos.coincidentes, loc)}
              </div>
              <p className="text-xs text-muted">{t.kpiCrucesCoincidentes}</p>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-subtle pt-3 text-xs">
                <div>
                  <span className="text-muted">{t.kpiCrucesDiferentes}:</span>
                  <div className="font-semibold text-foreground">
                    {panel.cruceIdentificaciones.valor.conteos.diferentes}
                  </div>
                </div>
                <div>
                  <span className="text-muted">{t.kpiCrucesNoUtilizables}:</span>
                  <div className="font-semibold text-foreground">
                    {panel.cruceIdentificaciones.valor.conteos.noUtilizables}
                  </div>
                </div>
              </div>
            </div>

            <footer className="rounded border border-subtle bg-surface/50 p-2.5 text-xs text-muted">
              <div>
                <strong className="text-foreground">{t.fuente}:</strong> {corteCruces.fuente}
              </div>
              <div>
                <strong className="text-foreground">{t.fechaCorte}:</strong> {corteCruces.fecha}
              </div>
              <div>
                <strong className="text-foreground">{t.formula}:</strong>{" "}
                <code className="text-xs">{panel.cruceIdentificaciones.formula}</code>
              </div>
              <div>
                <strong className="text-foreground">{t.filtros}:</strong>{" "}
                {panel.cruceIdentificaciones.filtros.join("; ") || t.sinFiltros}
              </div>
            </footer>
          </Card>
        </div>
      </section>

      {/* SECCIÓN 2: Cartera por Antigüedad (Gráfico SVG + Tabla Equivalente) */}
      <section aria-labelledby="antiguedad-heading" className="flex flex-col gap-4">
        <CardTitle as="h2" id="antiguedad-heading">
          {t.seccionCarteraAntiguedad}
        </CardTitle>

        <Card className="flex flex-col gap-6">
          {/* Gráfico SVG */}
          <div className="flex flex-col gap-2">
            <svg
              role="img"
              aria-label={t.graficoCarteraAntiguedadAria}
              viewBox={`0 0 800 ${panel.antiguedadCartera.valor.tramos.length * 48 + 30}`}
              className="h-auto w-full font-sans text-foreground"
            >
              <title>{t.graficoCarteraAntiguedadAria}</title>
              <desc>{t.graficoCarteraAntiguedadAria}</desc>
              {panel.antiguedadCartera.valor.tramos.map((tr, idx) => {
                const barWidth = Math.max(12, Math.round((tr.saldo / maxSaldoTramo) * 450));
                const y = idx * 48 + 10;
                return (
                  <g key={tr.tramo} transform={`translate(0, ${y})`}>
                    <text x="0" y="18" fontSize="12" fontWeight="600" fill="currentColor">
                      {tr.tramo} ({tr.desde}-{tr.hasta ?? "∞"} d)
                    </text>
                    <rect x="180" y="4" width="480" height="20" rx="4" fill="currentColor" opacity="0.1" />
                    <rect x="180" y="4" width={barWidth} height="20" rx="4" fill="currentColor" opacity="0.85" />
                    <text x={190 + barWidth} y="18" fontSize="11" fontWeight="500" fill="currentColor">
                      {formatCurrency(tr.saldo, loc, "USD")} ({(tr.proporcion * 100).toFixed(1)}%)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Tabla equivalente accesible */}
          <div
            className="overflow-x-auto rounded border border-subtle"
            tabIndex={0}
            role="region"
            aria-label={t.tablaCarteraAntiguedad}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.tablaCarteraAntiguedad}</caption>
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                    {t.tramo}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.diasRango}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.titulosCantidad}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.saldoMonto}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.proporcionPorcentaje}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {panel.antiguedadCartera.valor.tramos.map((tr) => (
                  <tr key={tr.tramo} className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">
                      {tr.tramo}
                    </th>
                    <td className="px-4 py-3 text-right text-muted">
                      {tr.desde} - {tr.hasta ?? "más"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatNumber(tr.titulos, loc)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatCurrency(tr.saldo, loc, "USD")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {(tr.proporcion * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {panel.antiguedadCartera.valor.porVencer.titulos > 0 && (
                  <tr className="bg-surface/30">
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">
                      {t.porVencer}
                    </th>
                    <td className="px-4 py-3 text-right text-muted">&lt; 0</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatNumber(panel.antiguedadCartera.valor.porVencer.titulos, loc)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatCurrency(panel.antiguedadCartera.valor.porVencer.saldo, loc, "USD")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* SECCIÓN 3: Concentración Pareto (Gráfico SVG + Tabla Equivalente) */}
      <section aria-labelledby="pareto-heading" className="flex flex-col gap-4">
        <CardTitle as="h2" id="pareto-heading">
          {t.seccionPareto}
        </CardTitle>

        <Card className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <svg
              role="img"
              aria-label={t.graficoParetoAria}
              viewBox={`0 0 800 ${panel.pareto.valor.segmentos.length * 48 + 30}`}
              className="h-auto w-full font-sans text-foreground"
            >
              <title>{t.graficoParetoAria}</title>
              <desc>{t.graficoParetoAria}</desc>
              {panel.pareto.valor.segmentos.map((s, idx) => {
                const barWidth = Math.max(12, Math.round((s.valor / maxValorPareto) * 450));
                const y = idx * 48 + 10;
                return (
                  <g key={s.segmento} transform={`translate(0, ${y})`}>
                    <text x="0" y="18" fontSize="12" fontWeight="600" fill="currentColor">
                      {t[`segmento${s.segmento}` as keyof typeof t] ?? `Segmento ${s.segmento}`}
                    </text>
                    <rect x="220" y="4" width="450" height="20" rx="4" fill="currentColor" opacity="0.1" />
                    <rect x="220" y="4" width={barWidth} height="20" rx="4" fill="currentColor" opacity="0.85" />
                    <text x={230 + barWidth} y="18" fontSize="11" fontWeight="500" fill="currentColor">
                      {formatCurrency(s.valor, loc, "USD")} ({(s.proporcionValor * 100).toFixed(1)}% valor)
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div
            className="overflow-x-auto rounded border border-subtle"
            tabIndex={0}
            role="region"
            aria-label={t.tablaPareto}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.tablaPareto}</caption>
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                    {t.segmento}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.clavesContribuyentes}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.valorTotal}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.proporcionValor}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.proporcionClaves}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {panel.pareto.valor.segmentos.map((s) => (
                  <tr key={s.segmento} className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">
                      {t[`segmento${s.segmento}` as keyof typeof t] ?? `Segmento ${s.segmento}`}
                    </th>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatNumber(s.claves, loc)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatCurrency(s.valor, loc, "USD")}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {(s.proporcionValor * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {(s.proporcionClaves * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* SECCIÓN 4: Recaudación y Conciliación Bancaria */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Recaudación y Reversos */}
        <section aria-labelledby="recaudacion-heading" className="flex flex-col gap-4">
          <CardTitle as="h2" id="recaudacion-heading">
            {t.seccionRecaudacion}
          </CardTitle>
          <Card className="flex flex-col gap-6">
            <svg
              role="img"
              aria-label={t.graficoRecaudacionAria}
              viewBox="0 0 400 160"
              className="h-auto w-full font-sans text-foreground"
            >
              <title>{t.graficoRecaudacionAria}</title>
              <desc>{t.graficoRecaudacionAria}</desc>
              {[
                { label: "Bruto", val: panel.recaudacion.valor.bruto, y: 15 },
                { label: "Rev. Normales", val: panel.recaudacion.valor.reversosNormales, y: 50 },
                { label: "Rev. Extemp.", val: panel.recaudacion.valor.reversosExtemporaneos, y: 85 },
                { label: "Neto", val: panel.recaudacion.valor.neto, y: 120 },
              ].map((item) => {
                const bw = Math.max(8, Math.round((item.val / maxMontoRecaudacion) * 220));
                return (
                  <g key={item.label} transform={`translate(0, ${item.y})`}>
                    <text x="0" y="14" fontSize="11" fontWeight="600" fill="currentColor">
                      {item.label}
                    </text>
                    <rect x="110" y="2" width="220" height="16" rx="3" fill="currentColor" opacity="0.1" />
                    <rect x="110" y="2" width={bw} height="16" rx="3" fill="currentColor" opacity="0.85" />
                    <text x={115 + bw} y="14" fontSize="10" fontWeight="500" fill="currentColor">
                      {formatCurrency(item.val, loc, "USD")}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div
              className="overflow-x-auto rounded border border-subtle"
              tabIndex={0}
              role="region"
              aria-label={t.tablaRecaudacion}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.tablaRecaudacion}</caption>
                <thead className="bg-surface text-muted">
                  <tr>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold">
                      {t.concepto}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.cantidadRegistros}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.montoTotal}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.recaudacionBruta}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.recaudacion.valor.cantidadPagos, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.recaudacion.valor.bruto, loc, "USD")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.reversosNormalesCol}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.recaudacion.valor.cantidadReversosNormales, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.recaudacion.valor.reversosNormales, loc, "USD")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.reversosExtemporaneosCol}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.recaudacion.valor.cantidadReversosExtemporaneos, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.recaudacion.valor.reversosExtemporaneos, loc, "USD")}
                    </td>
                  </tr>
                  <tr className="bg-surface/40">
                    <th scope="row" className="px-3 py-2 font-bold text-foreground">
                      {t.recaudacionNetaCol}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.recaudacion.valor.cantidadPagos, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-extrabold text-foreground">
                      {formatCurrency(panel.recaudacion.valor.neto, loc, "USD")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Conciliación Bancaria */}
        <section aria-labelledby="conciliacion-heading" className="flex flex-col gap-4">
          <CardTitle as="h2" id="conciliacion-heading">
            {t.seccionConciliacion}
          </CardTitle>
          <Card className="flex flex-col gap-6">
            <svg
              role="img"
              aria-label={t.graficoConciliacionAria}
              viewBox="0 0 400 120"
              className="h-auto w-full font-sans text-foreground"
            >
              <title>{t.graficoConciliacionAria}</title>
              <desc>{t.graficoConciliacionAria}</desc>
              {[
                { label: "Conciliado", val: panel.conciliacion.valor.conciliado.valor, y: 25 },
                { label: "Pendiente", val: panel.conciliacion.valor.pendiente.valor, y: 65 },
              ].map((item) => {
                const bw = Math.max(8, Math.round((item.val / maxMontoConciliacion) * 220));
                return (
                  <g key={item.label} transform={`translate(0, ${item.y})`}>
                    <text x="0" y="14" fontSize="11" fontWeight="600" fill="currentColor">
                      {item.label}
                    </text>
                    <rect x="90" y="2" width="220" height="16" rx="3" fill="currentColor" opacity="0.1" />
                    <rect x="90" y="2" width={bw} height="16" rx="3" fill="currentColor" opacity="0.85" />
                    <text x={95 + bw} y="14" fontSize="10" fontWeight="500" fill="currentColor">
                      {formatCurrency(item.val, loc, "USD")}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div
              className="overflow-x-auto rounded border border-subtle"
              tabIndex={0}
              role="region"
              aria-label={t.tablaConciliacion}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.tablaConciliacion}</caption>
                <thead className="bg-surface text-muted">
                  <tr>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold">
                      {t.estadoConciliacion}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.cantidadRegistros}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.montoTotal}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.conciliadoLabel}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.conciliacion.valor.conciliado.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.conciliacion.valor.conciliado.valor, loc, "USD")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.pendienteLabel}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.conciliacion.valor.pendiente.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.conciliacion.valor.pendiente.valor, loc, "USD")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.diferenciasLabel}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.conciliacion.valor.diferencias.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.conciliacion.valor.diferencias.valorNeto, loc, "USD")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.depositosSinTransaccionLabel}
                    </th>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatNumber(panel.conciliacion.valor.depositosSinTransaccion.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatCurrency(panel.conciliacion.valor.depositosSinTransaccion.valor, loc, "USD")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>

      {/* SECCIÓN 5: Calidad de Datos y Cruces de Identificación */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Calidad de Datos */}
        <section aria-labelledby="calidad-heading" className="flex flex-col gap-4">
          <CardTitle as="h2" id="calidad-heading">
            {t.seccionCalidad}
          </CardTitle>
          <Card className="flex flex-col gap-6">
            <div
              className="overflow-x-auto rounded border border-subtle"
              tabIndex={0}
              role="region"
              aria-label={t.tablaCalidad}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.tablaCalidad}</caption>
                <thead className="bg-surface text-muted">
                  <tr>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold">
                      {t.indicadorCalidad}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.cantidadRegistros}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  <tr className="bg-surface/50 font-bold">
                    <th scope="row" className="px-3 py-2 text-foreground">
                      {t.totalContribuyentesSinExclusion}
                    </th>
                    <td className="px-3 py-2 text-right text-foreground">
                      {formatNumber(panel.calidadDatos.valor.totalGeneral, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">100%</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.identificacionesValidas}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.calidadDatos.valor.identificaciones.validas.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.calidadDatos.valor.identificaciones.validas.cantidad / totalContribuyentes) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.identificacionesInvalidas}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.calidadDatos.valor.identificaciones.invalidas.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.calidadDatos.valor.identificaciones.invalidas.cantidad / totalContribuyentes) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.identificacionesDuplicadas}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(
                        panel.calidadDatos.valor.identificaciones.duplicadas.contribuyentes,
                        loc,
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.calidadDatos.valor.identificaciones.duplicadas.contribuyentes /
                          totalContribuyentes) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.sinParroquia}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.calidadDatos.valor.sinParroquia.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.calidadDatos.valor.sinParroquia.cantidad / totalContribuyentes) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.sinSector}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.calidadDatos.valor.sinSector.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.calidadDatos.valor.sinSector.cantidad / totalContribuyentes) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.sinUbicacionSuficiente}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.calidadDatos.valor.sinUbicacionSuficiente.cantidad, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.calidadDatos.valor.sinUbicacionSuficiente.cantidad / totalContribuyentes) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Cruce de Identificaciones */}
        <section aria-labelledby="cruces-heading" className="flex flex-col gap-4">
          <CardTitle as="h2" id="cruces-heading">
            {t.seccionCruces}
          </CardTitle>
          <Card className="flex flex-col gap-6">
            <svg
              role="img"
              aria-label={t.graficoCrucesAria}
              viewBox="0 0 400 130"
              className="h-auto w-full font-sans text-foreground"
            >
              <title>{t.graficoCrucesAria}</title>
              <desc>{t.graficoCrucesAria}</desc>
              {[
                { label: "Coincidentes", val: panel.cruceIdentificaciones.valor.conteos.coincidentes, y: 15 },
                { label: "Diferentes", val: panel.cruceIdentificaciones.valor.conteos.diferentes, y: 55 },
                { label: "No Utilizables", val: panel.cruceIdentificaciones.valor.conteos.noUtilizables, y: 95 },
              ].map((item) => {
                const bw = Math.max(8, Math.round((item.val / maxParesCruce) * 200));
                return (
                  <g key={item.label} transform={`translate(0, ${item.y})`}>
                    <text x="0" y="14" fontSize="11" fontWeight="600" fill="currentColor">
                      {item.label}
                    </text>
                    <rect x="110" y="2" width="200" height="16" rx="3" fill="currentColor" opacity="0.1" />
                    <rect x="110" y="2" width={bw} height="16" rx="3" fill="currentColor" opacity="0.85" />
                    <text x={115 + bw} y="14" fontSize="10" fontWeight="500" fill="currentColor">
                      {formatNumber(item.val, loc)}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div
              className="overflow-x-auto rounded border border-subtle"
              tabIndex={0}
              role="region"
              aria-label={t.tablaCruces}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.tablaCruces}</caption>
                <thead className="bg-surface text-muted">
                  <tr>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold">
                      {t.categoriaCruce}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.paresJuicio}
                    </th>
                    <th scope="col" className="border-b border-subtle px-3 py-2 font-semibold text-right">
                      {t.porcentajePares}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.coincidenteLabel}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.cruceIdentificaciones.valor.conteos.coincidentes, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.cruceIdentificaciones.valor.conteos.coincidentes / maxParesCruce) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.diferenteLabel}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.cruceIdentificaciones.valor.conteos.diferentes, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.cruceIdentificaciones.valor.conteos.diferentes / maxParesCruce) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-2 font-medium text-foreground">
                      {t.noUtilizableLabel}
                    </th>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {formatNumber(panel.cruceIdentificaciones.valor.conteos.noUtilizables, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {(
                        (panel.cruceIdentificaciones.valor.conteos.noUtilizables / maxParesCruce) *
                        100
                      ).toFixed(1)}
                      %
                    </td>
                  </tr>
                  <tr className="bg-surface/50 font-bold">
                    <th scope="row" className="px-3 py-2 text-foreground">
                      {t.kpiCrucesTotal}
                    </th>
                    <td className="px-3 py-2 text-right text-foreground">
                      {formatNumber(panel.cruceIdentificaciones.valor.totalPares, loc)}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
