# Aviso de uso y propiedad intelectual: Oficina Virtual

Oficina Virtual es un proyecto de diseño y desarrollo de una oficina de agentes de inteligencia artificial para el **Sistema Integral de Gestión Financiera (SIGF)** de la Dirección General Financiera de la M.I. Municipalidad de Guayaquil. Este repositorio es privado y reúne su código, su documentación y sus pruebas.

## Autoría y titularidad

| | |
|---|---|
| **Autor** | Jorge Jamil Espinoza Villa, Analista Financiero |
| **Dependencia de referencia** | Dirección General Financiera, M.I. Municipalidad de Guayaquil |
| **Estado del proyecto** | En desarrollo; funciona solo con datos sintéticos |

La titularidad y los derechos de explotación de esta obra se rigen por la normativa ecuatoriana de propiedad intelectual y por los acuerdos y disposiciones internas que resulten aplicables. Este aviso no los transfiere, no los modifica y no concede una licencia de código abierto.

El nombre de la Municipalidad y los nombres de sus áreas se usan para identificar el dominio funcional que el proyecto modela. Este repositorio **no es un sistema oficial de la institución**, no está en producción y no equivale a una publicación oficial.

## Alcance

Este aviso cubre todo el contenido del repositorio:

- El código de la aplicación web y de las APIs (`src/`), con sus 12 agentes de área, la Sala de operaciones, el control de presupuesto, las aprobaciones y la auditoría.
- Las instrucciones de los agentes (`src/orchestration/skills/`), los catálogos de herramientas y las reglas de negocio.
- Los scripts de migración y de auditoría (`scripts/`), las pruebas (`tests/`) y los flujos de verificación (`.github/`).
- La documentación técnica (`docs/`) y los textos de interfaz (`messages/`).

## Uso permitido

- Lectura, revisión y mantenimiento por parte de las personas que la persona autora autorice.
- Ejecución local y despliegue de prueba con **datos sintéticos**, en cuentas de Vercel, Supabase y proveedores de modelos controladas por la persona autora o por la institución.
- Auditorías internas y revisiones de seguridad sobre el diseño y el código.
- Demostraciones y capacitación dentro de la institución con los datos ficticios que trae el proyecto.

## Usos no permitidos sin autorización

- Copiar, publicar, redistribuir o ceder el código o las instrucciones de los agentes, total o parcialmente, a terceros o en repositorios públicos.
- Desplegar el sistema para otra entidad, o venderlo, alquilarlo u ofrecerlo como servicio.
- Cargar información real de contribuyentes, de proveedores o de la institución en un despliegue que no cumpla las condiciones de la sección siguiente.
- Guardar en este repositorio o en sus ramas credenciales, claves, tokens, archivos `.env` con valores reales, respaldos de bases de datos o archivos con información de contribuyentes. El repositorio solo incluye `.env.example` con marcadores.
- Retirar o alterar este aviso o la mención de autoría.

## Datos, modelos y reserva de la información

El proyecto separa dos modos de datos, descritos en [`docs/agentes-area.md`](docs/agentes-area.md):

- **Modo sintético** (el actual). Usa solo datos ficticios. Es el único modo permitido con modelos de nube (Vercel AI Gateway o Google AI Studio). Sus resultados no certifican cifras institucionales y no deben presentarse como información oficial.
- **Modo real**. Solo es admisible cuando existan autorización institucional, controles de acceso, trazabilidad y fuentes aprobadas, y **únicamente con modelos ejecutados localmente** dentro de la infraestructura autorizada. Ningún dato, prompt, documento o resultado reales pueden enviarse a modelos o servicios externos. El paso de sintético a real debe ser explícito, auditable y reversible.

Cualquier uso sobre datos reales debe respetar la normativa vigente de protección de datos personales y de reserva de la información tributaria, y las políticas de seguridad de la información de la Municipalidad.

Si alguien encuentra en este repositorio un dato personal, una credencial o un archivo con información real, debe avisar de inmediato a la persona autora y no copiarlo ni difundirlo.

## Naturaleza de los resultados de los agentes

Los agentes analizan, concilian, señalan diferencias y proponen acciones. **No toman decisiones** de pago, de cobranza, de sanción, contables ni presupuestarias, y toda acción irreversible o que cambie un estado requiere aprobación humana previa. Las cifras las calculan herramientas de código con fuente, fórmula y fecha de corte; los comentarios de un modelo de lenguaje pueden contener errores y deben contrastarse con las cifras y con las fuentes oficiales antes de usarse.

## Componentes de terceros

El proyecto usa software y servicios que no son de la persona autora y que conservan sus propias licencias y términos, entre ellos: Next.js y React, Drizzle ORM, `next-intl`, Zod, el AI SDK de Vercel, Supabase (autenticación y PostgreSQL), Vercel (alojamiento y AI Gateway), Google AI Studio y los modelos de Gemini, y Ollama con los modelos que el usuario descargue. Las dependencias de desarrollo se listan en `package.json` y `package-lock.json`. Este aviso no modifica esas licencias.

## Sin garantía

El contenido se entrega tal como está y refleja el estado del trabajo en la fecha indicada abajo. No se garantiza que sea apto para un uso particular ni que esté libre de errores. La persona autora no responde por usos distintos a los previstos en este aviso.

## Solicitudes de uso

Para reutilizar este contenido fuera del uso descrito, o para compartirlo con personas ajenas al equipo autorizado, se requiere autorización previa y por escrito de la persona autora y, cuando corresponda, de la autoridad institucional competente.

| | |
|---|---|
| **Versión del aviso** | 1.0 |
| **Fecha** | octubre de 2026 |
