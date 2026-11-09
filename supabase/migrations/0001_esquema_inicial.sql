-- =====================================================================
-- 0001_esquema_inicial.sql
-- Aplicado en el proyecto Supabase "Tesis_Reabastecimiento" el 9-nov-2026.
--
-- Reglas del diseño
--  * Todo se guarda en unidad base (g, ml, unid). Costos en S/ por unidad base.
--  * El stock NO se edita a mano: sale de `movimientos_inventario` (libro de
--    movimientos). Cada venta, compra, merma o ajuste inserta un movimiento y
--    un trigger actualiza insumos.stock. Así todo cambio queda auditado.
--  * Solo el backend escribe (service role). Los usuarios autenticados
--    únicamente pueden LEER filas de su restaurante (RLS).
--  * Hora local de los reportes: America/Lima.
-- =====================================================================

-- ---------- Tablas base ----------

create table public.restaurantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

create table public.perfiles (
  user_id uuid primary key references auth.users on delete cascade,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  nombre text,
  rol text not null default 'admin' check (rol in ('admin', 'empleado'))
);
create index on public.perfiles (restaurante_id);

-- Devuelve el restaurante del usuario autenticado (lo usan las políticas RLS).
create or replace function public.mi_restaurante() returns uuid
language sql stable security definer set search_path = '' as $$
  select restaurante_id from public.perfiles where user_id = auth.uid()
$$;

create table public.proveedores (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  nombre text not null,
  telefono text,
  dias_entrega text,                       -- texto libre, ej. "martes y viernes"
  lead_time_dias int not null default 1,
  notas text
);
create index on public.proveedores (restaurante_id);

create table public.insumos (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  nombre text not null,
  unidad text not null check (unidad in ('g', 'ml', 'unid')),
  costo_unitario numeric not null default 0 check (costo_unitario >= 0),
  stock numeric not null default 0,         -- lo mantiene el trigger de movimientos
  punto_reorden numeric not null default 0,
  lead_time_dias int not null default 1,
  presentacion_compra numeric not null default 1 check (presentacion_compra > 0),
  vida_util_dias int check (vida_util_dias > 0),  -- días que dura tras la compra; null = no vence
  en_recetas boolean not null default true, -- false = uso general (servilletas, bolsas...)
  proveedor_id bigint references public.proveedores on delete set null,
  activo boolean not null default true,
  unique (restaurante_id, nombre)
);
create index on public.insumos (proveedor_id);

create table public.platos (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  nombre text not null,
  categoria text not null check (categoria in ('Menú', 'Carta', 'Bebidas')),
  precio numeric(10, 2) not null check (precio >= 0),
  activo boolean not null default true,
  unique (restaurante_id, nombre)
);

create table public.recetas (               -- cuánto lleva UN plato
  plato_id bigint not null references public.platos on delete cascade,
  insumo_id bigint not null references public.insumos on delete restrict,
  cantidad numeric not null check (cantidad > 0),
  primary key (plato_id, insumo_id)
);
create index on public.recetas (insumo_id);

-- ---------- Ventas ----------

create table public.ventas (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  fecha timestamptz not null default now(),
  mesa text,
  tipo text not null default 'mesa' check (tipo in ('mesa', 'llevar')),
  metodo_pago text not null default 'efectivo' check (metodo_pago in ('efectivo', 'yape_plin', 'tarjeta')),
  total numeric(10, 2) not null check (total >= 0),
  estado text not null default 'activa' check (estado in ('activa', 'anulada')),
  anulada_at timestamptz,                   -- la completa el backend al anular
  motivo_anulacion text,
  registrado_por uuid references auth.users on delete set null
);

create table public.venta_detalle (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas on delete cascade,
  plato_id bigint not null references public.platos on delete restrict,
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0)
);

-- ---------- Compras y libro de movimientos ----------

