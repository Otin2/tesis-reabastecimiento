-- =====================================================================
-- 0004_funciones_y_vistas_para_la_api.sql
-- Aplicado en "Tesis_Reabastecimiento" el 9-nov-2026.
--
-- Deja la base lista para el backend (FastAPI):
--  A) Integridad: nunca se mezclan datos de restaurantes distintos, ni por error del backend.
--  B) Funciones (RPC): cada operación de escritura es UNA transacción en la base. El backend
--     solo las llama; los precios salen de la tabla, no del cliente. Solo las puede ejecutar
--     el backend (service role), no los usuarios ni el público.
--  C) Vistas con los números que muestra la app (días de stock, lista de compras sugerida).
-- =====================================================================

-- ---------- A) Integridad entre restaurantes ----------

create or replace function public.trg_check_tenant() returns trigger
language plpgsql set search_path = '' as $$
declare ok boolean := true;
begin
  if tg_table_name = 'recetas' then
    ok := (select restaurante_id from public.platos where id = new.plato_id)
        = (select restaurante_id from public.insumos where id = new.insumo_id);
  elsif tg_table_name = 'venta_detalle' then
    ok := (select restaurante_id from public.ventas where id = new.venta_id)
        = (select restaurante_id from public.platos where id = new.plato_id);
  elsif tg_table_name in ('compras', 'movimientos_inventario') then
    ok := (select restaurante_id from public.insumos where id = new.insumo_id) = new.restaurante_id;
  end if;
  if not coalesce(ok, false) then
    raise exception 'Los datos pertenecen a restaurantes distintos (%)', tg_table_name;
  end if;
  return new;
end $$;

create trigger check_tenant before insert or update on public.recetas
  for each row execute function public.trg_check_tenant();
create trigger check_tenant before insert or update on public.venta_detalle
  for each row execute function public.trg_check_tenant();
create trigger check_tenant before insert or update on public.compras
  for each row execute function public.trg_check_tenant();
create trigger check_tenant before insert or update on public.movimientos_inventario
  for each row execute function public.trg_check_tenant();

-- ---------- B) Funciones de escritura (solo el backend) ----------

-- Registra una venta. Los precios y el total salen de la tabla de platos.
-- p_items: [{"plato_id": 2, "cantidad": 3}, ...]
create or replace function public.registrar_venta(
  p_restaurante uuid, p_usuario uuid, p_items jsonb,
  p_metodo text default 'efectivo', p_tipo text default 'mesa', p_mesa text default null
) returns jsonb language plpgsql set search_path = '' as $$
declare v_id bigint; v_total numeric(10, 2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene platos';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(plato_id bigint, cantidad int)
    left join public.platos p on p.id = x.plato_id and p.restaurante_id = p_restaurante and p.activo
    where p.id is null or x.cantidad is null or x.cantidad <= 0
  ) then
    raise exception 'Hay platos que no existen, están inactivos o tienen una cantidad inválida';
  end if;

  insert into public.ventas (restaurante_id, total, metodo_pago, tipo, mesa, registrado_por)
  values (p_restaurante, 0, p_metodo, p_tipo, nullif(trim(p_mesa), ''), p_usuario)
  returning id into v_id;

  insert into public.venta_detalle (venta_id, plato_id, cantidad, precio_unitario)
  select v_id, p.id, sum(x.cantidad)::int, p.precio
  from jsonb_to_recordset(p_items) as x(plato_id bigint, cantidad int)
  join public.platos p on p.id = x.plato_id
  group by p.id, p.precio;

  select sum(cantidad * precio_unitario) into v_total from public.venta_detalle where venta_id = v_id;
  update public.ventas set total = v_total where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'total', v_total);
end $$;

-- Anula una venta: los insumos vuelven al stock (lo hace el trigger venta_anula).
create or replace function public.anular_venta(p_restaurante uuid, p_venta bigint, p_motivo text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  select estado into v_estado from public.ventas where id = p_venta and restaurante_id = p_restaurante;
  if v_estado is null then raise exception 'La venta no existe'; end if;
  if v_estado = 'anulada' then raise exception 'La venta ya está anulada'; end if;
  update public.ventas
     set estado = 'anulada', anulada_at = now(), motivo_anulacion = nullif(trim(p_motivo), '')
   where id = p_venta;
  return jsonb_build_object('ok', true);
end $$;

-- Registra compras: sube el stock y actualiza el costo con el último precio pagado.
-- p_lineas: [{"insumo_id": 1, "cantidad": 5000, "costo_total": 60}, ...]
create or replace function public.registrar_compra(
  p_restaurante uuid, p_usuario uuid, p_lineas jsonb, p_proveedor bigint default null
) returns jsonb language plpgsql set search_path = '' as $$
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra no tiene insumos';
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

-- Ajusta el stock de un insumo.
--  'ajuste'          p_cantidad = stock real contado
--  'merma' / 'consumo_propio'  p_cantidad = lo que sale (no baja de 0)
create or replace function public.ajustar_stock(
  p_restaurante uuid, p_usuario uuid, p_insumo bigint, p_tipo text, p_cantidad numeric, p_motivo text default null
) returns jsonb language plpgsql set search_path = '' as $$
declare v_stock numeric; v_en boolean; v_mov numeric;
begin
  select stock, en_recetas into v_stock, v_en from public.insumos where id = p_insumo and restaurante_id = p_restaurante;
  if not found then raise exception 'El insumo no existe'; end if;
  if not v_en then raise exception 'Este insumo es de uso general y no lleva stock'; end if;

  if p_tipo = 'ajuste' then
    if p_cantidad is null or p_cantidad < 0 then raise exception 'El stock contado no puede ser negativo'; end if;
    v_mov := p_cantidad - v_stock;
  elsif p_tipo in ('merma', 'consumo_propio') then
    if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor que 0'; end if;
    v_mov := -least(p_cantidad, greatest(v_stock, 0));
  else
    raise exception 'Tipo de ajuste inválido';
  end if;

  if v_mov <> 0 then
    insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo, registrado_por)
    values (p_restaurante, p_insumo, p_tipo, v_mov, nullif(trim(p_motivo), ''), p_usuario);
  end if;
  return jsonb_build_object('ok', true, 'stock', (select stock from public.insumos where id = p_insumo));
