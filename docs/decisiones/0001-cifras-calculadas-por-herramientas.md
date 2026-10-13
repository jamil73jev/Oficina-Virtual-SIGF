# 0001. Las cifras las calculan herramientas de código; el modelo solo comenta

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
Un modelo de lenguaje puede redactar bien y calcular mal. En un sistema financiero, una cifra inventada o mal sumada es peor que una cifra ausente.

## Decisión
Toda cifra y toda tabla las produce una herramienta de código permitida para el agente, con fuente, fórmula, filtros y fecha de corte. El modelo solo redacta comentarios y propone planes sobre resúmenes compactos. Una verificación contrasta cada cifra del comentario con las tablas y marca las que no coinciden.

## Consecuencias
- Las cifras son reproducibles y se pueden probar con Vitest sin llamar a ningún modelo.
- Un modelo que falla no impide entregar: el agente queda en estado **degradado** y conserva sus tablas.
- Las reglas de negocio (cartera por título, recaudación neta, reversos) viven en código y en [`agentes-area.md`](../agentes-area.md), no en las instrucciones del modelo.
- Cada herramienta nueva exige su prueba y su regla documentada.
