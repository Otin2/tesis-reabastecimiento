-- =====================================================================
-- 0007_insumos_sin_punto_de_aviso.sql
-- Aplicado en "Tesis_Reabastecimiento" el 16-nov-2026 (ensayado antes junto con prueba_aislamiento.sql).
--
-- Problema: un insumo con stock 0 y punto_reorden 0 cumple `stock <= punto_reorden`, así que
-- salía como 'Crítico' en insumos_por_agotarse e insumos_resumen, y entraba en
-- lista_compras_sugerida con cantidad 0. Un punto de aviso en 0 significa "sin aviso".
--
-- Corrección: un insumo solo tiene nivel ('Bajo' / 'Crítico') cuando punto_reorden > 0.
--  1) insumos_por_agotarse     (definida en 0001) solo lista insumos con punto_reorden > 0.
--  2) insumos_resumen          (definida en 0004) nivel = null si punto_reorden <= 0.
--                              Lee uso_diario_insumo, que 0006 redefinió; aquí no cambia.
--  3) lista_compras_sugerida   NO se toca: filtra `nivel is not null`, así que queda corregida
--                              a través de insumos_resumen. Con punto_reorden > 0 y
--                              stock <= punto_reorden la cantidad (2 × punto − stock) siempre es > 0.
--
-- "create or replace view" conserva nombres, orden y tipos de columnas (si no, falla), y los
-- permisos. Se repite `security_invoker = true`: reemplazar la vista reemplaza sus opciones y,
-- sin ella, la vista correría con los permisos del dueño (saltándose RLS).
--
-- Además (hallazgo de supabase/tests/prueba_aislamiento.sql):
--  4) registrar_compra         comprueba que el proveedor sea del mismo restaurante. Antes aceptaba
--                              el id de un proveedor de otro restaurante.
-- =====================================================================

-- ---------- 1) Insumos por agotarse: solo los que tienen punto de aviso ----------
create or replace view public.insumos_por_agotarse with (security_invoker = true) as
select
  id as insumo_id, restaurante_id, nombre, unidad, stock, punto_reorden,
  case when stock <= punto_reorden * 0.5 then 'Crítico' else 'Bajo' end as nivel
from public.insumos
where activo and en_recetas and punto_reorden > 0 and stock <= punto_reorden;

-- ---------- 2) Resumen de insumos: sin punto de aviso no hay nivel ----------
create or replace view public.insumos_resumen with (security_invoker = true) as
select
  i.id, i.restaurante_id, i.nombre, i.unidad,
  case when i.en_recetas then i.stock end as stock,
  case when i.en_recetas then i.punto_reorden end as punto_reorden,
  i.presentacion_compra, i.costo_unitario, i.en_recetas, i.vida_util_dias, i.activo, i.proveedor_id,
  case when i.en_recetas and i.punto_reorden > 0 and i.stock <= i.punto_reorden
       then case when i.stock <= i.punto_reorden * 0.5 then 'Crítico' else 'Bajo' end end as nivel,
  case when i.en_recetas and u.uso_diario > 0 then round(greatest(i.stock, 0) / u.uso_diario, 1) end as dias_restantes
from public.insumos i
left join public.uso_diario_insumo u on u.insumo_id = i.id;

-- ---------- 4) registrar_compra: el proveedor debe ser del mismo restaurante ----------
-- p_lineas: [{"insumo_id": 1, "cantidad": 5000, "costo_total": 60}, ...]
create or replace function public.registrar_compra(
  p_restaurante uuid, p_usuario uuid, p_lineas jsonb, p_proveedor bigint default null
) returns jsonb language plpgsql set search_path = '' as $$
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra no tiene insumos';
  end if;
  if p_proveedor is not null and not exists (
    select 1 from public.proveedores where id = p_proveedor and restaurante_id = p_restaurante
  ) then
    raise exception 'El proveedor no existe';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lineas) as x(insumo_id bigint, cantidad numeric, costo_total numeric)
    left join public.insumos i on i.id = x.insumo_id and i.restaurante_id = p_restaurante
    where i.id is null or x.cantidad is null or x.cantidad <= 0 or x.costo_total is null or x.costo_total < 0
  ) then
    raise exception 'Hay insumos inexistentes, cantidades inválidas o precios inválidos';
  end if;

  insert into public.compras (restaurante_id, insumo_id, proveedor_id, cantidad, costo_total, registrado_por)
  select p_restaurante, x.insumo_id, p_proveedor, x.cantidad, round(x.costo_total, 2), p_usuario
  from jsonb_to_recordset(p_lineas) as x(insumo_id bigint, cantidad numeric, costo_total numeric);
  return jsonb_build_object('ok', true, 'lineas', jsonb_array_length(p_lineas));
end $$;

revoke execute on function public.registrar_compra(uuid, uuid, jsonb, bigint) from public, anon, authenticated;
