# Despliegue paso a paso: Supabase Free y Vercel Hobby

Esta guía usa marcadores; no copie contraseñas ni tokens al repositorio, a incidencias o al chat. El proyecto de Supabase debe estar en la región elegida y Vercel debe enlazarse desde una terminal local confiable.

## Parte 1 — Preparar Supabase

1. Cree o abra el proyecto y espere a que la base esté disponible.
2. En **Authentication → Providers → Email**, apague **Allow new users to sign up**. La oficina no admite registro público.
3. En **Authentication → Users**, cree el único usuario y active la confirmación automática del correo. Use una contraseña única y guárdela en un gestor.
4. En **Project Settings → Database**, restablezca la contraseña de la base y guárdela; no reutilice la anterior.
5. Copie la cadena del **Transaction pooler** (puerto `6543`) para `DATABASE_URL`. Sustituya el marcador de contraseña localmente y use `prepare: false`, ya configurado por el código.
6. Para migraciones copie la conexión directa `5432`; si su red solo permite IPv4, use el **Session pooler** en `DATABASE_URL_MIGRACIONES`.
7. En **Project Settings → API**, copie la URL, la clave anónima/publicable y la clave **secret/service role**. Esta última se usa únicamente para el alta administrativa.
8. Desde una terminal con `DATABASE_URL_DIRECT` o `DATABASE_URL_MIGRACIONES` definida, ejecute primero `npm run db:migrar -- --simular` y luego `npm run db:migrar`.

## Parte 2 — Enlazar y configurar Vercel

Inicie sesión y enlace el directorio sin transmitir secretos por argumentos ni por el chat:

```powershell
vercel login
vercel link
vercel env add DATABASE_URL production --sensitive
vercel env add AUDIT_HMAC_KEY production --sensitive
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add CORREOS_PERMITIDOS production --sensitive
```

Repita para `preview` si se desplegarán previews. `vercel env add` solicita el valor de forma interactiva. Agregue además `PERSISTENCIA=drizzle`, `AUTENTICACION=supabase`, `MFA_OBLIGATORIA=true`, `MODO_DATOS=sintetico` y el `MODELO` elegido. AI Gateway usa OIDC de Vercel; `AI_GATEWAY_API_KEY` solo es necesaria cuando se decide usar una clave explícita. Marque como sensibles todas las credenciales, listas de acceso y cadenas de conexión.

No configure `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL_DIRECT` ni `DATABASE_URL_MIGRACIONES` en el runtime de Vercel: son secretos de tareas administrativas locales. Despliegue con `vercel deploy --prod` o desde la integración Git después de completar las variables.

## Parte 3 — Configuración posterior

1. Copie el dominio definitivo de Vercel.
2. En **Supabase → Authentication → URL Configuration**, establezca ese origen HTTPS como **Site URL** y agregue las **Redirect URLs** necesarias para producción y previews controladas.
3. Abra la aplicación, inicie sesión e inscriba MFA escaneando el QR con una aplicación de autenticación. Confirme que un nuevo acceso exige el código AAL2.
4. En una terminal administrativa defina temporalmente `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL_DIRECT`, y ejecute:

   ```powershell
   node scripts/alta-organizacion.mjs --correo usuario@ejemplo.ec --org "[TU-ORGANIZACION]"
   ```

5. Borre esas variables de la sesión local. Compruebe que el usuario aparece como `owner` y que no puede ver datos de otra organización.
6. En Vercel active **Vercel Authentication** para previews o despliegues que no deban ser públicos. Esto complementa, pero no sustituye, Supabase Auth.

## Inventario exacto de variables

Solo `NEXT_PUBLIC_*` es público. “Obligatoria” se refiere al despliegue productivo normal; las variables de herramientas se exigen únicamente al ejecutar esa herramienta.

