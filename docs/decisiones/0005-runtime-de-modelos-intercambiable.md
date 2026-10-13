# 0005. Runtime de modelos detrás de una interfaz

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
Los modelos, sus precios y sus cuotas cambian con rapidez, y el sistema debe funcionar en planes gratuitos, con Ollama local y sin ningún modelo.

## Decisión
Los agentes hablan con una interfaz `AgentRuntime`. Las implementaciones son el modelo simulado determinista, AI SDK con Vercel AI Gateway (`gateway:`), Gemini directo con Google AI Studio (`google:`) y Ollama local. No hay modelo por defecto: sin `MODELO`, se usa el simulado. El respaldo al simulado ante agotamiento de cuota es explícito (`MODELO_RESPALDO=simulado`); sin él, el error es tipado y no hay caída silenciosa.

## Consecuencias
- Cambiar de proveedor no toca la lógica de agentes ni de operaciones.
- Las pruebas corren con el modelo simulado, sin red ni claves.
- Un guard de presupuesto reserva tokens y costo antes de cada llamada.
- Hay que mantener las implementaciones sincronizadas con el contrato de `AgentRuntime`.
