# 0002. Los datos reales solo se procesan con modelos locales

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
El sistema modela información financiera y tributaria municipal. Enviar datos reales a un servicio externo de modelos expondría información reservada.

## Decisión
Existen dos modos de datos. En **modo sintético**, el actual, se admiten modelos de nube (Vercel AI Gateway o Google AI Studio). En **modo real** solo se admiten modelos ejecutados localmente (Ollama) dentro de la infraestructura autorizada. En Vercel, una configuración real o una fuente que no declare tipo sintético falla al construir el servicio y al iniciar cada consulta.

## Consecuencias
- El despliegue público en planes gratuitos nunca recibe datos reales.
- El paso de sintético a real es explícito, auditable y reversible.
- La calidad de los comentarios en modo real depende de los modelos locales disponibles.
- Los fixtures de prueba usan solo datos ficticios.

Detalles en [`modelo-nube.md`](../modelo-nube.md) y [`modelo-local.md`](../modelo-local.md).
