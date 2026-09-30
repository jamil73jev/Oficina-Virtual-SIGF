-- Migracion escrita a mano; se aplica despues de src/core/db/migrations (incluida
-- 0001_persistencia de drizzle-kit) y de 0001/0002 de esta carpeta. Idempotente.
-- Verificada en Postgres en proceso (PGlite): tests/integration/db/persistencia-rls.test.ts.
--
-- Modelo de roles (ver docs/persistencia.md):
--   * La cuenta de conexion (en Supabase, "postgres" tanto en el pooler como en la conexion
--     directa) es propietaria de las tablas y puede saltarse RLS. Por eso la aplicacion NUNCA
--     consulta con ella directamente: enTransaccionOrg (src/core/db/index.ts) abre cada
--     transaccion con SET LOCAL ROLE app_rw y fija app.org_id, de modo que las politicas
--     SIEMPRE aplican.
--   * app_rw: rol sin login, sin BYPASSRLS y no propietario; minimo privilegio.

BEGIN;

-- 0. Rol de aplicacion (lo crea 0001; se repite por si este archivo se aplica aislado).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN;
  END IF;
END $$;

-- 1. La cuenta de conexion (quien aplica esta migracion) debe poder hacer SET ROLE app_rw.
--    Desde Postgres 16, quien crea un rol con CREATEROLE recibe solo ADMIN OPTION (sin SET):
--    ser "miembro" no basta, hace falta la opcion SET. Un superusuario (PGlite, Postgres local)
--    ya la tiene implicita y no se hace nada.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 160000 THEN
    IF NOT pg_has_role(current_user, 'app_rw', 'SET') THEN
      EXECUTE format('GRANT app_rw TO %I WITH SET TRUE', current_user);
    END IF;
  ELSIF NOT pg_has_role(current_user, 'app_rw', 'MEMBER') THEN
    EXECUTE format('GRANT app_rw TO %I', current_user);
  END IF;
END $$;

-- 2. Minimo privilegio. Sin DELETE ni TRUNCATE: la retencion de la traza la ejecuta la cuenta
--    de conexion (mantenimiento), no app_rw. Las versiones de documento son inmutables.
GRANT USAGE ON SCHEMA public TO app_rw;
GRANT SELECT, INSERT, UPDATE ON proyecto, tarea, documento, ejecucion, operacion TO app_rw;
GRANT SELECT, INSERT ON documento_version, mensaje, artefacto, evento_traza TO app_rw;

-- 3. RLS por organizacion en todas las tablas de negocio de la persistencia:
--    org_id = current_setting('app.org_id'). Sin app.org_id (NULL) no se ve ni se escribe nada.
--    Sin FORCE: la cuenta propietaria conserva el acceso de mantenimiento (migraciones,
--    retencion); la aplicacion nunca la usa sin SET LOCAL ROLE app_rw.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proyecto', 'tarea', 'documento', 'documento_version', 'mensaje',
    'ejecucion', 'artefacto', 'operacion', 'evento_traza'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_rw '
      'USING (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
      'WITH CHECK (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)',
      t || '_org', t
    );
  END LOOP;
END $$;

-- 4. Defensa en profundidad: el historial de versiones de documento no se reescribe.
CREATE OR REPLACE FUNCTION documento_version_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'documento_version es inmutable (% bloqueado)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS documento_version_no_update ON documento_version;
CREATE TRIGGER documento_version_no_update
  BEFORE UPDATE ON documento_version
  FOR EACH ROW EXECUTE FUNCTION documento_version_inmutable();

COMMIT;