create table public.compras (               -- una fila por insumo comprado
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  insumo_id bigint not null references public.insumos on delete restrict,
  proveedor_id bigint references public.proveedores on delete set null,
  cantidad numeric not null check (cantidad > 0),
  costo_total numeric(10, 2) not null check (costo_total >= 0),
  fecha timestamptz not null default now(),
  vence_el date,                            -- lo calcula el trigger con insumos.vida_util_dias
  registrado_por uuid references auth.users on delete set null
);

create table public.movimientos_inventario (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  insumo_id bigint not null references public.insumos on delete restrict,
  tipo text not null check (tipo in ('venta', 'anulacion', 'compra', 'merma', 'consumo_propio', 'ajuste')),
  cantidad numeric not null,                -- con signo: + entra, − sale (unidad base)
  motivo text,
  venta_id bigint references public.ventas on delete set null,
  compra_id bigint references public.compras on delete set null,
  fecha timestamptz not null default now(),
  registrado_por uuid references auth.users on delete set null
);

-- ---------- Gastos, contexto del negocio, agente y evidencia del piloto ----------

create table public.gastos_fijos (          -- plantilla de lo que se paga cada mes
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  nombre text not null,                     -- "Luz", "Alquiler", "Sueldo cocinera"...
  categoria text not null check (categoria in ('alquiler', 'servicios', 'sueldos', 'otros')),
  monto numeric(10, 2) not null check (monto >= 0),
  dia_mes int not null default 1 check (dia_mes between 1 and 31),
  activo boolean not null default true
);

create table public.gastos (                -- lo que realmente se gasta; alimenta la ganancia neta
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  fecha date not null default current_date,
  categoria text not null check (categoria in ('alquiler', 'servicios', 'sueldos', 'otros')),
  descripcion text,
  monto numeric(10, 2) not null check (monto >= 0),
  prorratear boolean not null default false, -- true: el monto se reparte entre los días de su mes
  gasto_fijo_id bigint references public.gastos_fijos on delete set null,
  periodo date generated always as (fecha - (extract(day from fecha)::int - 1)) stored, -- 1.º del mes
  registrado_por uuid references auth.users on delete set null
);
create unique index on public.gastos (gasto_fijo_id, periodo) where gasto_fijo_id is not null;

create table public.notas_negocio (         -- contexto que el motor no puede saber
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  texto text not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,                       -- null = sin vencimiento
  origen text not null default 'chat' check (origen in ('manual', 'chat')),
  creado_por uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Lo que el agente propone y el usuario aún no confirma. Nada se ejecuta sin confirmar.
create table public.acciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  tipo text not null check (tipo in ('venta', 'compra', 'merma', 'consumo_propio', 'nota', 'lista_item')),
  payload jsonb not null,                   -- datos ya validados por el backend
  resumen text not null,                    -- texto mostrado en la tarjeta de confirmación
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'cancelada', 'expirada')),
  created_at timestamptz not null default now(),
  resuelta_at timestamptz
);

create table public.log_chat (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  user_id uuid references auth.users on delete set null,
  texto text not null,
  funcion text,
  resultado jsonb,
  respuesta text,
  ok boolean not null default true,
  ms int,
  created_at timestamptz not null default now()
);

create table public.lista_compras_eventos (
  id bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes on delete cascade,
  user_id uuid references auth.users on delete set null,
  tipo text not null check (tipo in ('generada', 'pdf', 'compartida', 'marcada', 'ajustada', 'extra_agregada', 'insumo_creado', 'comprada')),
  detalle jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Índices de apoyo (llaves foráneas y consultas por restaurante y fecha)
create index on public.ventas (restaurante_id, fecha);
create index on public.venta_detalle (venta_id);
create index on public.venta_detalle (plato_id);
create index on public.compras (restaurante_id, fecha);
create index on public.compras (insumo_id);
create index on public.compras (proveedor_id);
create index on public.movimientos_inventario (restaurante_id, fecha);
create index on public.movimientos_inventario (insumo_id);
create index on public.movimientos_inventario (venta_id);
create index on public.movimientos_inventario (compra_id);
create index on public.gastos (restaurante_id, fecha);
create index on public.gastos (gasto_fijo_id);
create index on public.gastos_fijos (restaurante_id);
create index on public.notas_negocio (restaurante_id);
create index on public.acciones_pendientes (restaurante_id);
create index on public.acciones_pendientes (user_id);
create index on public.log_chat (restaurante_id, created_at);
create index on public.lista_compras_eventos (restaurante_id);

-- ---------- Triggers: la base de datos hace los cálculos ----------

-- 1) Todo movimiento actualiza el stock.
create or replace function public.trg_movimiento_aplica_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.insumos set stock = stock + new.cantidad where id = new.insumo_id;
  return new;
