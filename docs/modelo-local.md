# Modelo local con Ollama

Los agentes pueden usar Ollama como adaptador local detrás del puerto `ModeloLenguaje`. Esta integración no sustituye la política de datos: cuando la fuente es real, solo se admite un modelo con alojamiento local y el sistema falla cerrado si falta configuración o el servidor no responde.

## Instalación en Windows

Abra PowerShell y ejecute:

```powershell
winget install Ollama.Ollama
```

Después de instalar, inicie Ollama y descargue un modelo adecuado para CPU y 15 GB de RAM, por ejemplo:

```powershell
ollama pull qwen2.5:7b
```

Compruebe localmente que el modelo aparece:

```powershell
ollama list
```

## Configuración

Configure estas variables en el proceso que ejecuta la aplicación:

```text
MODELO_LOCAL=ollama:qwen2.5:7b
OLLAMA_URL=http://127.0.0.1:11434
```

`OLLAMA_URL` es opcional y usa `http://127.0.0.1:11434` por defecto. Por seguridad solo se aceptan `http://localhost`, `http://127.0.0.1` o `http://[::1]`, con puerto opcional y sin credenciales; HTTPS, nombres remotos, direcciones privadas de red y variantes engañosas se rechazan antes de enviar datos.

Si `MODELO_LOCAL` no está definida, la consulta devuelve `modelo_local_no_configurado`. Si Ollama no responde o el modelo indicado no está instalado, devuelve `modelo_local_no_disponible`. En ninguno de los dos casos se usa silenciosamente el modelo simulado ni un proveedor en la nube.

## Rendimiento esperado

En un Ryzen 7 5700U con 15 GB de RAM y sin GPU dedicada, `qwen2.5:7b` se ejecuta principalmente por CPU. El arranque y las respuestas pueden tardar varios minutos según el tamaño del contexto, la carga del equipo y la memoria disponible. El timeout normal de consultas es de tres minutos y puede configurarse en el adaptador cuando sea necesario.

## Paso de datos sintéticos a reales

El modelo y la fuente son decisiones separadas. La demostración actual usa una fuente sintética; para operar con datos reales se debe conectar una `FuenteDatos` declarada como `real` y mantener `ModeloOllama` local. El modo de datos siempre se deriva de la fuente y nunca debe forzarse desde la interfaz o la ruta.

Antes de habilitar datos reales:

1. Verifique permisos, minimización, trazabilidad y aprobación institucional.
2. Conecte la fuente real sin copiar datos a archivos de prueba o prompts externos.
3. Confirme que la aplicación reconoce el modelo local como disponible.
4. Pruebe con un conjunto controlado y revise auditoría, herramientas permitidas y presupuestos.
5. Mantenga deshabilitado cualquier adaptador de nube para ese flujo.

## Cómo comprobar que nada sale del equipo

- Mantenga `OLLAMA_URL` en una dirección loopback; el código rechaza cualquier otro host.
- Revise el Monitor de recursos o el Firewall de Windows mientras ejecuta una consulta y confirme que el proceso solo conecta con `127.0.0.1` o `::1` en el puerto de Ollama.
- Bloquee conexiones salientes del proceso de Ollama y de la aplicación en un entorno de prueba; la consulta local debe seguir funcionando.
- Revise los logs y la auditoría: no deben aparecer URLs, claves o proveedores externos.
- No exponga Ollama mediante proxy, túnel, red local o escucha en `0.0.0.0`; esa topología no se considera local para esta integración.

