# Modelo en la nube con Vercel AI Gateway

La integración usa el proveedor `createGateway` incluido en AI SDK 7. No hay un modelo predeterminado: si `MODELO` no está definido, la aplicación conserva el comportamiento sin modelo configurado.

## Configuración

- `MODELO=gateway:<proveedor/modelo>` selecciona un ID del catálogo, por ejemplo `gateway:google/gemini-2.5-flash-lite`.
- `MODO_DATOS=sintetico` es el valor predeterminado y el único permitido para modelos de nube y para cualquier despliegue con `VERCEL_ENV`.
- `AI_GATEWAY_API_KEY` autentica explícitamente contra Gateway. En un despliegue Vercel también se acepta el OIDC suministrado como `VERCEL_OIDC_TOKEN`; nunca se registran estas credenciales.
- `MODELO_RESPALDO=simulado` habilita expresamente el respaldo determinista. Sin esta variable no existe caída silenciosa; el agotamiento produce un error tipado.

Para elegir un modelo de la capa gratuita, consulte el catálogo actual de AI Gateway en Vercel y filtre por precio o disponibilidad gratuita antes de definir `MODELO`. El catálogo y los límites cambian, por lo que el código no fija un modelo gratuito por defecto; cada modelo puede imponer cuotas y responder `429`. La integración reintenta errores transitorios hasta tres veces con espera creciente y limita la duración de cada intento.

## Regla de datos

El Gateway solo puede recibir datos sintéticos. `MODO_DATOS=real` requiere ejecución local fuera de Vercel; en Vercel, una configuración real o una fuente que no declare tipo `sintetico` falla tanto al construir el servicio como al iniciar cada consulta. Las cifras y tablas continúan siendo calculadas por código y el modelo se limita a redactar comentarios o proponer planes sobre resúmenes compactos.

## Modelo recomendado

`google/gemini-2.5-flash-lite` figura como ID válido en la versión instalada de AI Gateway y es una opción ligera adecuada para comentarios breves. Confirme en el catálogo del Gateway que siga incluido en la capa gratuita y revise su cuota justo antes del despliegue.
