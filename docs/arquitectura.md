# Arquitectura: Oficina Virtual para agentes de IA

Los agentes de IA son los trabajadores; los humanos fijan objetivos, aprueban y supervisan.
Stack: Next.js (App Router) + TypeScript estricto + PostgreSQL (Drizzle, RLS por `org_id`) en Vercel.
Antes de codificar con Next, leer `node_modules/next/dist/docs/` (la API cambia). Verificar versiones de AI SDK, AI Gateway y Workflow antes de fijar dependencias.

## Esquema de datos (todo con `org_id`)
- organizacion(id, nombre, huso, moneda, locale)
- usuario(id, email, mfa); membresia(usuario_id, org_id, rol: owner|admin|supervisor|viewer)
- agente(id, org_id, rol, skills[], herramientas_permitidas[], modelo, presupuesto_id, estado, prompt_version)
- proyecto(id, org_id, objetivo, estado, presupuesto_id, owner_id)
- tarea(id, proyecto_id, padre_id, agente_id, estado, criterios_verificacion, deps[])
- documento(id, proyecto_id, tarea_id, blob_url, hash, version, tipo): artefactos por referencia, no por transcripción
- mensaje(id, proyecto_id, hilo, autor_tipo: humano|agente, autor_id, contenido)
- ejecucion(id, tarea_id, agente_id, padre_ejecucion_id, workflow_run_id, modelo, tokens_in/out/cache, costo, estado, resumen): árbol orquestador → subagentes
- aprobacion(id, ejecucion_id, tipo, payload, riesgo, estado, decidido_por, decidido_en, expira_en)
- auditoria(id, org_id, actor, accion, entidad, antes/despues, hash_prev): append-only, encadenada por hash
- presupuesto(id, ambito: org|proyecto|agente, tope_tokens, tope_costo, tope_iteraciones, consumido, periodo)
- presencia: efímera (Redis/Realtime), no en Postgres

## Runtime de agentes
Decisión: AI SDK + AI Gateway + Workflow durable, detrás de la interfaz `AgentRuntime` (permite cambiar de runtime).
- Gateway: multi-modelo, fallbacks, presupuestos por clave (modelo pequeño para rutina, grande para planificar).
- Workflow durable: pausa/reanudación sin costo en aprobaciones humanas.
- eve (beta): reevaluar tras la etapa 3. Claude Agent SDK: solo para agentes desarrolladores dentro de Vercel Sandbox.

## Flujo
1. El humano crea proyecto y objetivo; se abre un workflow durable por proyecto.
2. El orquestador (modelo grande, salida estructurada) crea tareas con criterios de verificación y las asigna.
3. Cada subagente corre en una `ejecucion` con contexto aislado; recibe la tarea y referencias, devuelve resumen + artefacto por referencia.
4. Guard de presupuesto antes de cada llamada (reserva atómica `UPDATE ... WHERE consumido+est <= tope`) en ámbitos agente, proyecto y org; tope de iteraciones y profundidad. 80 % avisa; 100 % pausa y genera aprobación de ampliación.
5. Herramientas clasificadas por riesgo (lectura, escritura reversible, irreversible/costosa). Riesgo alto crea `aprobacion`, suspende el workflow, expira a rechazo; todo a `auditoria`.
6. QA con verificación ejecutable (pruebas, fuentes), no otro LLM; reintento acotado y luego escalado al humano.
7. Salidas de herramientas son datos no confiables (prompt injection); mínimo privilegio; sandbox para código.

## Estructura
```
src/app/[locale]/(auth)/ · (oficina)/proyectos/[id]/{tablero,documentos,chat,costos}
src/app/api/{approvals,webhooks,workflow}/
src/core/{auth,rbac,i18n,audit,budget,db,config}
src/modules/{proyectos,tiempo-real,documentos,dashboards,agentes}/{domain,actions,ui}
src/orchestration/{runtime,workflows,orchestrator,subagents,skills,tools,guards,evals}
src/components/ui · src/lib · src/types (contratos Zod)
tests/{unit,e2e} · .github/workflows/ci.yml
```

## Orden
- Etapa 0 (secuencial): contratos Zod, esquema Drizzle, CI (lint, tsc, vitest, Lighthouse, axe).
- Etapa 1: auth+MFA → RBAC/RLS → auditoría → presupuesto; i18n y diseño en paralelo; luego registro de agentes.
- Etapa 2 (paralelo): proyectos/tareas, tiempo real y presencia, documentos (Blob), dashboards y costos.
- Etapa 3: AgentRuntime + guard, herramientas y riesgo, aprobaciones (backend y UI), orquestador y subagentes, skills y evals.
- Etapa 4: e2e, Lighthouse, axe, revisión de seguridad.
Ruta crítica: esquema → auth/RBAC → presupuesto → runtime+guard → aprobaciones → orquestador.
