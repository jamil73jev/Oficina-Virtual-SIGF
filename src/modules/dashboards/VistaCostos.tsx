import { Badge, Card, CardTitle } from "@/components/ui";
import type { ResumenDashboard } from "./domain";
import type { LocaleDashboards } from "./mensajes";
import { mensajesDashboards } from "./mensajes";

export interface VistaCostosProps {
  datos: ResumenDashboard;
  locale: LocaleDashboards;
}

export function VistaCostos({ datos, locale }: VistaCostosProps) {
  const t = mensajesDashboards[locale] ?? mensajesDashboards.es;

  // Cálculos para gráficos SVG de agentes
  const maxCostoAgente = Math.max(...datos.porAgente.map((a) => a.costo), 1);
  const maxCostoProyecto = Math.max(...datos.porProyecto.map((p) => p.costo), 1);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 pb-12">
      {/* Encabezado Principal */}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t.titulo}
        </h1>
        <p className="text-sm text-muted sm:text-base">{t.subtitulo}</p>
        <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
          <span>
            <strong className="font-semibold text-foreground">{t.organizacion}:</strong>{" "}
            {datos.organizacion.nombre}
          </span>
          <span>
            <strong className="font-semibold text-foreground">{t.moneda}:</strong>{" "}
            {datos.organizacion.moneda}
          </span>
          <span>
            <strong className="font-semibold text-foreground">{t.husoHorario}:</strong>{" "}
            {datos.organizacion.huso}
          </span>
          <span>
            <strong className="font-semibold text-foreground">{t.generadoEl}:</strong>{" "}
            <time dateTime={datos.generadoEn}>{datos.generadoEnFormateado}</time>
          </span>
        </div>
      </header>

      {/* Sección 1: Tarjetas de KPI */}
      <section aria-labelledby="kpi-heading" className="flex flex-col gap-4">
        <h2 id="kpi-heading" className="sr-only">
          {t.resumenGeneral}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* KPI: Gasto Total */}
          <Card className="flex flex-col justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              {t.gastoTotal}
            </span>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {datos.consumoOrg.costoFormateado}
            </div>
            <span className="mt-1 text-xs text-muted">
              {datos.consumoOrg.ejecucionesCount} {t.ejecuciones}
            </span>
          </Card>

          {/* KPI: Tokens Consumidos */}
          <Card className="flex flex-col justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              {t.tokensConsumidos}
            </span>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {datos.consumoOrg.tokens.formateado}
            </div>
            <span className="mt-1 text-xs text-muted">
              {t.tokensCache}: {datos.consumoOrg.tokens.tokensCache.toLocaleString()}
            </span>
          </Card>

          {/* KPI: Tasa de Aprobación */}
          <Card className="flex flex-col justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              {t.tasaAprobacion}
            </span>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {datos.aprobaciones.porcentajeAprobacion}%
            </div>
            <span className="mt-1 text-xs text-muted">
              {datos.aprobaciones.aprobadas} / {datos.aprobaciones.totalDecididas} {t.totalDecididas}
            </span>
          </Card>

          {/* KPI: Tareas Completadas */}
          <Card className="flex flex-col justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              {t.tareasCompletadas}
            </span>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {datos.tareasPorEstado.completada}
            </div>
            <span className="mt-1 text-xs text-muted">
              {t.tareasTotales}: {datos.tareasPorEstado.total}
            </span>
          </Card>

          {/* KPI: Estado de Alertas */}
          <Card className="flex flex-col justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              {t.alertasPresupuesto}
            </span>
            <div className="mt-2 flex items-center gap-2">
              {datos.alertas.tieneAlerta100 ? (
                <Badge tone="warning" className="text-sm font-bold">
                  {t.alerta100Badge}
                </Badge>
              ) : datos.alertas.tieneAlerta80 ? (
                <Badge tone="warning" className="text-sm font-semibold">
                  {t.alerta80Badge}
                </Badge>
              ) : (
                <Badge tone="success" className="text-sm font-semibold">
                  {t.estadoNormal}
                </Badge>
              )}
            </div>
            <span className="mt-1 text-xs text-muted">
              {datos.alertas.tieneAlerta100 || datos.alertas.tieneAlerta80
                ? `${datos.alertas.alertas100.length + datos.alertas.alertas80.length} ${t.alertasActivas}`
                : t.sinAlertas}
            </span>
          </Card>
        </div>
      </section>

      {/* Sección 2: Alertas Activas de Presupuesto (80% y 100%) */}
      {(datos.alertas.tieneAlerta100 || datos.alertas.tieneAlerta80) && (
        <section
          aria-labelledby="alertas-heading"
          className="flex flex-col gap-4 rounded-lg border border-warning bg-warning-soft/20 p-5"
        >
          <div className="flex items-center gap-3">
            <h2 id="alertas-heading" className="text-lg font-bold text-foreground">
              {t.seccionAlertas}
            </h2>
            <Badge tone="warning">
              {datos.alertas.alertas100.length + datos.alertas.alertas80.length}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {datos.alertas.alertas100.map((alerta) => (
              <Card key={alerta.id} className="border-warning bg-raised">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{t.alerta100Titulo}</h3>
                    <p className="mt-1 text-xs text-muted">{t.alerta100Detalle}</p>
                  </div>
                  <Badge tone="warning">{t.alerta100Badge}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>
                    <strong className="text-foreground">{t.ambito}:</strong> {alerta.ambito}
                  </span>
                  <span>
                    <strong className="text-foreground">{t.consumidoCosto}:</strong>{" "}
                    {alerta.consumidoCostoFormateado} / {alerta.topeCostoFormateado} (
                    {alerta.porcentajeCosto}%)
                  </span>
                </div>
              </Card>
            ))}

            {datos.alertas.alertas80.map((alerta) => (
              <Card key={alerta.id} className="border-subtle bg-raised">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{t.alerta80Titulo}</h3>
                    <p className="mt-1 text-xs text-muted">{t.alerta80Detalle}</p>
                  </div>
                  <Badge tone="warning">{t.alerta80Badge}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>
                    <strong className="text-foreground">{t.ambito}:</strong> {alerta.ambito}
                  </span>
                  <span>
                    <strong className="text-foreground">{t.consumidoCosto}:</strong>{" "}
                    {alerta.consumidoCostoFormateado} / {alerta.topeCostoFormateado} (
                    {alerta.porcentajeCosto}%)
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Sección 3: Consumo por Agente (Gráfico SVG + Tabla Equivalente) */}
      <section aria-labelledby="agentes-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <CardTitle as="h2" id="agentes-heading">
            {t.seccionPorAgente}
          </CardTitle>
          <span className="text-xs text-muted">{datos.porAgente.length} {t.agente.toLowerCase()}s</span>
        </div>

        <Card className="flex flex-col gap-6">
          {/* Gráfico SVG accesible */}
          {datos.porAgente.length > 0 ? (
            <div className="flex flex-col gap-2">
              <svg
                role="img"
                aria-label={t.graficoAgentesAria}
                viewBox={`0 0 800 ${datos.porAgente.length * 48 + 30}`}
                className="w-full h-auto text-foreground font-sans"
              >
                <title>{t.graficoAgentesAria}</title>
                <desc>{t.graficoAgentesAria}</desc>
                {datos.porAgente.map((agente, idx) => {
                  const barWidth = Math.max(12, Math.round((agente.costo / maxCostoAgente) * 500));
                  const y = idx * 48 + 10;
                  return (
                    <g key={agente.agenteId} transform={`translate(0, ${y})`}>
                      <text
                        x="0"
                        y="18"
                        fontSize="12"
                        fontWeight="600"
                        fill="currentColor"
                        className="truncate"
                      >
                        {agente.modelo ? `${agente.agenteId} (${agente.modelo})` : agente.agenteId}
                      </text>
                      <rect
                        x="220"
                        y="4"
                        width="520"
                        height="20"
                        rx="4"
                        fill="currentColor"
                        opacity="0.1"
                      />
                      <rect
                        x="220"
                        y="4"
                        width={barWidth}
                        height="20"
                        rx="4"
                        fill="currentColor"
                        opacity="0.85"
                      />
                      <text
                        x={230 + barWidth}
                        y="18"
                        fontSize="11"
                        fontWeight="500"
                        fill="currentColor"
                      >
                        {agente.costoFormateado} ({agente.tokens.formateado} tokens)
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <p className="text-sm text-muted">{t.sinDatos}</p>
          )}

          {/* Tabla equivalente accesible WCAG */}
          <div
            className="overflow-x-auto rounded border border-subtle"
            tabIndex={0}
            role="region"
            aria-label={t.tablaEquivalenteAgentes}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.tablaEquivalenteAgentes}</caption>
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                    {t.agente}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.tokensEntrada}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.tokensSalida}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.tokensCache}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.tokensTotal}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.costo}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.ejecuciones}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {datos.porAgente.map((agente) => (
                  <tr key={agente.agenteId} className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">
                      {agente.agenteId}
                      {agente.modelo && (
                        <span className="block text-xs font-normal text-muted">{agente.modelo}</span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-right text-muted">
                      {agente.tokens.tokensIn.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {agente.tokens.tokensOut.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {agente.tokens.tokensCache.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {agente.tokens.total.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {agente.costoFormateado}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {agente.ejecucionesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Sección 4: Consumo por Proyecto (Gráfico SVG + Tabla Equivalente) */}
      <section aria-labelledby="proyectos-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <CardTitle as="h2" id="proyectos-heading">
            {t.seccionPorProyecto}
          </CardTitle>
          <span className="text-xs text-muted">{datos.porProyecto.length} {t.proyecto.toLowerCase()}s</span>
        </div>

        <Card className="flex flex-col gap-6">
          {datos.porProyecto.length > 0 ? (
            <div className="flex flex-col gap-2">
              <svg
                role="img"
                aria-label={t.graficoProyectosAria}
                viewBox={`0 0 800 ${datos.porProyecto.length * 48 + 30}`}
                className="w-full h-auto text-foreground font-sans"
              >
                <title>{t.graficoProyectosAria}</title>
                <desc>{t.graficoProyectosAria}</desc>
                {datos.porProyecto.map((proyecto, idx) => {
                  const barWidth = Math.max(
                    12,
                    Math.round((proyecto.costo / maxCostoProyecto) * 500),
                  );
                  const y = idx * 48 + 10;
                  return (
                    <g key={proyecto.proyectoId} transform={`translate(0, ${y})`}>
                      <text
                        x="0"
                        y="18"
                        fontSize="12"
                        fontWeight="600"
                        fill="currentColor"
                        className="truncate"
                      >
                        {proyecto.proyectoId}
                      </text>
                      <rect
                        x="220"
                        y="4"
                        width="520"
                        height="20"
                        rx="4"
                        fill="currentColor"
                        opacity="0.1"
                      />
                      <rect
                        x="220"
                        y="4"
                        width={barWidth}
                        height="20"
                        rx="4"
                        fill="currentColor"
                        opacity="0.85"
                      />
                      <text
                        x={230 + barWidth}
                        y="18"
                        fontSize="11"
                        fontWeight="500"
                        fill="currentColor"
                      >
                        {proyecto.costoFormateado} ({proyecto.tokens.formateado} tokens)
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <p className="text-sm text-muted">{t.sinDatos}</p>
          )}

          <div
            className="overflow-x-auto rounded border border-subtle"
            tabIndex={0}
            role="region"
            aria-label={t.tablaEquivalenteProyectos}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.tablaEquivalenteProyectos}</caption>
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                    {t.proyecto}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.tokensTotal}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.costo}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.ejecuciones}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {datos.porProyecto.map((proyecto) => (
                  <tr key={proyecto.proyectoId} className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">
                      {proyecto.proyectoId}
                    </th>
                    <td className="px-4 py-3 text-right text-muted">
                      {proyecto.tokens.total.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {proyecto.costoFormateado}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {proyecto.ejecucionesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Sección 5: Presupuestos y Topes */}
      <section aria-labelledby="presupuestos-heading" className="flex flex-col gap-4">
        <CardTitle as="h2" id="presupuestos-heading">
          {t.seccionPresupuestos}
        </CardTitle>

        <Card className="flex flex-col gap-6">
          <div
            className="overflow-x-auto rounded border border-subtle"
            tabIndex={0}
            role="region"
            aria-label={t.tablaEquivalentePresupuestos}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.tablaEquivalentePresupuestos}</caption>
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                    {t.ambito}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                    {t.periodo}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.topeCosto}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.consumidoCosto}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                    {t.porcentajeConsumido}
                  </th>
                  <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-center">
                    {t.nivelAlerta}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {datos.presupuestos.map((presupuesto) => (
                  <tr key={presupuesto.id} className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-3 font-medium text-foreground">
                      <span className="capitalize">{presupuesto.ambito}</span>
                      <span className="block text-xs font-normal text-muted">{presupuesto.refId}</span>
                    </th>
                    <td className="px-4 py-3 text-muted">{presupuesto.periodo}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {presupuesto.topeCostoFormateado}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {presupuesto.consumidoCostoFormateado}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {presupuesto.porcentajeMaximo}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {presupuesto.nivelAlerta === "alerta_100" ? (
                        <Badge tone="warning">{t.alerta100Badge}</Badge>
                      ) : presupuesto.nivelAlerta === "alerta_80" ? (
                        <Badge tone="warning">{t.alerta80Badge}</Badge>
                      ) : (
                        <Badge tone="success">{t.estadoNormal}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Sección 6: Tareas por Estado y Aprobaciones */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Tareas por Estado */}
        <section aria-labelledby="tareas-heading" className="flex flex-col gap-4">
          <CardTitle as="h2" id="tareas-heading">
            {t.seccionTareas}
          </CardTitle>
          <Card className="flex flex-col gap-4">
            <div
              className="overflow-x-auto rounded border border-subtle"
              tabIndex={0}
              role="region"
              aria-label={t.tablaEquivalenteTareas}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.tablaEquivalenteTareas}</caption>
                <thead className="bg-surface text-muted">
                  <tr>
                    <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                      {t.estado}
                    </th>
                    <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                      {t.tareasTotales}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {(
                    [
                      "pendiente",
                      "asignada",
                      "en_curso",
                      "en_verificacion",
                      "completada",
                      "fallida",
                      "bloqueada",
                    ] as const
                  ).map((st) => (
                    <tr key={st} className="hover:bg-surface/50">
                      <th scope="row" className="px-4 py-2.5 font-medium text-foreground">
                        {t[`tarea_${st}` as keyof typeof t] ?? st}
                      </th>
                      <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                        {datos.tareasPorEstado[st]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Aprobaciones Humanas */}
        <section aria-labelledby="aprobaciones-heading" className="flex flex-col gap-4">
          <CardTitle as="h2" id="aprobaciones-heading">
            {t.seccionAprobaciones}
          </CardTitle>
          <Card className="flex flex-col gap-4">
            <div
              className="overflow-x-auto rounded border border-subtle"
              tabIndex={0}
              role="region"
              aria-label={t.tablaEquivalenteAprobaciones}
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">{t.tablaEquivalenteAprobaciones}</caption>
                <thead className="bg-surface text-muted">
                  <tr>
                    <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold">
                      Métrica
                    </th>
                    <th scope="col" className="border-b border-subtle px-4 py-3 font-semibold text-right">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  <tr className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-2.5 font-medium text-foreground">
                      {t.aprobadas}
                    </th>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                      {datos.aprobaciones.aprobadas}
                    </td>
                  </tr>
                  <tr className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-2.5 font-medium text-foreground">
                      {t.rechazadas}
                    </th>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                      {datos.aprobaciones.rechazadas}
                    </td>
                  </tr>
                  <tr className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-2.5 font-medium text-foreground">
                      {t.expiradas}
                    </th>
                    <td className="px-4 py-2.5 text-right text-muted">
                      {datos.aprobaciones.expiradas}
                    </td>
                  </tr>
                  <tr className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-2.5 font-medium text-foreground">
                      {t.pendientes}
                    </th>
                    <td className="px-4 py-2.5 text-right text-muted">
                      {datos.aprobaciones.pendientes}
                    </td>
                  </tr>
                  <tr className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-2.5 font-semibold text-foreground">
                      {t.tasaAprobacion}
                    </th>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground">
                      {datos.aprobaciones.porcentajeAprobacion}%
                    </td>
                  </tr>
                  <tr className="hover:bg-surface/50">
                    <th scope="row" className="px-4 py-2.5 font-semibold text-foreground">
                      {t.tasaRechazo}
                    </th>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground">
                      {datos.aprobaciones.porcentajeRechazo}%
                    </td>
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
