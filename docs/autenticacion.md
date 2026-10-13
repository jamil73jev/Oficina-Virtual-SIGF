# Autenticación y control de acceso

## Flujo de sesión

La autenticación usa Supabase Auth desde el servidor. El proxy de Next.js renueva cookies y toma una decisión temprana de navegación; después, cada página y cada API vuelven a validar la identidad. La comprobación autorizante usa `auth.getUser()`, que valida el token contra Supabase, y nunca confía en `getSession()` ni en datos enviados por el navegador.

El orden es:

1. `getUser()` valida la sesión y obtiene el identificador y correo.
2. El correo normalizado debe pertenecer a `CORREOS_PERMITIDOS`; para el uso personal puede configurarse, por ejemplo, `usuario@ejemplo.ec`.
3. Si MFA es obligatorio o existe un factor verificado, `getAuthenticatorAssuranceLevel()` debe devolver `aal2`.
4. La base busca una membresía del usuario. `orgId` y rol salen exclusivamente de esa membresía.
5. Las APIs responden `401` o `403`; las páginas redirigen a login, desafío MFA, inscripción o “sin acceso”, según corresponda.

`AUTENTICACION=desarrollo` está prohibida en Vercel y producción. `CORREOS_PERMITIDOS` vacía deniega a todos. Desactivar `MFA_OBLIGATORIA` no evita AAL2 para una cuenta que ya tenga un factor verificado.

## MFA TOTP

El usuario inicia sesión con correo y contraseña (AAL1), inscribe un factor TOTP y confirma un código de seis dígitos. Desde entonces, cada sesión debe superar el desafío para alcanzar AAL2. El secreto TOTP y el QR solo se muestran durante la inscripción; no se registran ni se guardan en la base de la aplicación.

Supabase no proporciona códigos de recuperación para este flujo. Si se pierde el dispositivo, un administrador debe comprobar la identidad por un canal independiente, abrir Authentication en el panel de Supabase y eliminar el factor MFA del usuario; en el siguiente acceso, la aplicación exigirá una nueva inscripción. No desactive globalmente MFA ni agregue una excepción de correo para resolver el incidente.

## Proxy y límites de confianza

El proxy excluye estáticos y la sonda de salud, renueva cookies y redirige rutas web. Las rutas `/api` no se convierten en HTML: sus handlers validan de nuevo y devuelven JSON. Los destinos posteriores al login se restringen a rutas locales válidas para evitar redirecciones abiertas. Las acciones de servidor validan formato, limitan longitudes y presentan errores genéricos para no revelar si una cuenta existe.

La URL y la clave anónima `NEXT_PUBLIC_*` son públicas por diseño, pero la API de datos está cerrada para `anon` y `authenticated`. `SUPABASE_SERVICE_ROLE_KEY` solo se usa desde `scripts/alta-organizacion.mjs`; nunca llega al bundle, al navegador, a cookies ni a registros. Las contraseñas, tokens, códigos TOTP, secretos QR y cadenas PostgreSQL tampoco deben registrarse.

## Modelo de amenazas

- Robo o manipulación de cookies: `getUser()` valida el token; cookies seguras y AAL2 reducen reutilización.
- Escalada entre organizaciones: la membresía fija organización/rol y PostgreSQL aplica RLS mediante `app_rw`.
- Enumeración de usuarios: el login devuelve un mensaje uniforme ante fallos de credenciales.
- CSRF: las acciones de servidor comprueban origen y las APIs mantienen autorización propia.
- Redirección abierta: `destinoSeguro` admite únicamente destinos internos y locales conocidos.
- Clave anónima expuesta: es pública; RLS y revocaciones cierran la Data API.
- Service role o conexión propietaria filtrada: manténgalas solo en secretos operativos, rótelas inmediatamente ante sospecha y audite el alta de membresías.
