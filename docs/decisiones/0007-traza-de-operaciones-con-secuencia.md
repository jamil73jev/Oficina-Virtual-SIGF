# 0007. Traza de operaciones con secuencia por operación

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
La Sala de operaciones muestra en vivo cómo los agentes se traspasan el trabajo. La conexión puede cortarse y el entorno serverless no mantiene estado entre solicitudes.

## Decisión
Cada paso se publica como un `EventoTraza` con número de secuencia creciente y contiguo por operación, guardado en `evento_traza` con la pareja única `(operacion_id, secuencia)`. La interfaz consume los eventos por SSE y, si la conexión falla, sondea los eventos posteriores a la última secuencia recibida, con retroceso ante errores. El contrato vive en `src/orchestration/traza/eventos.ts`.

## Consecuencias
- Reconectar no pierde ni duplica eventos: se continúa desde la última secuencia.
- Funciona sin canales persistentes ni infraestructura adicional.
- La traza se conserva 30 días; el contrato no se cambia sin acordarlo, porque la lógica y la interfaz se construyen contra él.