end $$;

create trigger movimiento_aplica_stock
  after insert on public.movimientos_inventario
  for each row execute function public.trg_movimiento_aplica_stock();

-- 2) Una venta descuenta, por cada plato, los insumos de su receta.
create or replace function public.trg_venta_detalle_descuenta() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_rest uuid;
  v_user uuid;
begin
  select restaurante_id, registrado_por into v_rest, v_user from public.ventas where id = new.venta_id;
  insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, venta_id, registrado_por)
  select v_rest, r.insumo_id, 'venta', -(r.cantidad * new.cantidad), new.venta_id, v_user
  from public.recetas r
  where r.plato_id = new.plato_id;
  return new;
end $$;

create trigger venta_detalle_descuenta
  after insert on public.venta_detalle
  for each row execute function public.trg_venta_detalle_descuenta();

-- 3) Una compra suma al stock y actualiza el costo con el último precio pagado.
create or replace function public.trg_compra_suma() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, compra_id, registrado_por)
  values (new.restaurante_id, new.insumo_id, 'compra', new.cantidad, new.id, new.registrado_por);
  update public.insumos set costo_unitario = new.costo_total / new.cantidad where id = new.insumo_id;
  return new;
end $$;

-- Calcula cuándo vence lo que se compra, según la vida útil del insumo.
create or replace function public.trg_compra_vence() returns trigger
language plpgsql set search_path = '' as $$
declare v_dias int;
begin
  select vida_util_dias into v_dias from public.insumos where id = new.insumo_id;
  if v_dias is not null and new.vence_el is null then
    new.vence_el := (new.fecha at time zone 'America/Lima')::date + v_dias;
  end if;
  return new;
end $$;

create trigger compra_vence
  before insert on public.compras
  for each row execute function public.trg_compra_vence();

create trigger compra_suma
  after insert on public.compras
  for each row execute function public.trg_compra_suma();

-- 4) Anular una venta devuelve los insumos con movimientos inversos (no se borra nada).
create or replace function public.trg_venta_anula() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.estado = 'activa' and new.estado = 'anulada' then
    insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo, venta_id, registrado_por)
    select restaurante_id, insumo_id, 'anulacion', -cantidad, 'Venta anulada', venta_id, new.registrado_por
    from public.movimientos_inventario
    where venta_id = old.id and tipo = 'venta';
  end if;
  return new;
end $$;

create trigger venta_anula
  after update of estado on public.ventas
  for each row execute function public.trg_venta_anula();

-- Crea los gastos del mes a partir de gastos_fijos. Se puede llamar varias veces:
-- no duplica lo que ya existe. Solo la puede llamar el backend (service role).
create or replace function public.generar_gastos_mes(p_restaurante uuid, p_mes date) returns int
language plpgsql set search_path = '' as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
  v_dias int := extract(day from (v_ini + interval '1 month' - interval '1 day'))::int;
  v_n int;
begin
  insert into public.gastos (restaurante_id, fecha, categoria, descripcion, monto, prorratear, gasto_fijo_id)
  select f.restaurante_id, v_ini + (least(f.dia_mes, v_dias) - 1), f.categoria, f.nombre, f.monto, true, f.id
  from public.gastos_fijos f
  where f.restaurante_id = p_restaurante and f.activo
  on conflict (gasto_fijo_id, periodo) where gasto_fijo_id is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Las funciones de trigger y de mantenimiento no deben poder llamarse desde la API pública.
