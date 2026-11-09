-- =====================================================================
-- seed_demo.sql — datos INVENTADOS para la cuenta DEMO
--
-- Crea el restaurante "Restaurante Demo" con 6 platos, 13 insumos, recetas,
-- 8 semanas de ventas, compras, mermas, gastos y una nota. Todo es falso.
-- NO crea usuarios: después se vincula una cuenta de Supabase Auth (ver el final).
-- No toca ningún otro restaurante: la cuenta real de la hermana queda aparte y vacía.
-- Se puede ejecutar una sola vez (si la demo ya existe, se detiene).
-- =====================================================================

do $$
declare
  rest uuid;
  p1 bigint; p2 bigint; p3 bigint;                 -- proveedores
  ids bigint[] := '{}'; precios numeric[] := '{}';  -- platos y sus precios
  pesos int[] := array[30, 20, 15, 12, 10, 13];     -- popularidad relativa de cada plato
  pid bigint; pprecio numeric;
  hoy date := (now() at time zone 'America/Lima')::date;
  dia date; d int; k int; n int; l int; j int; w int;
  v bigint; r int; acc int; cant int; h int;
  rec record; jitter numeric;
begin
  if exists (select 1 from public.restaurantes where nombre = 'Restaurante Demo') then
    raise exception 'La demo ya existe. No se vuelve a cargar.';
  end if;

  insert into public.restaurantes (nombre) values ('Restaurante Demo') returning id into rest;

  insert into public.proveedores (restaurante_id, nombre, telefono, dias_entrega, lead_time_dias)
    values (rest, 'Mercado Central', '999 111 222', 'todos los días', 1) returning id into p1;
  insert into public.proveedores (restaurante_id, nombre, telefono, dias_entrega, lead_time_dias)
    values (rest, 'Bodega Don Lucho', '999 333 444', 'martes y viernes', 2) returning id into p2;

  -- Insumos (unidad base; costo en S/ por g o ml). El stock real se ajusta al final.
  insert into public.insumos (restaurante_id, nombre, unidad, costo_unitario, punto_reorden, presentacion_compra, vida_util_dias, proveedor_id, en_recetas) values
    (rest, 'Pollo',          'g',  0.012,  8000,  1000, 4,    p1, true),
    (rest, 'Papa amarilla',  'g',  0.0032, 15000, 5000, null, p1, true),
    (rest, 'Ají amarillo',   'g',  0.008,  2000,  500,  null, p1, true),
    (rest, 'Cebolla roja',   'g',  0.0028, 5000,  1000, null, p1, true),
    (rest, 'Carne de res',   'g',  0.035,  8000,  1000, null, p1, true),
    (rest, 'Arroz',          'g',  0.0045, 15000, 50000, null, p2, true),
    (rest, 'Aceite',         'ml', 0.009,  3000,  1000, null, p2, true),
    (rest, 'Tomate',         'g',  0.004,  3000,  1000, 6,    p1, true),
    (rest, 'Pescado',        'g',  0.03,   3000,  1000, 2,    p1, true),
    (rest, 'Limón',          'g',  0.006,  1500,  1000, null, p1, true),
    (rest, 'Maíz morado',    'g',  0.008,  1000,  1000, null, p2, true);
  -- Uso general: no entran en recetas, no llevan stock ni alertas.
  insert into public.insumos (restaurante_id, nombre, unidad, costo_unitario, presentacion_compra, en_recetas, proveedor_id) values
    (rest, 'Servilletas',        'unid', 0.03, 100, false, p2),
    (rest, 'Bolsas para llevar', 'unid', 0.10, 50,  false, p2);

  insert into public.platos (restaurante_id, nombre, categoria, precio) values
    (rest, 'Menú del día',          'Menú',    12),
    (rest, 'Lomo saltado',          'Carta',   22),
    (rest, 'Arroz con pollo',       'Carta',   16),
    (rest, 'Ají de gallina',        'Carta',   16),
    (rest, 'Ceviche',               'Carta',   25),
    (rest, 'Chicha morada (jarra)', 'Bebidas', 10);

  -- Recetas (cuánto lleva UN plato). El lomo coincide con el PLAN: costo 9.29, margen 57.8 %.
  insert into public.recetas (plato_id, insumo_id, cantidad)
  select p.id, i.id, x.c
  from (values
    ('Menú del día','Pollo',120),('Menú del día','Arroz',150),('Menú del día','Papa amarilla',100),('Menú del día','Aceite',15),('Menú del día','Cebolla roja',40),
    ('Lomo saltado','Carne de res',200),('Lomo saltado','Papa amarilla',250),('Lomo saltado','Arroz',150),('Lomo saltado','Tomate',80),('Lomo saltado','Aceite',30),('Lomo saltado','Cebolla roja',80),
    ('Arroz con pollo','Pollo',250),('Arroz con pollo','Arroz',180),('Arroz con pollo','Ají amarillo',30),('Arroz con pollo','Cebolla roja',60),('Arroz con pollo','Aceite',20),
    ('Ají de gallina','Pollo',200),('Ají de gallina','Papa amarilla',200),('Ají de gallina','Ají amarillo',50),('Ají de gallina','Arroz',150),('Ají de gallina','Aceite',20),
    ('Ceviche','Pescado',250),('Ceviche','Limón',60),('Ceviche','Cebolla roja',60),('Ceviche','Ají amarillo',20),
    ('Chicha morada (jarra)','Maíz morado',150),('Chicha morada (jarra)','Limón',20)
  ) x(plato, insumo, c)
  join public.platos p on p.nombre = x.plato and p.restaurante_id = rest
  join public.insumos i on i.nombre = x.insumo and i.restaurante_id = rest;

  select array_agg(id order by id), array_agg(precio order by id) into ids, precios
    from public.platos where restaurante_id = rest;

  -- 8 semanas de ventas: más en fin de semana, ruido y una leve tendencia al alza.
  for d in reverse 56..0 loop
    dia := hoy - d;
    if d = 0 then
      n := 6;                                                    -- hoy: solo la hora de almuerzo
    elsif extract(isodow from dia) in (5, 6, 7) then
      n := floor((14 + random() * 6) * (1 + (56 - d) / 400.0));
    else
      n := floor((8 + random() * 5) * (1 + (56 - d) / 400.0));
    end if;

    for k in 1..n loop
      h := case when d = 0 then 12 else 12 + floor(random() * 4)::int end;
      insert into public.ventas (restaurante_id, fecha, total, tipo, mesa, metodo_pago)
      values (
        rest,
        (dia::timestamp + make_interval(hours => h, mins => floor(random() * 55)::int)) at time zone 'America/Lima',
        0,
        case when random() < 0.8 then 'mesa' else 'llevar' end,
        (1 + floor(random() * 8))::text,
        case when random() < 0.55 then 'efectivo' when random() < 0.78 then 'yape_plin' else 'tarjeta' end
      ) returning id into v;

      for l in 1..(1 + floor(random() * 3)::int) loop
        r := floor(random() * 100)::int + 1; acc := 0; pid := ids[1]; pprecio := precios[1];
        for j in 1..6 loop
          acc := acc + pesos[j];
          if r <= acc then pid := ids[j]; pprecio := precios[j]; exit; end if;
        end loop;
        cant := 1 + floor(random() * 2)::int;
        insert into public.venta_detalle (venta_id, plato_id, cantidad, precio_unitario) values (v, pid, cant, pprecio);
      end loop;

      update public.ventas
         set total = (select sum(cantidad * precio_unitario) from public.venta_detalle where venta_id = v)
       where id = v;
    end loop;
  end loop;

  -- Dos ventas anuladas (para mostrar "Anulada" en Ventas de hoy y devolver insumos).
  update public.ventas set estado = 'anulada', anulada_at = now(), motivo_anulacion = 'Error al registrar'
   where id in (select id from public.ventas where restaurante_id = rest and fecha < now() - interval '2 days' order by random() limit 2);

  -- Compras: una por semana de cada insumo (precio con algo de variación)...
  for rec in
    select i.id, i.costo_unitario as p, q.qty
    from public.insumos i
    join (values ('Pollo',14000),('Carne de res',9000),('Papa amarilla',25000),('Cebolla roja',7000),('Tomate',4000),
                 ('Pescado',6000),('Limón',2000),('Maíz morado',1500),('Ají amarillo',2500),('Arroz',50000),('Aceite',4000)) q(n, qty)
      on q.n = i.nombre
    where i.restaurante_id = rest
  loop
    for w in reverse 8..1 loop
      jitter := 0.92 + random() * 0.16;
      insert into public.compras (restaurante_id, insumo_id, cantidad, costo_total, fecha)
      values (rest, rec.id, rec.qty, round(rec.qty * rec.p * jitter, 2), now() - make_interval(days => w * 7 + 1));
    end loop;
  end loop;
  -- ...y las compras más recientes, a precio exacto. El pollo y el pescado quedan por vencer.
  for rec in
    select i.id, i.costo_unitario as p, q.qty, q.dias
    from public.insumos i
    join (values ('Pollo',8000,3),('Pescado',6000,1),('Tomate',4000,2),('Carne de res',9000,5),('Papa amarilla',25000,5),
                 ('Cebolla roja',7000,5),('Limón',2000,5),('Maíz morado',1500,5),('Ají amarillo',2500,5),('Arroz',50000,6),('Aceite',4000,6)) q(n, qty, dias)
      on q.n = i.nombre
    where i.restaurante_id = rest
  loop
    insert into public.compras (restaurante_id, insumo_id, cantidad, costo_total, fecha)
    values (rest, rec.id, rec.qty, round(rec.qty * rec.p, 2), now() - make_interval(days => rec.dias));
  end loop;

  -- Mermas y uso propio
  insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo, fecha)
  select rest, i.id, x.tipo, x.c, x.motivo, now() - make_interval(days => x.dias)
  from (values ('Pescado','merma',-500,'Se malogró',2),('Pollo','consumo_propio',-2000,'Almuerzo del personal',3),
               ('Tomate','merma',-800,'Se cayó',1)) x(n, tipo, c, motivo, dias)
  join public.insumos i on i.nombre = x.n and i.restaurante_id = rest;

  -- Conteo: deja el stock actual como se quiere mostrar (varios insumos bajo su punto de aviso).
  -- Se hace con un movimiento de ajuste, así el libro de movimientos sigue cuadrando.
  insert into public.movimientos_inventario (restaurante_id, insumo_id, tipo, cantidad, motivo)
  select rest, i.id, 'ajuste', x.stock - i.stock, 'Conteo inicial de la demo'
  from (values ('Pollo',3000),('Papa amarilla',10000),('Ají amarillo',500),('Cebolla roja',3000),('Carne de res',12000),
               ('Arroz',40000),('Aceite',9000),('Tomate',6000),('Pescado',5000),('Limón',3000),('Maíz morado',2500)) x(n, stock)
  join public.insumos i on i.nombre = x.n and i.restaurante_id = rest;

  -- Gastos fijos y su reparto de los últimos 3 meses
  insert into public.gastos_fijos (restaurante_id, nombre, categoria, monto, dia_mes) values
    (rest, 'Luz', 'servicios', 180, 5), (rest, 'Agua', 'servicios', 90, 8), (rest, 'Internet', 'servicios', 80, 10),
    (rest, 'Gas', 'servicios', 120, 15), (rest, 'Cocinera', 'sueldos', 1300, 30), (rest, 'Mozo', 'sueldos', 1100, 30),
    (rest, 'Alquiler del local', 'alquiler', 1200, 1);
  perform public.generar_gastos_mes(rest, hoy);
  perform public.generar_gastos_mes(rest, (hoy - interval '1 month')::date);
  perform public.generar_gastos_mes(rest, (hoy - interval '2 months')::date);

  insert into public.notas_negocio (restaurante_id, texto, vigente_desde, vigente_hasta, origen)
  values (rest, 'El sábado hay un cumpleaños de 40 personas', hoy, hoy + 6, 'manual');
end $$;

-- Las compras con variación de precio mueven el costo de los insumos: se devuelve a los precios base
-- para que el lomo saltado dé costo 9.29, ganancia 12.71 y margen 57.8 %.
update public.insumos i set costo_unitario = x.p
from (values ('Pollo',0.012),('Papa amarilla',0.0032),('Ají amarillo',0.008),('Cebolla roja',0.0028),('Carne de res',0.035),('Arroz',0.0045),
             ('Aceite',0.009),('Tomate',0.004),('Pescado',0.03),('Limón',0.006),('Maíz morado',0.008)) x(n,p)
where i.nombre = x.n and i.restaurante_id = (select id from public.restaurantes where nombre = 'Restaurante Demo');

-- ---------------------------------------------------------------------
-- Para vincular una cuenta a la demo (después de crear el usuario en
-- Supabase → Authentication → Users → Add user, con "Auto confirm"):
--
--   insert into public.perfiles (user_id, restaurante_id, nombre, rol)
--   select u.id, r.id, 'Demo', 'admin'
--   from auth.users u, public.restaurantes r
--   where u.email = 'CORREO_DE_LA_CUENTA_DEMO' and r.nombre = 'Restaurante Demo';
-- ---------------------------------------------------------------------
