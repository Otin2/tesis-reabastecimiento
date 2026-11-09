-- =====================================================================
-- 0005_completar_funciones_de_la_api.sql
-- Aplicado en "Tesis_Reabastecimiento" el 9-nov-2026.
--
-- Cierra los huecos que quedaban entre la base y el contrato de la API (ESTADO.md, sección 7):
--  * guardar_plato          crear/editar un plato con su receta en UNA transacción
--  * crear_insumo / importar_insumos   el stock inicial entra por el libro de movimientos
--  * gastos                 el frontend ve una lista única; en la base hay plantillas (fijos) y
--                           gastos del mes. Se identifican con 'f12' (plantilla) o 'g45' (puntual).
--  * ventas_hoy             ventas de hoy (hora de Lima) con sus platos, listas para la API
--  * insumos_por_vencer     el estado ahora es el texto que muestra la app ("Vence mañana")
-- Todas las funciones son solo para el backend (service role).
-- =====================================================================

-- ---------- Menú: plato + receta ----------

create or replace function public.guardar_plato(
  p_restaurante uuid, p_plato bigint, p_nombre text, p_categoria text,
  p_precio numeric, p_activo boolean, p_receta jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(trim(p_nombre), '') = '' then raise exception 'El plato necesita un nombre'; end if;
  if p_receta is not null and jsonb_typeof(p_receta) <> 'array' then raise exception 'La receta debe ser una lista'; end if;
  if p_receta is not null and exists (
    select 1 from jsonb_to_recordset(p_receta) as x(insumo_id bigint, cantidad numeric)
    left join public.insumos i on i.id = x.insumo_id and i.restaurante_id = p_restaurante and i.en_recetas
    where i.id is null or x.cantidad is null or x.cantidad <= 0
  ) then
    raise exception 'La receta tiene insumos inexistentes, de uso general o cantidades inválidas';
  end if;

  if p_plato is null then
    insert into public.platos (restaurante_id, nombre, categoria, precio, activo)
    values (p_restaurante, trim(p_nombre), p_categoria, p_precio, coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.platos
       set nombre = trim(p_nombre), categoria = p_categoria, precio = p_precio, activo = coalesce(p_activo, activo)
     where id = p_plato and restaurante_id = p_restaurante
    returning id into v_id;
    if v_id is null then raise exception 'El plato no existe'; end if;
  end if;

  if p_receta is not null then
    delete from public.recetas where plato_id = v_id;
    insert into public.recetas (plato_id, insumo_id, cantidad)
    select v_id, x.insumo_id, sum(x.cantidad)
    from jsonb_to_recordset(p_receta) as x(insumo_id bigint, cantidad numeric)
    group by x.insumo_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------- Insumos ----------

-- p_datos: {nombre, unidad, en_recetas, costo_unitario, presentacion_compra, stock?, punto_reorden?, vida_util_dias?}
-- El stock inicial entra como un movimiento 'ajuste' (el stock nunca se escribe a mano).
create or replace function public.crear_insumo(p_restaurante uuid, p_usuario uuid, p_datos jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_id bigint;
  v_en boolean := coalesce((p_datos ->> 'en_recetas')::boolean, true);
  v_stock numeric := coalesce((p_datos ->> 'stock')::numeric, 0);
begin
  insert into public.insumos (restaurante_id, nombre, unidad, costo_unitario, presentacion_compra, punto_reorden, vida_util_dias, en_recetas)
  values (
    p_restaurante, trim(p_datos ->> 'nombre'), p_datos ->> 'unidad',
    (p_datos ->> 'costo_unitario')::numeric, (p_datos ->> 'presentacion_compra')::numeric,
    case when v_en then coalesce((p_datos ->> 'punto_reorden')::numeric, 0) else 0 end,
    nullif(p_datos ->> 'vida_util_dias', '')::int, v_en
  ) returning id into v_id;

  if v_en and v_stock > 0 then
    insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo, registrado_por)
    values (p_restaurante, v_id, 'ajuste', v_stock, 'Stock inicial', p_usuario);
  end if;
  return (select to_jsonb(r) from public.insumos_resumen r where r.id = v_id);
end $$;

-- Importa varios insumos (todo o nada). Los que ya existen (mismo nombre) se omiten.
create or replace function public.importar_insumos(p_restaurante uuid, p_usuario uuid, p_lista jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare d jsonb; v_creados int := 0; v_omitidos int := 0;
begin
  if p_lista is null or jsonb_typeof(p_lista) <> 'array' then raise exception 'La lista de insumos es inválida'; end if;
  for d in select * from jsonb_array_elements(p_lista) loop
    if exists (select 1 from public.insumos where restaurante_id = p_restaurante and lower(nombre) = lower(trim(d ->> 'nombre'))) then
      v_omitidos := v_omitidos + 1;
    else
      perform public.crear_insumo(p_restaurante, p_usuario, d);
      v_creados := v_creados + 1;
    end if;
  end loop;
  return jsonb_build_object('creados', v_creados, 'omitidos', v_omitidos);
end $$;

-- ---------- Gastos ----------

-- Lista única para la app: plantillas activas ('f' + id) y gastos puntuales del mes actual ('g' + id).
create view public.gastos_lista with (security_invoker = true) as
select restaurante_id, 'f' || id as id, nombre, categoria, monto, true as fijo
from public.gastos_fijos
where activo
union all
select restaurante_id, 'g' || id, coalesce(descripcion, categoria), categoria, monto, false
from public.gastos
where gasto_fijo_id is null
  and periodo = date_trunc('month', now() at time zone 'America/Lima')::date;

create or replace function public.crear_gasto(
  p_restaurante uuid, p_usuario uuid, p_nombre text, p_categoria text, p_monto numeric, p_fijo boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare v_id bigint; v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if coalesce(trim(p_nombre), '') = '' then raise exception 'El gasto necesita un nombre'; end if;
  if p_monto is null or p_monto < 0 then raise exception 'El monto no es válido'; end if;
  if p_fijo then
    insert into public.gastos_fijos (restaurante_id, nombre, categoria, monto, dia_mes)
    values (p_restaurante, trim(p_nombre), p_categoria, p_monto, 1) returning id into v_id;
    perform public.generar_gastos_mes(p_restaurante, v_hoy);   -- crea el de este mes (no duplica)
    return jsonb_build_object('ok', true, 'id', 'f' || v_id);
  end if;
  insert into public.gastos (restaurante_id, fecha, categoria, descripcion, monto, prorratear, registrado_por)
  values (p_restaurante, v_hoy, p_categoria, trim(p_nombre), p_monto, false, p_usuario) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', 'g' || v_id);
end $$;

-- Cambia el monto. En un gasto fijo cambia la plantilla y el gasto de este mes; los meses pasados no se tocan.
create or replace function public.actualizar_gasto(p_restaurante uuid, p_id text, p_monto numeric)
returns jsonb language plpgsql set search_path = '' as $$
declare v_n bigint; v_mes date := date_trunc('month', now() at time zone 'America/Lima')::date; c int;
begin
  if p_monto is null or p_monto < 0 then raise exception 'El monto no es válido'; end if;
  if left(p_id, 1) not in ('f', 'g') then raise exception 'Identificador de gasto inválido'; end if;
  v_n := substr(p_id, 2)::bigint;
  if left(p_id, 1) = 'f' then
    update public.gastos_fijos set monto = p_monto where id = v_n and restaurante_id = p_restaurante;
    get diagnostics c = row_count;
    if c = 0 then raise exception 'El gasto no existe'; end if;
    update public.gastos set monto = p_monto where gasto_fijo_id = v_n and periodo = v_mes;
  else
    update public.gastos set monto = p_monto where id = v_n and restaurante_id = p_restaurante and gasto_fijo_id is null;
    get diagnostics c = row_count;
    if c = 0 then raise exception 'El gasto no existe'; end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Quita un gasto. Un fijo se desactiva (y sale de este mes); los meses pasados se conservan.
create or replace function public.quitar_gasto(p_restaurante uuid, p_id text)
returns jsonb language plpgsql set search_path = '' as $$
declare v_n bigint; v_mes date := date_trunc('month', now() at time zone 'America/Lima')::date; c int;
begin
  if left(p_id, 1) not in ('f', 'g') then raise exception 'Identificador de gasto inválido'; end if;
  v_n := substr(p_id, 2)::bigint;
  if left(p_id, 1) = 'f' then
    update public.gastos_fijos set activo = false where id = v_n and restaurante_id = p_restaurante and activo;
    get diagnostics c = row_count;
    if c = 0 then raise exception 'El gasto no existe'; end if;
    delete from public.gastos where gasto_fijo_id = v_n and periodo = v_mes;
  else
    delete from public.gastos where id = v_n and restaurante_id = p_restaurante and gasto_fijo_id is null;
    get diagnostics c = row_count;
    if c = 0 then raise exception 'El gasto no existe'; end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Vistas ----------

-- Ventas de hoy (hora de Lima) con sus platos: la forma que espera la pantalla "Ventas de hoy".
create view public.ventas_hoy with (security_invoker = true) as
select
  v.id, v.restaurante_id, v.fecha, v.tipo, v.mesa, v.metodo_pago, v.total, v.estado,
  coalesce((
    select jsonb_agg(jsonb_build_object('plato_id', d.plato_id, 'nombre', p.nombre,
                                         'cantidad', d.cantidad, 'precio_unitario', d.precio_unitario) order by d.id)
    from public.venta_detalle d join public.platos p on p.id = d.plato_id
    where d.venta_id = v.id
  ), '[]'::jsonb) as items
from public.ventas v
where (v.fecha at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date;

-- El estado es el texto que muestra la app.
create or replace view public.insumos_por_vencer with (security_invoker = true) as
select i.id as insumo_id, i.restaurante_id, i.nombre, i.stock, i.unidad,
       c.fecha as comprado_el, c.vence_el,
       c.vence_el - (now() at time zone 'America/Lima')::date as dias_restantes,
       case
         when c.vence_el < (now() at time zone 'America/Lima')::date then 'Vencido'
         when c.vence_el = (now() at time zone 'America/Lima')::date then 'Vence hoy'
         when c.vence_el = (now() at time zone 'America/Lima')::date + 1 then 'Vence mañana'
         else 'Vence en 2 días'
       end as estado
from public.insumos i
join lateral (
  select fecha, vence_el from public.compras c
  where c.insumo_id = i.id and c.vence_el is not null
  order by c.fecha desc limit 1
) c on true
where i.activo and i.vida_util_dias is not null and i.stock > 0
  and c.vence_el <= (now() at time zone 'America/Lima')::date + 2;

-- Solo el backend (service role) puede ejecutar estas funciones.
revoke execute on function public.guardar_plato(uuid, bigint, text, text, numeric, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.crear_insumo(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.importar_insumos(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.crear_gasto(uuid, uuid, text, text, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.actualizar_gasto(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.quitar_gasto(uuid, text) from public, anon, authenticated;
