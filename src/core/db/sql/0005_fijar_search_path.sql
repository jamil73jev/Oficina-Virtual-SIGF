-- Fija la ruta de busqueda de las funciones disparadoras que no la tenian (aviso
-- function_search_path_mutable del asesor de seguridad de Supabase). Idempotente.
-- Evita que un objeto homonimo en otro esquema sustituya a los que la funcion espera.

ALTER FUNCTION public.auditoria_inmutable() SET search_path = public, pg_temp;
ALTER FUNCTION public.documento_version_inmutable() SET search_path = public, pg_temp;
