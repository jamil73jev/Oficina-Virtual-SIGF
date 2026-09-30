-- Cierra la API de datos de Supabase (PostgREST) para el esquema public. Idempotente.
-- Hallazgo de la revision de seguridad de la ola B: la clave anon es PUBLICA (viaja en el
-- navegador) y Supabase expone por defecto las tablas de public a los roles anon y
-- authenticated. Toda tabla sin RLS quedaba legible y modificable con esa clave (p. ej.
-- membresia, para subirse a propietario). La aplicacion NUNCA habla con la API de datos: lee y
-- escribe solo por la conexion directa a Postgres (pooler), asi que se cierra por completo.
--
-- Defensa en capas:
--   1. RLS activada en TODAS las tablas de public, sin politicas para anon/authenticated:
--      denegado por defecto (la cuenta propietaria, sin FORCE, conserva su acceso).
--   2. REVOKE de todos los privilegios sobre tablas, secuencias y funciones a anon y
--      authenticated (y EXECUTE de funciones a PUBLIC, que tambien alcanza a esos roles).
--   3. Privilegios por defecto revocados: las tablas y funciones FUTURAS nacen cerradas.
-- Los roles anon y authenticated existen en Supabase pero no en PGlite ni en Postgres local:
-- por eso los REVOKE son condicionales.

BEGIN;

-- 1. RLS en todas las tablas de public (sin FORCE).
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 1b. app_rw conserva EXACTAMENTE el acceso que ya tenia (sus GRANT) en las tablas que aun no
--     tienen una politica suya: al activar RLS, sin politica quedaria sin acceso. Es una politica
--     permisiva SOLO para app_rw (rol sin login al que solo llega la aplicacion por
--     SET LOCAL ROLE); anon y authenticated siguen sin ninguna politica.
--     PENDIENTE (defensa en profundidad): sustituirla por politicas por org_id y hacer que los
--     repos de aprobaciones y presupuesto pasen por enTransaccionOrg.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    IF has_table_privilege('app_rw', format('public.%I', t), 'SELECT')
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t AND p.policyname <> 'app_rw_acceso'
           AND ('app_rw' = ANY (p.roles) OR 'public' = ANY (p.roles))
       ) THEN
      EXECUTE format('DROP POLICY IF EXISTS app_rw_acceso ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY app_rw_acceso ON public.%I FOR ALL TO app_rw USING (true) WITH CHECK (true)', t
      );
    END IF;
  END LOOP;
END $$;

-- 2 y 3. Cerrar anon y authenticated (solo donde existen).
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', rol);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', rol);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', rol);
    END IF;
  END LOOP;
END $$;

-- Las funciones nuevas son ejecutables por PUBLIC por defecto (y por tanto por anon y
-- authenticated): se revoca lo existente y lo futuro. Los triggers no necesitan EXECUTE del
-- invocador.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