revoke execute on function public.trg_movimiento_aplica_stock() from public, anon, authenticated;
revoke execute on function public.trg_venta_detalle_descuenta() from public, anon, authenticated;
revoke execute on function public.trg_compra_suma() from public, anon, authenticated;
revoke execute on function public.trg_compra_vence() from public, anon, authenticated;
revoke execute on function public.trg_venta_anula() from public, anon, authenticated;
revoke execute on function public.generar_gastos_mes(uuid, date) from public, anon, authenticated;
-- mi_restaurante() la usan las políticas RLS: solo usuarios autenticados.
revoke execute on function public.mi_restaurante() from public, anon;

-- ---------- Vistas (security_invoker: respetan RLS del usuario) ----------

create view public.margen_por_plato with (security_invoker = true) as
select
  p.id as plato_id, p.restaurante_id, p.nombre, p.categoria, p.precio, p.activo,
  coalesce(sum(r.cantidad * i.costo_unitario), 0) as costo,
  p.precio - coalesce(sum(r.cantidad * i.costo_unitario), 0) as ganancia,
  case when p.precio > 0
    then round((p.precio - coalesce(sum(r.cantidad * i.costo_unitario), 0)) / p.precio * 100, 1)
  end as margen_pct
from public.platos p
left join public.recetas r on r.plato_id = p.id
left join public.insumos i on i.id = r.insumo_id
group by p.id;

create view public.insumos_por_agotarse with (security_invoker = true) as
select
  id as insumo_id, restaurante_id, nombre, unidad, stock, punto_reorden,
  case when stock <= punto_reorden * 0.5 then 'Crítico' else 'Bajo' end as nivel
from public.insumos
where activo and en_recetas and stock <= punto_reorden;

-- Entrada del motor de pronóstico: consumo por insumo y día (solo ventas activas).
create view public.consumo_diario_insumo with (security_invoker = true) as
select
  v.restaurante_id, r.insumo_id,
  (v.fecha at time zone 'America/Lima')::date as dia,
  sum(d.cantidad * r.cantidad) as consumo
from public.ventas v
join public.venta_detalle d on d.venta_id = v.id
join public.recetas r on r.plato_id = d.plato_id
where v.estado = 'activa'
group by v.restaurante_id, r.insumo_id, (v.fecha at time zone 'America/Lima')::date;

create view public.ventas_por_plato_dia with (security_invoker = true) as
select
  v.restaurante_id, d.plato_id,
  (v.fecha at time zone 'America/Lima')::date as dia,
  sum(d.cantidad) as cantidad,
  sum(d.cantidad * d.precio_unitario) as ventas
from public.ventas v
join public.venta_detalle d on d.venta_id = v.id
where v.estado = 'activa'
group by v.restaurante_id, d.plato_id, (v.fecha at time zone 'America/Lima')::date;

-- Ganancia por día (costo con el precio actual de los insumos).
create view public.ganancia_por_dia with (security_invoker = true) as
select
  v.restaurante_id,
  (v.fecha at time zone 'America/Lima')::date as dia,
  sum(d.cantidad * d.precio_unitario) as ventas,
  sum(d.cantidad * m.costo) as costo,
  sum(d.cantidad * (d.precio_unitario - m.costo)) as ganancia
from public.ventas v
join public.venta_detalle d on d.venta_id = v.id
join public.margen_por_plato m on m.plato_id = d.plato_id
where v.estado = 'activa'
group by v.restaurante_id, (v.fecha at time zone 'America/Lima')::date;

