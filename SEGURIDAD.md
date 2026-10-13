# Seguridad: qué nunca se sube a este repositorio

1. **Datos reales:** información de contribuyentes, proveedores o de la institución (identificaciones, nombres, direcciones, deudas, pagos, órdenes de pago). Aplica a CSV, Excel, JSON y respaldos de bases de datos (`*.dump`, salidas de `pg_dump`). Las pruebas y la simulación usan solo datos ficticios.
2. **Claves y credenciales:** contraseñas, cadenas de conexión con usuario y clave (`DATABASE_URL*`), `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AUDIT_HMAC_KEY`, secretos TOTP y tokens OIDC. Se leen de variables de entorno.
3. **Configuración local:** `.env`, `.env.local` y la carpeta `.vercel/`. Solo se versiona `.env.example`, con marcadores.
4. **Correos y datos personales reales** en documentación, pruebas o ejemplos. Use marcadores como `usuario@ejemplo.ec`.
5. **Archivos de trabajo con instrucciones internas** (`.tareas/`, registros `.codex-*.log`).

## Reglas de datos

- Los modelos de nube (Vercel AI Gateway y Google AI Studio) reciben **solo datos sintéticos**. El modo de datos real exige un modelo local y ejecución fuera de Vercel. Ver [`docs/decisiones/0002-datos-reales-solo-con-modelo-local.md`](docs/decisiones/0002-datos-reales-solo-con-modelo-local.md).
- Las salidas de herramientas y los documentos se tratan como datos no confiables, nunca como instrucciones.
- La clave `SUPABASE_SERVICE_ROLE_KEY` solo se usa desde `scripts/alta-organizacion.mjs`; no debe llegar al navegador, a cookies ni a registros.

## Si una clave o dato se subió por error

1. Cambiar o rotar la clave de inmediato, aunque el repositorio sea privado.
2. Quitar el archivo del historial de git; no basta con borrarlo en un commit nuevo.
3. Si eran datos personales o reservados, avisar a la jefatura y a seguridad de la información.

## Cómo reportar un problema de seguridad

Avise directamente a la persona autora (ver [`AVISO.md`](AVISO.md)) y no publique el detalle en incidencias, mensajes ni capturas.

## Controles que ya existen

- Inicio de sesión con Supabase Auth, lista de correos permitidos y MFA TOTP obligatorio ([`docs/autenticacion.md`](docs/autenticacion.md)).
- Aislamiento por organización con RLS ([`docs/persistencia.md`](docs/persistencia.md)).
- Auditoría append-only encadenada con HMAC.
- Política de seguridad de contenido y cabeceras estrictas.
- Verificación automática en cada cambio: lint, tipos, pruebas, compilación y auditorías de accesibilidad y rendimiento.
