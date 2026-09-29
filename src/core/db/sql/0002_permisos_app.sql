-- Migracion escrita a mano; se aplica despues de 0001 (que crea el rol app_rw). Idempotente.
-- Minimo privilegio para el rol de aplicacion en las tablas que usan los repos Drizzle.
-- auditoria queda fuera: sus permisos (solo SELECT/INSERT) los fija 0001.

BEGIN;

GRANT USAGE ON SCHEMA public TO app_rw;

-- Lectura de catalogos de identidad y del arbol de ejecucion (FK de aprobacion).
GRANT SELECT ON organizacion, usuario, membresia, ejecucion TO app_rw;

-- Aprobaciones: se crean y se resuelven (compare-and-set); nunca se borran.
GRANT SELECT, INSERT, UPDATE ON aprobacion TO app_rw;

-- Presupuesto: reserva/conciliacion por UPDATE; alta por INSERT. Sin DELETE.
GRANT SELECT, INSERT, UPDATE ON presupuesto, solicitud_ampliacion TO app_rw;

COMMIT;
