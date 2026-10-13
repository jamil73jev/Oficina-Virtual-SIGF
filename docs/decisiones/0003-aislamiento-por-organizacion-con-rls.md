# 0003. Aislamiento por organización con RLS y un rol sin login

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
El sistema es multiorganización. Un error de filtrado en una consulta no debe poder mostrar datos de otra organización.

## Decisión
Todas las tablas de negocio llevan `org_id`. Cada operación usa una transacción con `SET LOCAL ROLE app_rw` y `set_config('app.org_id', …)`, y las políticas RLS de PostgreSQL comparan `org_id` con ese valor. La organización sale de la membresía del usuario autenticado, nunca de parámetros del cliente. `anon` y `authenticated` no conservan privilegios sobre el esquema público.

## Consecuencias
- El aislamiento lo garantiza la base de datos, no solo el código de la aplicación.
- `app_rw` no tiene `DELETE`: la retención y la purga las hace un rol de mantenimiento.
- Las migraciones requieren una conexión propietaria, que nunca se usa como `DATABASE_URL` de la aplicación.
- Las pruebas de integración con PGlite verifican las políticas.

Detalles en [`persistencia.md`](../persistencia.md).
