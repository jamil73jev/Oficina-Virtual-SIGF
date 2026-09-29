export const mensajesPanelFinanciero = {
  es: {
    // Encabezado
    titulo: "Panel Financiero Municipal",
    subtitulo: "Visualización integral de recaudación, cartera, conciliación bancaria y calidad de datos.",
    avisoSinteticoTitulo: "Aviso importante: Datos Sintéticos",
    avisoSinteticoTexto:
      "Todos los datos de este panel son sintéticos y deterministas. Están diseñados para evaluación visual y técnica del analista financiero antes de la carga de información real.",
    badgeSintetico: "Entorno de Prueba / Datos Sintéticos",

    // Metadatos de tarjetas
    fuente: "Fuente",
    formula: "Fórmula",
    filtros: "Filtros",
    fechaCorte: "Fecha de corte",
    periodo: "Periodo",
    horaExtraccion: "Hora de extracción",
    sinFiltros: "Sin filtros adicionales",

    // Tarjetas de KPI
    kpiRecaudacionTitulo: "Recaudación Neta",
    kpiRecaudacionBruto: "Recaudación Bruta",
    kpiRecaudacionNormales: "Reversos Normales",
    kpiRecaudacionExtemporaneos: "Reversos Extemporáneos",
    kpiRecaudacionNeto: "Total Recaudado Neto",
    kpiRecaudacionPagos: "Pagos Procesados",

    kpiCarteraTitulo: "Saldo de Cartera por Título",
    kpiCarteraTotal: "Saldo Total de Cartera",
    kpiCarteraTitulos: "Títulos Únicos",
    kpiCarteraConJuicio: "Títulos con Juicio",
    kpiCarteraVariosJuicios: "Con Varios Juicios",

    kpiParetoTitulo: "Concentración Pareto (Top 20%)",
    kpiParetoConcentracion: "Deuda en 20% Contribuyentes",
    kpiParetoTotal: "Deuda Concentrada Total",
    kpiParetoClaves: "Contribuyentes Analizados",

    kpiConciliacionTitulo: "Conciliación Bancaria",
    kpiConciliacionConciliado: "Monto Conciliado",
    kpiConciliacionPendiente: "Pendiente de Depósito",
    kpiConciliacionPares: "Pares Conciliados",
    kpiConciliacionTransacciones: "Transacciones Totales",

    kpiCalidadTitulo: "Calidad de Datos (Contribuyentes)",
    kpiCalidadTotal: "Total General (Sin exclusiones)",
    kpiCalidadValidas: "Identificaciones Válidas",
    kpiCalidadInvalidas: "Identificaciones Inválidas",
    kpiCalidadDuplicadas: "Identificaciones Duplicadas",

    kpiCrucesTitulo: "Cruce Títulos vs Juicios",
    kpiCrucesTotal: "Total Pares Evaluados",
    kpiCrucesCoincidentes: "Identificación Coincidente",
    kpiCrucesDiferentes: "Identificación Diferente",
    kpiCrucesNoUtilizables: "No Utilizables / Incompletas",

    // Secciones y Tablas Equivalentes (WCAG 2.2 AA)
    seccionCarteraAntiguedad: "Composición de Cartera por Antigüedad",
    tablaCarteraAntiguedad: "Tabla de saldo de cartera agrupado por tramos de vencimiento",
    graficoCarteraAntiguedadAria:
      "Gráfico de barras que representa el saldo de cartera por tramos de antigüedad. Los datos equivalentes se detallan en la tabla contigua.",
    tramo: "Tramo de Días",
    diasRango: "Días Vencidos",
    titulosCantidad: "Cantidad de Títulos",
    saldoMonto: "Saldo Cartera",
    proporcionPorcentaje: "Proporción (%)",
    porVencer: "Por Vencer (Días < 0)",

    seccionPareto: "Segmentación ABC de Contribuyentes (Pareto)",
    tablaPareto: "Tabla de segmentación ABC de concentración de deuda por contribuyente",
    graficoParetoAria:
      "Gráfico de distribución Pareto de la cartera. Los valores exactos se muestran en la tabla equivalente.",
    segmento: "Segmento",
    descripcionSegmento: "Descripción",
    segmentoA: "Segmento A (Mayor concentración)",
    segmentoB: "Segmento B (Concentración media)",
    segmentoC: "Segmento C (Larga cola)",
    clavesContribuyentes: "Contribuyentes",
    valorTotal: "Valor Total",
    proporcionValor: "% del Valor",
    proporcionClaves: "% de Contribuyentes",

    seccionRecaudacion: "Detalle de Recaudación y Reversos",
    tablaRecaudacion: "Tabla con desglose de recaudación bruta, reversos normales, extemporáneos y neta",
    graficoRecaudacionAria:
      "Gráfico de barras comparando recaudación bruta, reversos y recaudación neta. Los datos exactos se encuentran en la tabla contigua.",
    concepto: "Concepto",
    recaudacionBruta: "Recaudación Bruta",
    reversosNormalesCol: "Reversos Normales (Descontados)",
    reversosExtemporaneosCol: "Reversos Extemporáneos (Informativos)",
    recaudacionNetaCol: "Recaudación Neta Final",

    seccionConciliacion: "Detalle de Conciliación Bancaria",
    tablaConciliacion: "Tabla detallada de conciliación bancaria entre pagos y extractos de depósito",
    graficoConciliacionAria:
      "Gráfico de conciliación bancaria entre montos conciliados y pendientes. Consulte la tabla equivalente contigua.",
    estadoConciliacion: "Estado de Conciliación",
    conciliadoLabel: "Conciliado (Con depósito identificado)",
    pendienteLabel: "Pendiente (Sin depósito bancario)",
    diferenciasLabel: "Con Diferencias de Valor",
    depositosSinTransaccionLabel: "Depósitos Bancarios sin Transacción",
    cantidadRegistros: "Cantidad",
    montoTotal: "Monto ($)",

    seccionCalidad: "Indicadores de Calidad de Datos de Contribuyentes",
    tablaCalidad: "Tabla de calidad de datos catastrales y de identificación de contribuyentes",
    graficoCalidadAria:
      "Gráfico de barras de indicadores de calidad de datos. Los registros totales se detallan sin exclusión en la tabla contigua.",
    indicadorCalidad: "Indicador de Calidad",
    totalContribuyentesSinExclusion: "Total General de Contribuyentes (Base Completa)",
    identificacionesValidas: "Identificaciones con formato y dígito verificador válidos",
    identificacionesInvalidas: "Identificaciones con formato o dígito verificador inválidos",
    identificacionesDuplicadas: "Identificaciones duplicadas en múltiples contribuyentes",
    sinParroquia: "Registros sin parroquia asignada",
    sinSector: "Registros sin sector asignado",
    sinUbicacionSuficiente: "Registros sin ubicación geográfica suficiente (lat/long)",

    seccionCruces: "Cruce de Identificaciones: Título vs Juicio Coactivo",
    tablaCruces: "Tabla de cruce y concordancia de cédula/RUC entre título de crédito y juicio coactivo",
    graficoCrucesAria:
      "Gráfico del cruce de identificaciones entre títulos y juicios. Valores equivalentes en la tabla contigua.",
    categoriaCruce: "Categoría de Concordancia",
    coincidenteLabel: "Coincidente (Misma identificación válida en título y juicio)",
    diferenteLabel: "Diferente (Identificación en juicio difiere de la del título)",
    noUtilizableLabel: "No Utilizable (Faltante, incompleta o con longitud inválida)",
    paresJuicio: "Pares Evaluados",
    porcentajePares: "% de Pares",
  },
  en: {
    // Header
    titulo: "Municipal Financial Dashboard",
    subtitulo: "Comprehensive view of revenue, receivables, bank reconciliation, and data quality.",
    avisoSinteticoTitulo: "Important Notice: Synthetic Data",
    avisoSinteticoTexto:
      "All data in this dashboard is synthetic and deterministic. It is designed for visual and technical evaluation by the financial analyst prior to uploading actual records.",
    badgeSintetico: "Testing Environment / Synthetic Data",

    // Card metadata
    fuente: "Source",
    formula: "Formula",
    filtros: "Filters",
    fechaCorte: "Cut-off date",
    periodo: "Period",
    horaExtraccion: "Extraction time",
    sinFiltros: "No additional filters",

    // KPI Cards
    kpiRecaudacionTitulo: "Net Collection",
    kpiRecaudacionBruto: "Gross Collection",
    kpiRecaudacionNormales: "Standard Reversals",
    kpiRecaudacionExtemporaneos: "Extemporaneous Reversals",
    kpiRecaudacionNeto: "Total Net Collection",
    kpiRecaudacionPagos: "Processed Payments",

    kpiCarteraTitulo: "Portfolio Balance by Title",
    kpiCarteraTotal: "Total Portfolio Balance",
    kpiCarteraTitulos: "Unique Titles",
    kpiCarteraConJuicio: "Titles with Lawsuit",
    kpiCarteraVariosJuicios: "With Multiple Lawsuits",

    kpiParetoTitulo: "Pareto Concentration (Top 20%)",
    kpiParetoConcentracion: "Debt in Top 20% Taxpayers",
    kpiParetoTotal: "Total Concentrated Debt",
    kpiParetoClaves: "Taxpayers Analyzed",

    kpiConciliacionTitulo: "Bank Reconciliation",
    kpiConciliacionConciliado: "Reconciled Amount",
    kpiConciliacionPendiente: "Pending Deposit",
    kpiConciliacionPares: "Reconciled Pairs",
    kpiConciliacionTransacciones: "Total Transactions",

    kpiCalidadTitulo: "Data Quality (Taxpayers)",
    kpiCalidadTotal: "Grand Total (No exclusions)",
    kpiCalidadValidas: "Valid Identifications",
    kpiCalidadInvalidas: "Invalid Identifications",
    kpiCalidadDuplicadas: "Duplicate Identifications",

    kpiCrucesTitulo: "Titles vs Lawsuits Cross-Check",
    kpiCrucesTotal: "Total Pairs Evaluated",
    kpiCrucesCoincidentes: "Matching Identification",
    kpiCrucesDiferentes: "Different Identification",
    kpiCrucesNoUtilizables: "Unusable / Incomplete",

    // Sections and Equivalent Tables (WCAG 2.2 AA)
    seccionCarteraAntiguedad: "Portfolio Aging Breakdown",
    tablaCarteraAntiguedad: "Table of portfolio balance grouped by maturity brackets",
    graficoCarteraAntiguedadAria:
      "Bar chart representing portfolio balance by aging brackets. Equivalent data is detailed in the adjacent table.",
    tramo: "Days Bracket",
    diasRango: "Overdue Days",
    titulosCantidad: "Number of Titles",
    saldoMonto: "Portfolio Balance",
    proporcionPorcentaje: "Proportion (%)",
    porVencer: "Not Yet Due (Days < 0)",

    seccionPareto: "Taxpayer ABC Segmentation (Pareto)",
    tablaPareto: "Table of ABC segmentation of debt concentration by taxpayer",
    graficoParetoAria:
      "Chart of Pareto portfolio distribution. Exact values are shown in the equivalent table.",
    segmento: "Segment",
    descripcionSegmento: "Description",
    segmentoA: "Segment A (Highest concentration)",
    segmentoB: "Segment B (Medium concentration)",
    segmentoC: "Segment C (Long tail)",
    clavesContribuyentes: "Taxpayers",
    valorTotal: "Total Value",
    proporcionValor: "% of Value",
    proporcionClaves: "% of Taxpayers",

    seccionRecaudacion: "Collection and Reversals Breakdown",
    tablaRecaudacion: "Table with gross collection, standard reversals, extemporaneous reversals, and net",
    graficoRecaudacionAria:
      "Bar chart comparing gross collection, reversals, and net collection. Exact data is in the adjacent table.",
    concepto: "Concept",
    recaudacionBruta: "Gross Collection",
    reversosNormalesCol: "Standard Reversals (Deducted)",
    reversosExtemporaneosCol: "Extemporaneous Reversals (Informational)",
    recaudacionNetaCol: "Final Net Collection",

    seccionConciliacion: "Bank Reconciliation Breakdown",
    tablaConciliacion: "Detailed table of bank reconciliation between payments and bank deposit statements",
    graficoConciliacionAria:
      "Bank reconciliation chart between reconciled and pending amounts. Refer to the adjacent equivalent table.",
    estadoConciliacion: "Reconciliation Status",
    conciliadoLabel: "Reconciled (Deposit identified)",
    pendienteLabel: "Pending (No bank deposit)",
    diferenciasLabel: "With Value Discrepancies",
    depositosSinTransaccionLabel: "Bank Deposits without Transaction",
    cantidadRegistros: "Count",
    montoTotal: "Amount ($)",

    seccionCalidad: "Taxpayer Data Quality Indicators",
    tablaCalidad: "Table of taxpayer registry and identification quality metrics",
    graficoCalidadAria:
      "Bar chart of data quality indicators. Total records are detailed without exclusions in the adjacent table.",
    indicadorCalidad: "Quality Indicator",
    totalContribuyentesSinExclusion: "Grand Total of Taxpayers (Full Base)",
    identificacionesValidas: "Identifications with valid format and check digit",
    identificacionesInvalidas: "Identifications with invalid format or check digit",
    identificacionesDuplicadas: "Duplicate identifications across multiple taxpayers",
    sinParroquia: "Records with missing parish",
    sinSector: "Records with missing sector",
    sinUbicacionSuficiente: "Records with insufficient geographic location (lat/long)",

    seccionCruces: "Identification Cross-Check: Title vs Lawsuit",
    tablaCruces: "Table of cross-matching between title ID and lawsuit defendant ID",
    graficoCrucesAria:
      "Chart of ID cross-check between titles and lawsuits. Equivalent values in the adjacent table.",
    categoriaCruce: "Match Category",
    coincidenteLabel: "Matching (Same valid ID in title and lawsuit)",
    diferenteLabel: "Different (Lawsuit ID differs from title ID)",
    noUtilizableLabel: "Unusable (Missing, incomplete, or invalid length)",
    paresJuicio: "Evaluated Pairs",
    porcentajePares: "% of Pairs",
  },
} as const;

export type LocalePanelFinanciero = keyof typeof mensajesPanelFinanciero;