-- Gastos repartidos por día: un gasto mensual (prorratear) cuenta 1/30 cada día.
-- Sumando un rango de días se obtiene el gasto de esa semana o mes.
create view public.gastos_por_dia with (security_invoker = true) as
select g.restaurante_id, d::date as dia, g.id as gasto_id, g.categoria, g.descripcion,
       g.monto / extract(day from (g.periodo + interval '1 month' - interval '1 day')) as monto
from public.gastos g
cross join lateral generate_series(g.periodo, (g.periodo + interval '1 month' - interval '1 day')::date, interval '1 day') d
where g.prorratear
union all
select g.restaurante_id, g.fecha, g.id, g.categoria, g.descripcion, g.monto
from public.gastos g
where not g.prorratear;

-- Costo de mermas y uso propio por día (parte del costo real de insumos).
create view public.perdidas_por_dia with (security_invoker = true) as
select m.restaurante_id, (m.fecha at time zone 'America/Lima')::date as dia, m.tipo,
       sum(-m.cantidad * i.costo_unitario) as costo
from public.movimientos_inventario m
join public.insumos i on i.id = m.insumo_id
where m.tipo in ('merma', 'consumo_propio')
group by m.restaurante_id, (m.fecha at time zone 'America/Lima')::date, m.tipo;

-- Aproximado: asume que el stock actual viene de la última compra.
create view public.insumos_por_vencer with (security_invoker = true) as
select i.id as insumo_id, i.restaurante_id, i.nombre, i.stock, i.unidad,
       c.fecha as comprado_el, c.vence_el,
       c.vence_el - (now() at time zone 'America/Lima')::date as dias_restantes,
       case when c.vence_el < (now() at time zone 'America/Lima')::date then 'Vencido' else 'Por vencer' end as estado
from public.insumos i
join lateral (
  select fecha, vence_el from public.compras c
  where c.insumo_id = i.id and c.vence_el is not null
  order by c.fecha desc limit 1
) c on true
where i.activo and i.vida_util_dias is not null and i.stock > 0
  and c.vence_el <= (now() at time zone 'America/Lima')::date + 2;

create view public.resumen_hoy with (security_invoker = true) as
select
  rs.id as restaurante_id,
  coalesce((
    select sum(d.cantidad) from public.venta_detalle d join public.ventas v on v.id = d.venta_id
    where v.restaurante_id = rs.id and v.estado = 'activa'
      and (v.fecha at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
  ), 0)::int as platos,
  coalesce((
    select sum(d.cantidad * d.precio_unitario) from public.venta_detalle d join public.ventas v on v.id = d.venta_id
    where v.restaurante_id = rs.id and v.estado = 'activa'
      and (v.fecha at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
  ), 0) as total
from public.restaurantes rs;

-- ---------- Seguridad (RLS): los usuarios solo LEEN lo de su restaurante ----------

do $$
declare t text;
begin
  foreach t in array array[
    'proveedores', 'insumos', 'platos', 'ventas', 'compras', 'movimientos_inventario',
    'gastos', 'gastos_fijos', 'notas_negocio', 'acciones_pendientes', 'log_chat', 'lista_compras_eventos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "leer lo propio" on public.%I for select to authenticated using (restaurante_id = (select public.mi_restaurante()))', t);
  end loop;
end $$;

alter table public.restaurantes enable row level security;
create policy "leer lo propio" on public.restaurantes for select to authenticated
  using (id = (select public.mi_restaurante()));

alter table public.perfiles enable row level security;
create policy "leer perfil propio" on public.perfiles for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.recetas enable row level security;
create policy "leer lo propio" on public.recetas for select to authenticated
  using (exists (select 1 from public.platos p where p.id = plato_id and p.restaurante_id = (select public.mi_restaurante())));

alter table public.venta_detalle enable row level security;
create policy "leer lo propio" on public.venta_detalle for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id and v.restaurante_id = (select public.mi_restaurante())));

-- Nota: sin políticas de INSERT/UPDATE/DELETE, solo el backend (service role) escribe.
-- El backend siempre toma restaurante_id del token validado, nunca del cuerpo ni del LLM.
