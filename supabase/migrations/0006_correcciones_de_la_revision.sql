-- =====================================================================
-- 0006_correcciones_de_la_revision.sql
-- Aplicado en "Tesis_Reabastecimiento" el 16-nov-2026 (ensayado antes en una transacción que se deshizo).
--
-- Corrige lo que encontró la revisión del 16-nov-2026:
--  1) consumo_diario_insumo   sale del libro de movimientos (lo que realmente se descontó),
--                             no de ventas × la receta de hoy. Editar una receta ya no cambia
--                             el consumo pasado, que es la entrada del motor de pronóstico.
--  2) uso_diario_insumo       divide entre los días que el restaurante lleva vendiendo
--                             (máximo 28), no siempre entre 28. Un restaurante nuevo ya no ve
--                             un "alcanza X días" inflado durante sus primeras semanas.
--  3) Fechas por defecto      gastos.fecha y notas_negocio.vigente_desde usan la fecha de Lima.
--  4) crear_insumo            acepta vida_util_dias con decimales (la redondea).
--  5) ajustar_stock           una merma o uso propio sin stock da un error claro en vez de
--                             no registrar nada en silencio.
-- =====================================================================

-- ---------- 1) Consumo por insumo y día, desde el libro de movimientos ----------
-- Se usa la fecha de la venta (no la del movimiento) y solo ventas activas.
create or replace view public.consumo_diario_insumo with (security_invoker = true) as
select
  m.restaurante_id, m.insumo_id,
  (v.fecha at time zone 'America/Lima')::date as dia,
  sum(-m.cantidad) as consumo
from public.movimientos_inventario m
join public.ventas v on v.id = m.venta_id
where m.tipo = 'venta' and v.estado = 'activa'
group by m.restaurante_id, m.insumo_id, (v.fecha at time zone 'America/Lima')::date;

-- ---------- 2) Uso diario promedio: últimos 28 días o los que haya ----------
-- Los días se cuentan desde la primera venta del restaurante hasta hoy (ambos incluidos).
create or replace view public.uso_diario_insumo with (security_invoker = true) as
select
  c.restaurante_id, c.insumo_id,
  sum(c.consumo) / least(28, greatest(1, (now() at time zone 'America/Lima')::date - p.primer_dia + 1))::numeric as uso_diario
from public.consumo_diario_insumo c
join (
  select restaurante_id, min((fecha at time zone 'America/Lima')::date) as primer_dia
  from public.ventas
  where estado = 'activa'
  group by restaurante_id
) p on p.restaurante_id = c.restaurante_id
where c.dia > (now() at time zone 'America/Lima')::date - 28
group by c.restaurante_id, c.insumo_id, p.primer_dia;

-- ---------- 3) Fechas por defecto en hora de Lima ----------
alter table public.gastos
  alter column fecha set default ((now() at time zone 'America/Lima')::date);
alter table public.notas_negocio
  alter column vigente_desde set default ((now() at time zone 'America/Lima')::date);

-- ---------- 4) crear_insumo: vida útil con decimales ----------
create or replace function public.crear_insumo(p_restaurante uuid, p_usuario uuid, p_datos jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_id bigint;
  v_en boolean := coalesce((p_datos ->> 'en_recetas')::boolean, true);
  v_stock numeric := coalesce((p_datos ->> 'stock')::numeric, 0);
  v_vida numeric := nullif(p_datos ->> 'vida_util_dias', '')::numeric;
begin
  insert into public.insumos (restaurante_id, nombre, unidad, costo_unitario, presentacion_compra, punto_reorden, vida_util_dias, en_recetas)
  values (
    p_restaurante, trim(p_datos ->> 'nombre'), p_datos ->> 'unidad',
    (p_datos ->> 'costo_unitario')::numeric, (p_datos ->> 'presentacion_compra')::numeric,
    case when v_en then coalesce((p_datos ->> 'punto_reorden')::numeric, 0) else 0 end,
    case when v_vida > 0 then greatest(1, round(v_vida))::int end, v_en
  ) returning id into v_id;

  if v_en and v_stock > 0 then
    insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo, registrado_por)
    values (p_restaurante, v_id, 'ajuste', v_stock, 'Stock inicial', p_usuario);
  end if;
  return (select to_jsonb(r) from public.insumos_resumen r where r.id = v_id);
end $$;

-- ---------- 5) ajustar_stock: merma sin stock = error claro ----------
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
    if v_stock <= 0 then raise exception 'No hay stock de este insumo para descontar'; end if;
    v_mov := -least(p_cantidad, v_stock);
  else
    raise exception 'Tipo de ajuste inválido';
  end if;

  if v_mov <> 0 then
    insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo, registrado_por)
    values (p_restaurante, p_insumo, p_tipo, v_mov, nullif(trim(p_motivo), ''), p_usuario);
  end if;
  return jsonb_build_object('ok', true, 'stock', (select stock from public.insumos where id = p_insumo));
end $$;

-- "create or replace" conserva los permisos, pero se repite por si se aplica en una base nueva.
revoke execute on function public.crear_insumo(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ajustar_stock(uuid, uuid, bigint, text, numeric, text) from public, anon, authenticated;
