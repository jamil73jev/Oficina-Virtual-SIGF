# Persistencia en Supabase PostgreSQL

## Modelo de datos

El esquema se define en `src/core/db/schema.ts`. `organizacion`, `usuario` y `membresia` forman la identidad de negocio; cada membresía une un usuario con una organización y un rol. Proyectos, tareas, agentes y ejecuciones forman el árbol de trabajo. Presupuestos y solicitudes de ampliación controlan consumo; aprobaciones protegen acciones de riesgo; documentos, versiones, mensajes y artefactos conservan entregables. `operacion` es la cabecera de una ejecución de la sala, `evento_traza` su secuencia append-only y `auditoria` la cadena HMAC de cambios sensibles.

Las migraciones generadas están en `src/core/db/migrations`; las reglas manuales, permisos, RLS e inmutabilidad están en `src/core/db/sql`. Ejecute `npm run db:migrar`; el script las aplica en ese orden y registra cada ruta en `_oficina_migraciones`. `npm run db:migrar -- --simular` solo muestra el orden y no abre la base.

## Conexiones y roles

La aplicación usa `DATABASE_URL` con el Transaction pooler de Supabase, puerto `6543`. `postgres-js` se configura con `prepare: false`, necesario porque el pooler en modo transacción no conserva sentencias preparadas entre transacciones. Mantenga `DB_MAX_CONEXIONES=3` o menos por instancia serverless.

Las migraciones requieren una conexión con privilegios de propietario. Use `DATABASE_URL_DIRECT` para el puerto directo `5432`; si la red solo ofrece IPv4, defina `DATABASE_URL_MIGRACIONES` con el Session pooler y el script la preferirá. Nunca use estas conexiones privilegiadas como `DATABASE_URL` de la aplicación.

La cuenta propietaria crea un rol sin login llamado `app_rw`. Cada operación de negocio usa una transacción con `SET LOCAL ROLE app_rw` y `set_config('app.org_id', ..., true)`. Las políticas RLS comparan `org_id` con `app.org_id`; la organización procede de la membresía autenticada, no de parámetros del cliente. `anon` y `authenticated` no conservan privilegios sobre el esquema público, y las versiones documentales y la auditoría son inmutables para la aplicación.

## Eventos, sondeo y retención

Cada `operacion` mantiene `ultima_secuencia`. Al anexar un evento se incrementa dentro de la transacción y se inserta `evento_traza` con la pareja única `(operacion_id, secuencia)`, de modo que el cliente puede sondear eventos posteriores a la última secuencia recibida sin perder el orden. El sondeo debe usar intervalos moderados, retroceso ante errores y detenerse cuando la operación llegue a un estado terminal.

La traza se conserva 30 días. La purga se ejecuta como propietario de mantenimiento, nunca como `app_rw`, porque la aplicación no tiene `DELETE`. La auditoría HMAC no forma parte de esa purga y permanece append-only.

## Plan gratuito y copias

Supabase Free ofrece como referencia 500 MB de base de datos y 5 GB de salida. Un proyecto puede pausarse tras una semana sin actividad y el plan no incluye copias de seguridad administradas; compruebe siempre los límites vigentes en el panel antes de producción.

Realice exportaciones periódicas desde un entorno seguro con una URL privilegiada que no quede en el historial:

```powershell
pg_dump --format=custom --no-owner --file oficina.dump "postgresql://postgres:[TU-CONTRASENA]@[HOST]:5432/postgres"
```

En automatización, entregue la contraseña mediante el almacén de secretos del ejecutor y valide regularmente una restauración. No suba archivos de copia, cadenas de conexión ni salidas de `pg_dump` al repositorio.