| Variable | Uso en código | Clasificación | Valor recomendado en Vercel | Obligatoria |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth servidor y CSP | Pública | `https://[PROYECTO].supabase.co` | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth servidor | Pública | Clave anónima/publicable del panel | Sí |
| `DATABASE_URL` | Cliente PostgreSQL de la app | Secreta | Transaction pooler `:6543`, SSL | Sí |
| `DB_MAX_CONEXIONES` | Límite de `postgres-js` | Secreta/configuración | `3` | No |
| `PERSISTENCIA` | Selección memoria/Drizzle | Secreta/configuración | `drizzle` | Sí |
| `AUDIT_HMAC_KEY` | Cadena HMAC de auditoría | Secreta | Aleatoria, larga y estable | Sí |
| `AUTENTICACION` | Selección Supabase/desarrollo | Secreta/configuración | `supabase` | Sí (explícita recomendada) |
| `MFA_OBLIGATORIA` | Exigencia AAL2 | Secreta/configuración | `true` | No; producción ya usa `true` |
| `CORREOS_PERMITIDOS` | Lista de acceso | Secreta | Correos normalizados, separados por comas | Sí |
| `MODO_DATOS` | Clasificación de datos | Secreta/configuración | `sintetico` | No; es el valor predeterminado |
| `MODELO` | Fábrica del modelo | Secreta/configuración | `gateway:[PROVEEDOR/MODELO]` | Sí para comentarios con IA |
| `MODELO_RESPALDO` | Respaldo explícito | Secreta/configuración | Omitir o `simulado` | No |
| `AI_GATEWAY_API_KEY` | Credencial opcional Gateway | Secreta | Omitir si se usa OIDC de Vercel | No |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Modelo `google:` directo | Secreta | Clave de Google AI Studio | Solo con `MODELO=google:...` |
| `VERCEL_OIDC_TOKEN` | OIDC de Gateway | Secreta | Gestionada automáticamente por Vercel | No manual |
| `MODELO_LOCAL` | Ollama heredado | Secreta/configuración | Omitir en Vercel | No |
| `OLLAMA_URL` | URL de Ollama | Secreta/configuración | Omitir en Vercel | No |
| `SUPABASE_URL` | Blob y script de alta | Secreta | Solo tarea administrativa/Blob | Sí si se usa Blob o alta |
| `SUPABASE_SERVICE_ROLE_KEY` | Blob y script de alta | Secreta | Solo secreto de servidor/terminal | Sí si se usa Blob o alta |
| `DATABASE_URL_DIRECT` | Alta y migraciones | Secreta | Directa `:5432`, solo terminal | Sí para alta; alternativa en migración |
| `DATABASE_URL_MIGRACIONES` | Migrador | Secreta | Session pooler para IPv4 | Alternativa a `DATABASE_URL_DIRECT` |
| `APPROVALS_DEV_IDENTITY` | Identidad local | Secreta | Omitir | No; prohibida en producción |
| `APPROVALS_ALLOW_DEV_IDENTITY` | Guarda de identidad local | Secreta/configuración | Omitir | No; prohibida en producción |
| `AUDIT_BASE_URL` | Auditorías a11y/perf | Secreta/configuración | URL local o preview | Solo auditoría |
| `AUDIT_TEMAS` | Temas de axe | Secreta/configuración | `light,dark` | No |
| `AUDIT_CHANNEL` | Navegador de axe | Secreta/configuración | `chrome` | No |
| `AUDIT_RUTAS` | Rutas Lighthouse | Secreta/configuración | Lista controlada | No |
| `AUDIT_DETALLE` | Salida Lighthouse | Secreta/configuración | `0` | No |
| `NODE_ENV` | Guardas y configuración Next | Secreta/configuración | Gestionada por Vercel | No manual |
| `VERCEL_ENV` | Guardas de producción | Secreta/configuración | Gestionada por Vercel | No manual |

## Lista de comprobación final

- [ ] Registro público apagado y usuario confirmado.
- [ ] Migraciones aplicadas; segunda ejecución informa que no hay pendientes.
- [ ] Variables obligatorias presentes y secretos marcados como sensibles.
- [ ] `DATABASE_URL` usa `6543`; conexiones privilegiadas no están en el runtime.
- [ ] Site URL y Redirect URLs usan HTTPS y dominios esperados.
- [ ] Login, lista de correos y MFA AAL2 verificados.
- [ ] Organización y membresía `owner` creadas con el script idempotente.
- [ ] Data API no permite leer ni modificar tablas con la clave anónima.
- [ ] Vercel Authentication protege previews cuando corresponde.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` y axe pasan.
