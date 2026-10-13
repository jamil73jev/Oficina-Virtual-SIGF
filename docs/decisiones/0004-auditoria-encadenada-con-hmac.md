# 0004. Auditoría append-only encadenada con HMAC

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
Las acciones sensibles (aprobaciones, cambios de membresía, ampliaciones de presupuesto) deben poder reconstruirse y no deben poder alterarse sin dejar rastro.

## Decisión
La tabla `auditoria` es append-only para la aplicación y cada registro incluye el hash del anterior (`hash_prev`) firmado con HMAC. La clave (`AUDIT_HMAC_KEY`) es un secreto de entorno.

## Consecuencias
- Borrar o modificar un registro intermedio rompe la cadena y se detecta con `verificarCadena`.
- La purga de la traza a los 30 días no alcanza a la auditoría.
