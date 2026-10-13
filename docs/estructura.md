# Estructura y flujo de la Oficina Virtual

Este documento muestra cómo está organizado el código y cómo viaja una operación por la Sala de operaciones. Complementa a [`arquitectura.md`](arquitectura.md), que explica las decisiones, y a [`agentes-area.md`](agentes-area.md), que define cada agente.

## Vista por capas

```mermaid
flowchart TB
    subgraph UI["Interfaz  ·  src/app y src/components"]
        direction LR
        U1[Sala de operaciones]
        U2[Agentes]
        U3[Aprobaciones]
        U4[Costos]
        U5[Documentos y proyectos]
    end

    subgraph MOD["Módulos de negocio  ·  src/modules"]
        direction LR
        M1[operaciones<br/>plan, servicio, traza]
        M2[agentes-area<br/>catálogo y herramientas]
        M3[finanzas-*<br/>rentas, contable, pagos, dirección]
        M4[aprobaciones · documentos<br/>dashboards · proyectos]
    end

    subgraph ORQ["Orquestación  ·  src/orchestration"]
        direction LR
        O1[runtime<br/>modelo simulado, nube, local]
        O2[guards<br/>presupuesto y QA]
        O3[skills<br/>instrucciones por agente]
        O4[traza<br/>eventos con secuencia]
    end

    subgraph CORE["Núcleo  ·  src/core"]
        direction LR
        C1[auth + MFA]
        C2[rbac]
        C3[audit<br/>cadena HMAC]
        C4[budget]
        C5[db<br/>Drizzle + RLS]
    end

    UI --> MOD --> ORQ --> CORE
    CORE --> PG[(PostgreSQL<br/>Supabase)]
```

La dependencia va siempre hacia abajo: la interfaz llama a los módulos, los módulos usan la orquestación y todos se apoyan en el núcleo. El núcleo no conoce a los agentes.

## Árbol del repositorio

```text
oficina-virtual/
├── src/
│   ├── app/                         rutas y APIs (Next.js App Router)
│   │   ├── [locale]/
│   │   │   ├── login/ · seguridad/  acceso, MFA, sin acceso
│   │   │   └── (oficina)/           operaciones · agentes · aprobaciones
│   │   │                            costos · documentos · proyectos · finanzas
│   │   └── api/                     operaciones · agents · approvals · projects
│   │                                documents · dashboards · mantenimiento · salud
│   ├── core/                        auth · rbac · audit · budget · db · i18n · datos
│   ├── modules/
│   │   ├── agentes-area/            catálogo de 12 agentes y sus herramientas
│   │   ├── operaciones/             plan, servicio y fábrica de la operación
│   │   ├── operaciones-ui/          estado visible de cada agente y del grafo
│   │   ├── finanzas-{rentas,contable,pagos,direccion}/   cálculos por área
│   │   └── aprobaciones · documentos · dashboards · proyectos · mantenimiento
│   ├── orchestration/
│   │   ├── runtime/                 modelo simulado, nube (Gateway, Google) y Ollama
│   │   ├── guards/                  presupuesto y control de calidad (QA)
│   │   ├── skills/                  una instrucción en Markdown por agente
│   │   └── traza/                   EventoTraza: contrato entre servicio e interfaz
│   └── components/                  componentes de interfaz
├── tests/                           unit · integration (PGlite) · e2e
├── scripts/                         migrar · alta-organizacion · audit-a11y · audit-perf
├── docs/                            arquitectura · agentes · autenticación · despliegue …
├── messages/                        textos es / en
└── .github/workflows/ci.yml         lint, tipos, pruebas, build, a11y y rendimiento
```

## Recorrido de una operación

```mermaid
sequenceDiagram
    autonumber
    actor P as Persona
    participant S as Sala de operaciones
    participant O as Orquestador
    participant A as Agente de área
    participant H as Herramientas
    participant G as Guard de presupuesto
    participant Q as QA de cifras
    participant T as Traza y auditoría

    P->>S: Encarga una operación
    S->>O: Pide un plan
    O-->>S: Pasos, agentes y orden (el Director cierra)
    S->>T: operacion_creada, plan_creado
    loop Cada paso del plan
        S->>G: Reserva presupuesto
        G-->>S: Autorizado (o pausa: estado «esperando»)
        S->>A: Encargo con contexto del traspaso
        A->>H: Calcula con herramientas permitidas
        H-->>A: Tablas con fuente, fórmula y corte
        A->>Q: Comentario del modelo
        Q-->>A: Cifras verificadas o marcadas
        A->>T: herramienta, tabla, comentario, traspaso
    end
    S->>T: entregable, operacion_finalizada
    T-->>P: Línea de tiempo en vivo (SSE, con sondeo de respaldo)
    P->>S: Aprueba o rechaza acciones de riesgo
```

## Estados de un agente

```mermaid
stateDiagram-v2
    [*] --> inactivo
    inactivo --> trabajando: agente_inicia
    trabajando --> completado: entregable
    trabajando --> degradado: entregable sin comentario del modelo
    trabajando --> esperando: presupuesto pausado
    trabajando --> sin_datos: la fuente no devuelve filas
    trabajando --> error: falla de herramienta o modelo
    esperando --> trabajando: se amplía el presupuesto
    completado --> [*]
    degradado --> [*]
    sin_datos --> [*]
    error --> [*]
```

## Equipo de 12 agentes

```mermaid
flowchart LR
    DIR[Director]:::dir --> PLA[Planificación]:::dir
    DIR --> CON[Contador]:::fin
    DIR --> PRE[Presupuestista]:::fin
    DIR --> TES[Tesorero]:::fin
    DIR --> PAG[Pagador]:::fin
    DIR --> CAJ[Cajero mayor]:::fin
    DIR --> REN[Rentas]:::ren
    DIR --> COA[Coactiva]:::ren
    DIR --> CAR[Cartera]:::ren
    DIR --> CTL[Control y Estadística]:::dat
    DIR --> DAT[Datos]:::dat
    classDef dir fill:#1f3a5f,color:#fff,stroke:#1f3a5f
    classDef fin fill:#2f6f5e,color:#fff,stroke:#2f6f5e
    classDef ren fill:#8a5a1f,color:#fff,stroke:#8a5a1f
    classDef dat fill:#5b4b8a,color:#fff,stroke:#5b4b8a
```

El Director consolida el entregable al final de toda cadena. Los demás agentes se traspasan el trabajo entre sí según el plan; las reglas de cada uno están en [`agentes-area.md`](agentes-area.md).

## Vista previa interactiva

[`vista-previa/oficina-virtual.html`](vista-previa/oficina-virtual.html) es una página autónoma, sin dependencias, que simula una operación con **datos ficticios**: se puede elegir un encargo, ver los traspasos entre agentes, los estados y la traza. Solo ilustra el flujo; no ejecuta el sistema.