end $$;

-- Confirma una acción que el agente propuso. Solo aquí se escribe en la base.
create or replace function public.confirmar_accion(p_restaurante uuid, p_usuario uuid, p_accion uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare a record; r jsonb; msg text;
begin
  select * into a from public.acciones_pendientes
   where id = p_accion and restaurante_id = p_restaurante and user_id = p_usuario for update;
  if not found then raise exception 'La acción no existe'; end if;
  if a.estado <> 'pendiente' then raise exception 'La acción ya está %', a.estado; end if;

  if a.tipo = 'venta' then
    r := public.registrar_venta(p_restaurante, p_usuario, a.payload -> 'items',
           coalesce(a.payload ->> 'metodo_pago', 'efectivo'), coalesce(a.payload ->> 'tipo', 'mesa'), a.payload ->> 'mesa');
    msg := 'Venta registrada. Total S/ ' || to_char((r ->> 'total')::numeric, 'FM999990.00');
  elsif a.tipo = 'compra' then
    perform public.registrar_compra(p_restaurante, p_usuario, a.payload -> 'lineas');
    msg := 'Compra registrada. El stock y el costo se actualizaron.';
  elsif a.tipo in ('merma', 'consumo_propio') then
    perform public.ajustar_stock(p_restaurante, p_usuario, (a.payload ->> 'insumo_id')::bigint, a.tipo,
              (a.payload ->> 'cantidad')::numeric, a.payload ->> 'motivo');
    msg := 'Anotado. El stock bajó.';
  elsif a.tipo = 'nota' then
    insert into public.notas_negocio (restaurante_id, texto, origen, creado_por)
    values (p_restaurante, a.payload ->> 'texto', 'chat', p_usuario);
    msg := 'Anotado. Lo tendré en cuenta en las recomendaciones.';
  else
    raise exception 'Este tipo de acción no se guarda en la base';
  end if;

  update public.acciones_pendientes set estado = 'confirmada', resuelta_at = now() where id = p_accion;
  return jsonb_build_object('ok', true, 'mensaje', msg);
end $$;

-- Solo el backend (service role) puede ejecutar estas funciones.
revoke execute on function public.trg_check_tenant() from public, anon, authenticated;
revoke execute on function public.registrar_venta(uuid, uuid, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.anular_venta(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.registrar_compra(uuid, uuid, jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.ajustar_stock(uuid, uuid, bigint, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.confirmar_accion(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------- C) Vistas con los números de la app ----------

-- Uso diario promedio de cada insumo en los últimos 28 días.
create view public.uso_diario_insumo with (security_invoker = true) as
select restaurante_id, insumo_id, sum(consumo) / 28.0 as uso_diario
from public.consumo_diario_insumo
where dia > (now() at time zone 'America/Lima')::date - 28
group by restaurante_id, insumo_id;

-- Estado de cada insumo: nivel y "alcanza X días" (stock ÷ uso diario). Los de uso general no llevan stock.
create view public.insumos_resumen with (security_invoker = true) as
select
  i.id, i.restaurante_id, i.nombre, i.unidad,
  case when i.en_recetas then i.stock end as stock,
  case when i.en_recetas then i.punto_reorden end as punto_reorden,
  i.presentacion_compra, i.costo_unitario, i.en_recetas, i.vida_util_dias, i.activo, i.proveedor_id,
  case when i.en_recetas and i.stock <= i.punto_reorden
       then case when i.stock <= i.punto_reorden * 0.5 then 'Crítico' else 'Bajo' end end as nivel,
  case when i.en_recetas and u.uso_diario > 0 then round(greatest(i.stock, 0) / u.uso_diario, 1) end as dias_restantes
from public.insumos i
left join public.uso_diario_insumo u on u.insumo_id = i.id;

-- Fase 1 del PLAN: cantidad = punto_reorden × 2 − stock, redondeada hacia arriba a la presentación de compra.
create view public.lista_compras_sugerida with (security_invoker = true) as
select
  r.id as insumo_id, r.restaurante_id, r.nombre, r.unidad, r.nivel, r.stock, r.dias_restantes,
  r.presentacion_compra, r.costo_unitario,
  ceil((r.punto_reorden * 2 - r.stock) / r.presentacion_compra) * r.presentacion_compra as cantidad,
  round(ceil((r.punto_reorden * 2 - r.stock) / r.presentacion_compra) * r.presentacion_compra * r.costo_unitario, 2) as costo_estimado
from public.insumos_resumen r
where r.activo and r.nivel is not null;
