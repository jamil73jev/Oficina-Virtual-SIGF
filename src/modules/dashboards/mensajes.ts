export const mensajesDashboards = {
  es: {
    titulo: "Costos y Rendimiento de Agentes",
    subtitulo: "Supervisión del consumo de tokens, presupuestos y progreso de tareas de IA.",
    resumenGeneral: "Resumen General",
    gastoTotal: "Gasto Total",
    tokensConsumidos: "Tokens Consumidos",
    tasaAprobacion: "Tasa de Aprobación",
    tasaRechazo: "Tasa de Rechazo",
    tareasCompletadas: "Tareas Completadas",
    tareasTotales: "Total de Tareas",
    alertasPresupuesto: "Alertas de Presupuesto",
    sinAlertas: "Presupuestos bajo control",
    alertasActivas: "Presupuestos en alerta",
    
    // Alertas
    alerta80Titulo: "Aviso de presupuesto (80%)",
    alerta80Detalle: "El consumo ha alcanzado o superado el 80% del límite asignado.",
    alerta100Titulo: "Alerta crítica de presupuesto (100%)",
    alerta100Detalle: "El tope de presupuesto ha sido alcanzado o superado. Las ejecuciones se pausarán.",
    alerta80Badge: "Aviso 80%",
    alerta100Badge: "Crítico 100%",
    estadoNormal: "Normal",

    // Secciones
    seccionAlertas: "Alertas de Presupuesto Activas",
    seccionPorAgente: "Consumo por Agente de IA",
    seccionPorProyecto: "Consumo por Proyecto",
    seccionPresupuestos: "Estado de Presupuestos y Topes",
    seccionTareas: "Distribución de Tareas por Estado",
    seccionAprobaciones: "Métricas de Aprobaciones Humanas",

    // Columnas y tablas
    agente: "Agente",
    proyecto: "Proyecto",
    ambito: "Ámbito",
    periodo: "Periodo",
    tokensEntrada: "Tokens Entrada",
    tokensSalida: "Tokens Salida",
    tokensCache: "Tokens Caché",
    tokensTotal: "Tokens Totales",
    costo: "Costo",
    ejecuciones: "Ejecuciones",
    topeCosto: "Tope Costo",
    topeTokens: "Tope Tokens",
    consumidoCosto: "Costo Consumido",
    consumidoTokens: "Tokens Consumidos",
    porcentajeConsumido: "% Consumido",
    estado: "Estado",
    nivelAlerta: "Nivel de Alerta",

    // Tablas equivalentes WCAG
    tablaEquivalenteAgentes: "Tabla de consumo detallado por agente de IA",
    tablaEquivalenteProyectos: "Tabla de consumo detallado por proyecto",
    tablaEquivalentePresupuestos: "Tabla detallada de presupuestos y topes",
    tablaEquivalenteTareas: "Tabla de tareas agrupadas por estado",
    tablaEquivalenteAprobaciones: "Tabla de métricas de aprobaciones y rechazos",

    // Estados de tareas
    tarea_pendiente: "Pendiente",
    tarea_asignada: "Asignada",
    tarea_en_curso: "En curso",
    tarea_en_verificacion: "En verificación",
    tarea_completada: "Completada",
    tarea_fallida: "Fallida",
    tarea_bloqueada: "Bloqueada",

    // Métricas de aprobaciones
    aprobadas: "Aprobadas",
    rechazadas: "Rechazadas",
    expiradas: "Expiradas",
    pendientes: "Pendientes",
    totalAprobaciones: "Total Solicitudes",
    totalDecididas: "Total Decididas",

    // Descripciones de gráficos accesibles (WCAG)
    graficoAgentesAria: "Gráfico de barras de costo por agente. Los datos equivalentes se encuentran en la tabla contigua.",
    graficoProyectosAria: "Gráfico de barras de costo por proyecto. Los datos equivalentes se encuentran en la tabla contigua.",
    graficoTareasAria: "Gráfico de distribución de tareas por estado. Los datos equivalentes se encuentran en la tabla contigua.",
    graficoPresupuestosAria: "Gráfico de porcentaje de presupuesto consumido. Los datos equivalentes se encuentran en la tabla contigua.",

    // Metadatos
    sinDatos: "No se registran datos para los criterios seleccionados.",
    generadoEl: "Datos actualizados al",
    husoHorario: "Huso horario",
    moneda: "Moneda",
    organizacion: "Organización",
  },
  en: {
    titulo: "Agent Costs & Performance",
    subtitulo: "Monitoring token usage, budgets, and AI task progress.",
    resumenGeneral: "Overview",
    gastoTotal: "Total Cost",
    tokensConsumidos: "Tokens Consumed",
    tasaAprobacion: "Approval Rate",
    tasaRechazo: "Rejection Rate",
    tareasCompletadas: "Completed Tasks",
    tareasTotales: "Total Tasks",
    alertasPresupuesto: "Budget Alerts",
    sinAlertas: "Budgets under control",
    alertasActivas: "Budgets on alert",

    // Alerts
    alerta80Titulo: "Budget warning (80%)",
    alerta80Detalle: "Consumption has reached or exceeded 80% of the allocated limit.",
    alerta100Titulo: "Critical budget alert (100%)",
    alerta100Detalle: "Budget cap has been reached or exceeded. Executions will pause.",
    alerta80Badge: "Warning 80%",
    alerta100Badge: "Critical 100%",
    estadoNormal: "Normal",

    // Sections
    seccionAlertas: "Active Budget Alerts",
    seccionPorAgente: "Usage by AI Agent",
    seccionPorProyecto: "Usage by Project",
    seccionPresupuestos: "Budget Status & Limits",
    seccionTareas: "Task Distribution by Status",
    seccionAprobaciones: "Human Approval Metrics",

    // Columns and tables
    agente: "Agent",
    proyecto: "Project",
    ambito: "Scope",
    periodo: "Period",
    tokensEntrada: "Input Tokens",
    tokensSalida: "Output Tokens",
    tokensCache: "Cache Tokens",
    tokensTotal: "Total Tokens",
    costo: "Cost",
    ejecuciones: "Executions",
    topeCosto: "Cost Cap",
    topeTokens: "Token Cap",
    consumidoCosto: "Consumed Cost",
    consumidoTokens: "Consumed Tokens",
    porcentajeConsumido: "% Consumed",
    estado: "Status",
    nivelAlerta: "Alert Level",

    // WCAG equivalent tables
    tablaEquivalenteAgentes: "Detailed usage table by AI agent",
    tablaEquivalenteProyectos: "Detailed usage table by project",
    tablaEquivalentePresupuestos: "Detailed table of budgets and limits",
    tablaEquivalenteTareas: "Table of tasks grouped by status",
    tablaEquivalenteAprobaciones: "Table of approval and rejection metrics",

    // Task states
    tarea_pendiente: "Pending",
    tarea_asignada: "Assigned",
    tarea_en_curso: "In progress",
    tarea_en_verificacion: "In verification",
    tarea_completada: "Completed",
    tarea_fallida: "Failed",
    tarea_bloqueada: "Blocked",

    // Approval metrics
    aprobadas: "Approved",
    rechazadas: "Rejected",
    expiradas: "Expired",
    pendientes: "Pending",
    totalAprobaciones: "Total Requests",
    totalDecididas: "Total Decided",

    // Accessible chart descriptions (WCAG)
    graficoAgentesAria: "Bar chart of cost by agent. Equivalent data is available in the adjacent table.",
    graficoProyectosAria: "Bar chart of cost by project. Equivalent data is available in the adjacent table.",
    graficoTareasAria: "Task distribution chart by status. Equivalent data is available in the adjacent table.",
    graficoPresupuestosAria: "Chart of percentage of budget consumed. Equivalent data is available in the adjacent table.",

    // Metadata
    sinDatos: "No data recorded for the selected criteria.",
    generadoEl: "Data updated as of",
    husoHorario: "Time zone",
    moneda: "Currency",
    organizacion: "Organization",
  },
} as const;

export type LocaleDashboards = keyof typeof mensajesDashboards;
