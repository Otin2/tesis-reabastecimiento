-- 0003_alta_automatica_de_usuarios.sql
-- Aplicado en "Tesis_Reabastecimiento" el 9-nov-2026.
-- Cada usuario nuevo de Supabase Auth recibe automáticamente su perfil:
--  * un correo que empiece con "demo" entra al "Restaurante Demo" (datos inventados);
--  * cualquier otro correo recibe un restaurante propio y VACÍO, que luego se va llenando.
create or replace function private.alta_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rest uuid;
  v_alias text := split_part(coalesce(new.email, 'nuevo'), '@', 1);
begin
  if new.email ilike 'demo%' then
    select id into v_rest from public.restaurantes where nombre = 'Restaurante Demo' limit 1;
  end if;
  if v_rest is null then
    insert into public.restaurantes (nombre) values ('Restaurante de ' || v_alias) returning id into v_rest;
  end if;
  insert into public.perfiles (user_id, restaurante_id, nombre, rol)
  values (new.id, v_rest, v_alias, 'admin')
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke execute on function private.alta_usuario() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function private.alta_usuario();
