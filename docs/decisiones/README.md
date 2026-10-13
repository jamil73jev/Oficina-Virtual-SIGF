# Decisiones de arquitectura

Cada archivo registra una decisión que condiciona el diseño: qué se decidió, por qué y qué consecuencias tiene. Sirven para que quien llegue después entienda las razones antes de cambiar algo. Si una decisión cambia, no se borra su archivo: se marca como **reemplazada** y se enlaza la nueva.

| N.º | Decisión | Estado |
|---|---|---|
| [0001](0001-cifras-calculadas-por-herramientas.md) | Las cifras las calculan herramientas de código; el modelo solo comenta | Vigente |
| [0002](0002-datos-reales-solo-con-modelo-local.md) | Los datos reales solo se procesan con modelos locales | Vigente |
| [0003](0003-aislamiento-por-organizacion-con-rls.md) | Aislamiento por organización con RLS y un rol sin login | Vigente |
| [0004](0004-auditoria-encadenada-con-hmac.md) | Auditoría append-only encadenada con HMAC | Vigente |
| [0005](0005-runtime-de-modelos-intercambiable.md) | Runtime de modelos detrás de una interfaz | Vigente |
| [0006](0006-aprobacion-humana-para-acciones-irreversibles.md) | Aprobación humana para acciones irreversibles | Vigente |
| [0007](0007-traza-de-operaciones-con-secuencia.md) | Traza de operaciones con secuencia por operación | Vigente |

## Plantilla

```markdown
# NNNN. Título de la decisión

- **Estado:** Propuesta | Vigente | Reemplazada por NNNN
- **Fecha:** mes de año

## Contexto
Qué problema o restricción obliga a decidir.

## Decisión
Qué se decidió, en una o dos frases.

## Consecuencias
Qué se gana, qué se pierde y qué queda por vigilar.
```
