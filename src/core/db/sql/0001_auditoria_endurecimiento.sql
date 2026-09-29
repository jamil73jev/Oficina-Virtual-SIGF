-- Migracion escrita a mano; se aplica DESPUES de src/core/db/migrations (drizzle-kit).
-- Verificada en Postgres en proceso (PGlite): tests/integration/db. Idempotente.
-- Endurece la tabla "auditoria": append-only, cadena serializada por organizacion y RLS.
-- Presupone las columnas seq/hash y UNIQUE(org_id, seq) definidas en src/core/db/schema.ts.
-- El HMAC-SHA256 se calcula en la aplicacion (AUDIT_HMAC_KEY); la clave NUNCA vive en la BD.

BEGIN;

-- 0. Rol de aplicacion (sin login propio: el usuario de conexion lo hereda con GRANT app_rw).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN;
  END IF;
END $$;

-- 1. Columnas y unicidad (equivale al cambio de schema.ts; util si se aplica sin drizzle-kit).
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS seq  integer NOT NULL;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS hash text    NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auditoria_org_seq_uq') THEN
    ALTER TABLE auditoria ADD CONSTRAINT auditoria_org_seq_uq UNIQUE (org_id, seq);
  END IF;
END $$;

-- 2. Roles: la aplicacion se conecta como "app_rw"; el propietario de la tabla es otro rol.
--    Solo INSERT y SELECT: ningun UPDATE/DELETE/TRUNCATE desde la aplicacion.
REVOKE ALL ON auditoria FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM app_rw;
GRANT  SELECT, INSERT ON auditoria TO app_rw;

-- 3. Bloqueo por organizacion + validacion de la cadena en cada INSERT.
--    pg_advisory_xact_lock serializa los anexos de una misma org (se libera al terminar la
--    transaccion), de modo que seq = max(seq)+1 y hash_prev = hash anterior sin carreras.
--    SECURITY INVOKER a proposito: con FORCE RLS el propietario tampoco tiene politicas, asi
--    que la lectura corre como app_rw y ve exactamente su org (la politica de INSERT exige
--    org_id = app.org_id, de modo que la entrada nueva y la ultima leida son de la misma org).
CREATE OR REPLACE FUNCTION auditoria_anexar_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  ultima auditoria%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('auditoria:' || NEW.org_id::text, 0));

  SELECT * INTO ultima FROM auditoria
   WHERE org_id = NEW.org_id ORDER BY seq DESC LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.seq <> 1 OR NEW.hash_prev IS NOT NULL THEN
      RAISE EXCEPTION 'auditoria: la primera entrada debe tener seq=1 y hash_prev NULL';
    END IF;
  ELSE
    IF NEW.seq <> ultima.seq + 1 OR NEW.hash_prev IS DISTINCT FROM ultima.hash THEN
      RAISE EXCEPTION 'auditoria: cadena rota (seq/hash_prev no continuan la ultima entrada)';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS auditoria_anexar_guard_trg ON auditoria;
CREATE TRIGGER auditoria_anexar_guard_trg
  BEFORE INSERT ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_anexar_guard();

-- 4. Defensa en profundidad: aunque se concedan permisos por error, UPDATE/DELETE/TRUNCATE fallan.
CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria es append-only (% bloqueado)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS auditoria_no_update_delete ON auditoria;
CREATE TRIGGER auditoria_no_update_delete
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
DROP TRIGGER IF EXISTS auditoria_no_truncate ON auditoria;
CREATE TRIGGER auditoria_no_truncate
  BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inmutable();

-- 5. RLS por organizacion. La aplicacion fija app.org_id con
--    SELECT set_config('app.org_id', '<uuid>', true) al inicio de cada transaccion
--    (equivale a SET LOCAL; el valor sale de la identidad, no de la peticion).
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditoria_select_org ON auditoria;
CREATE POLICY auditoria_select_org ON auditoria FOR SELECT TO app_rw
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
DROP POLICY IF EXISTS auditoria_insert_org ON auditoria;
CREATE POLICY auditoria_insert_org ON auditoria FOR INSERT TO app_rw
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- Sin politicas de UPDATE/DELETE: con RLS activo quedan denegadas por defecto.

-- 6. FK compuesta: una aprobacion solo puede apuntar a ejecuciones de su propia organizacion.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ejecucion_org_id_uq') THEN
    ALTER TABLE ejecucion ADD CONSTRAINT ejecucion_org_id_uq UNIQUE (org_id, id);
  END IF;
END $$;
ALTER TABLE aprobacion DROP CONSTRAINT IF EXISTS aprobacion_ejecucion_id_ejecucion_id_fk;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aprobacion_ejecucion_org_fk') THEN
    ALTER TABLE aprobacion ADD CONSTRAINT aprobacion_ejecucion_org_fk
      FOREIGN KEY (org_id, ejecucion_id) REFERENCES ejecucion (org_id, id);
  END IF;
END $$;

COMMIT;
