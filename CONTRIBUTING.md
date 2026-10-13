# Guía para contribuir

Este repositorio es privado y no tiene licencia de código abierto (ver [`AVISO.md`](AVISO.md)). Esta guía describe cómo trabajar en él con orden.

## Preparar el entorno

Requiere Node.js 22.

```bash
npm ci
npm run dev
```

Sin variables de entorno, la aplicación usa memoria, autenticación de desarrollo, datos sintéticos y un modelo simulado. Para conectar Supabase o un modelo, copie `.env.example` a `.env.local` y siga [`docs/despliegue.md`](docs/despliegue.md). **Nunca** suba `.env.local` ni valores reales (ver [`SEGURIDAD.md`](SEGURIDAD.md)).

## Antes de proponer un cambio

Next.js 16 y AI SDK 7 tienen cambios respecto de versiones anteriores. Lea la guía correspondiente en `node_modules/next/dist/docs/` antes de escribir código de Next.

Ejecute y pase todo esto:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Si el cambio toca la interfaz, ejecute también `npm run audit:a11y` y `npm run audit:perf`. La verificación automática de GitHub repite todo en cada cambio.

## Ramas y commits

- `main` debe estar siempre en verde.
- Trabaje en una rama con nombre descriptivo (`agentes/arqueo-caja`, `docs/despliegue`).
- Mensajes de commit en español, en tiempo presente o pasado simple, con una primera línea corta que diga qué cambia. Si hace falta, explique el porqué en el cuerpo.
- Un commit, una idea. Los cambios de formato o de saltos de línea van aparte.

## Reglas del código

- TypeScript estricto. Los contratos entre capas se definen con Zod en `src/types` y `src/orchestration/traza/eventos.ts`; no se cambian sin acordarlo.
- La dependencia va hacia abajo: interfaz → módulos → orquestación → núcleo. El núcleo no conoce a los agentes ([`docs/estructura.md`](docs/estructura.md)).
- **Toda cifra la calcula una herramienta de código.** El modelo solo comenta ([decisión 0001](docs/decisiones/0001-cifras-calculadas-por-herramientas.md)). Una herramienta nueva necesita su prueba y su regla documentada en [`docs/agentes-area.md`](docs/agentes-area.md).
- Las acciones irreversibles requieren aprobación humana ([decisión 0006](docs/decisiones/0006-aprobacion-humana-para-acciones-irreversibles.md)).
- Los textos de interfaz van en `messages/` en español e inglés.
- Datos de prueba: solo ficticios. No use identificaciones, nombres ni montos reales, ni siquiera disfrazados.

## Pruebas

| Carpeta | Qué prueba |
|---|---|
| `tests/unit` | Lógica pura, contratos, interfaz |
| `tests/integration` | PostgreSQL con PGlite: RLS, migraciones, retención |
| `tests/e2e` | Operaciones y agentes de punta a punta con el modelo simulado |

Un error corregido debe dejar una prueba que habría fallado antes.

## Documentación

- Si un cambio altera una decisión, cree una nueva en [`docs/decisiones/`](docs/decisiones/README.md) y marque la anterior como reemplazada.
- Si cambia la estructura, actualice los diagramas de [`docs/estructura.md`](docs/estructura.md).
- Anote los cambios visibles en [`CHANGELOG.md`](CHANGELOG.md), bajo «Sin publicar».
