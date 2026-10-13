# 0006. Aprobación humana para acciones irreversibles

- **Estado:** Vigente
- **Fecha:** octubre de 2026

## Contexto
Los agentes pueden analizar y proponer, pero ordenar un pago, alterar una obligación o resolver un juicio tiene consecuencias legales y financieras que no se pueden deshacer.

## Decisión
Las herramientas se clasifican por riesgo: lectura, escritura reversible, irreversible o costosa. El riesgo alto crea una `aprobacion`, suspende la operación y expira a rechazo. Los agentes no ejecutan por cuenta propia pagos, cambios de estado, eliminaciones ni cargas definitivas.

## Consecuencias
- Una persona decide siempre sobre lo irreversible, y la decisión queda en la auditoría.
- Una aprobación sin respuesta no se ejecuta: caduca como rechazo.
- Las salidas de herramientas y documentos se tratan como datos no confiables para limitar la inyección de instrucciones.
