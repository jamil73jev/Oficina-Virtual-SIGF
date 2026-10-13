# Historial de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

## [0.1.0] - 2026-10-13

Primera versión publicada del repositorio: agentes de área, modelo local, sala de operaciones, persistencia en Postgres con login y MFA, y despliegue en Vercel con Supabase.

### Agregado
- Estados `esperando` (pausa por presupuesto) y `degradado` (sin comentario del modelo) en la sala de operaciones.
- Indicador `falloModelo` en comentarios y entregables, con registro del tipo de error sin exponer datos.
- Modelo `google:<modelo>` con Gemini directo desde Google AI Studio.
- Token OIDC automático de Vercel para el AI Gateway.
- `CONTRIBUTING.md`, `SEGURIDAD.md`, `docs/README.md` (índice y ruta de lectura) y `docs/decisiones/` con siete decisiones de arquitectura.
- `AVISO.md` de uso y propiedad intelectual.
- `docs/estructura.md` con diagramas por capas, árbol, secuencia y estados, y una vista previa interactiva con datos ficticios.
- `.env.example`, `.gitattributes` y README con inicio rápido, seguridad y mapa de documentación.

### Corregido
- `package-lock.json` sincronizado con `package.json`; `npm ci` ya funciona en Linux.
- Registro de diagnóstico del mantenimiento diario sin exponer datos de conexión.

### Seguridad
- Se reemplazó un correo personal de ejemplo en la documentación por un marcador.
