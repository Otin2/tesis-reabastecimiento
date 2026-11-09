-- 0002_mover_mi_restaurante_a_schema_private.sql
-- Aplicado en "Tesis_Reabastecimiento" el 9-nov-2026.
-- La función que usan las políticas RLS no debe poder llamarse desde la API pública (/rest/v1/rpc).
-- Se mueve a un schema "private", que la API no expone. Las políticas siguen funcionando.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.mi_restaurante() set schema private;
revoke execute on function private.mi_restaurante() from public, anon;
grant execute on function private.mi_restaurante() to authenticated;
