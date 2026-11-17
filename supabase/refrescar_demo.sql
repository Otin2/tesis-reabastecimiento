-- =====================================================================
-- refrescar_demo.sql — deja la cuenta DEMO "como recién cargada"
--
-- seed_demo.sql cargó la demo con fechas relativas al día de la carga (9-nov-2026). Con los días,
-- "Ventas de hoy" sale en 0, las ventas quedan fuera de "esta semana" y los insumos salen vencidos.
-- Este script mueve hacia adelante las fechas del restaurante 'Restaurante Demo' (y SOLO de ese)
-- tantos días como hayan pasado desde su última venta hasta hoy (hora de Lima).
--
-- Se puede ejecutar cualquier día y las veces que se quiera (idempotente): después de correrlo la
-- última venta es de hoy, así que una segunda corrida calcula 0 días y no mueve nada.
-- No tiene begin/commit: el bloque DO ya es una sola transacción (todo o nada), y así se puede
-- ensayar dentro de una transacción propia que luego se deshace.
--
-- Qué NO cambia
--  * El stock: no se insertan ni se borran movimientos ni ventas; solo se cambian fechas.
--    Los triggers que tocan el stock son "after insert" y no se disparan con un update.
--    El resumen incluye una huella del stock antes y después para comprobarlo.
--  * ventas.estado no se toca (el trigger venta_anula es "after update of estado": no se dispara).
--  * check_tenant ("before insert or update") sí se dispara en compras y movimientos_inventario,
--    pero pasa siempre: el insumo y la fila siguen siendo del mismo restaurante.
--  * compra_vence es "before insert": no recalcula vence_el en un update, por eso se mueve aquí.
--
-- Qué se mueve (d = días desde la última venta hasta hoy)
--  * compras.fecha y vence_el, movimientos_inventario.fecha, notas_negocio (vigente_desde,
--    vigente_hasta, created_at), acciones_pendientes (created_at, resuelta_at), log_chat.created_at,
--    lista_compras_eventos.created_at: + d días exactos. Así "Pollo vence mañana", la nota del
--    cumpleaños vigente esta semana, etc., quedan igual que el día de la carga.
--  * ventas.fecha: en semanas completas (ver DECISIÓN 1). ventas.anulada_at: + d, sin quedar antes
--    de la venta ni después de ahora.
--  * gastos: ver DECISIÓN 2.
--
-- DECISIÓN 1 — Días de la semana de las ventas
--   El seed vende más viernes, sábado y domingo. Si las ventas se movieran d días con d no
--   múltiplo de 7, los picos caerían en otros días (p. ej. lunes a miércoles): las gráficas se
--   verían raras en una presentación y el motor de pronóstico aprendería una estacionalidad
--   semanal falsa ("el martes vendes más"). Por eso las ventas se mueven S = 7 × techo(d / 7)
--   días (semanas completas, S >= d) y las que quedan en el futuro (fecha de Lima > hoy) se
--   "reciclan" 56 días (8 semanas) hacia atrás: van al borde más antiguo del historial, en el
--   mismo día de la semana. Es un historial circular de 8 semanas; ninguna venta se crea ni se borra.
--
--   Prueba (L = día de la última venta antes de correr, T = hoy, d = T − L, S = d + e, 0 <= e <= 6):
--    * El contenido del día x pasa a x + S. Queda en el futuro si x + S > T, o sea x > L − e:
--      son los últimos e días del historial; restarles 56 los deja en (T − 56, T + e − 56].
--    * Hoy (T) recibe el contenido del día L − e, que existe (el seed tiene ventas todos los días
--      de las 8 semanas). Hoy siempre tiene ventas y nada queda en el futuro.
--    * La última venta queda en T, así que una segunda corrida calcula d = 0: no hace nada.
--    * Costura: el seed abarca 57 días [L − 56, L] (8 semanas + 1 día). Tras mover S, lo no
--      reciclado ocupa [T + e − 56, T] y lo reciclado (T − 56, T + e − 56]: coinciden en UN día
--      (T + e − 56) cuando e >= 1, que queda con las ventas de dos días. Desde ahí el historial
--      abarca 56 días exactos y las corridas siguientes ya no se superponen. Ese día está a 50 o
--      más días de hoy: fuera de los 28 días del uso diario y de las gráficas de semana y mes.
--    * Ejemplo con los datos reales: L = 9-nov, T = 16-nov → d = 7, S = 7, e = 0. Todo se mueve
--      7 días y no se recicla nada (los días de la semana quedan exactos).
--      Si se corriera el 19-nov: d = 10, S = 14, e = 4. Las ventas del 6 al 9-nov (contenido)
--      pasarían al 20–23-nov (futuro) y se reciclan al 25–28-sep (T + e − 56 = 28-sep, el día
--      que queda doble); hoy (19-nov, jueves) recibe el contenido del 5-nov, también jueves.
--   Costo aceptado: el día "parcial" del seed (solo 6 ventas de almuerzo) y la leve tendencia al
--   alza quedan en otro lugar del historial cuando e > 0; y como antes, las ventas de hoy pueden
--   tener una hora posterior a la actual (el seed también lo hacía). Para una demo es mejor eso
--   que picos de fin de semana en días equivocados.
--
-- DECISIÓN 2 — Gastos
--   * Fijos (gasto_fijo_id no nulo): son por mes calendario. No se mueven; se llama a
--     generar_gastos_mes para el mes actual y los dos anteriores (como el seed). No duplica:
--     si ya existen no hace nada. Moverlos chocaría con el índice único (gasto_fijo_id, periodo).
--     Los meses más antiguos se conservan (no se borra nada; ver la línea comentada abajo).
--   * Puntuales (gasto_fijo_id nulo): el seed no crea ninguno, pero quien usa la demo puede
--     agregarlos desde la app. Se mueven + d días como el resto de los hechos del negocio, para
--     que sigan en el mismo lugar respecto a las ventas (y en "este mes" si lo estaban).
--     periodo es una columna generada: se recalcula sola.
--
-- Fecha de referencia: la última venta de cualquier tipo (como se pidió). Si alguien registra una
-- venta en la demo después de la carga, esa venta pasa a ser la referencia y el resto del seed
-- queda más atrás que "recién cargado"; las filas registradas después de la última venta podrían
-- quedar con fecha futura (excepto ventas, que se reciclan).
-- =====================================================================

do $$
declare
  v_rest uuid;
  v_n_rest int;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_ultima date;
  v_d int := 0;              -- días a mover (todo menos las ventas)
  v_s int := 0;              -- días a mover las ventas (múltiplo de 7)
  v_stock_antes text; v_stock_despues text;
  n_ventas int := 0; n_recicladas int := 0; n_anuladas int := 0; n_compras int := 0; n_movs int := 0;
  n_notas int := 0; n_acciones int := 0; n_log int := 0; n_eventos int := 0; n_puntuales int := 0;
  n_fijos int := 0;
  v_resumen jsonb;
begin
  perform set_config('search_path', '', true);

  select count(*), min(id::text)::uuid into v_n_rest, v_rest
    from public.restaurantes where nombre = 'Restaurante Demo';
  if v_n_rest = 0 then
    raise exception 'No existe el "Restaurante Demo". Cargarlo primero con seed_demo.sql.';
  elsif v_n_rest > 1 then
    raise exception 'Hay % restaurantes llamados "Restaurante Demo". Dejar uno solo antes de refrescar.', v_n_rest;
  end if;

  select max((fecha at time zone 'America/Lima')::date) into v_ultima
    from public.ventas where restaurante_id = v_rest;
  v_d := greatest(coalesce(v_hoy - v_ultima, 0), 0);
  v_s := ((v_d + 6) / 7) * 7;

  select md5(coalesce(string_agg(format('%s:%s', id, stock), ',' order by id), ''))
    into v_stock_antes from public.insumos where restaurante_id = v_rest;

  if v_d > 0 then
    -- Ventas: semanas completas y reciclado de lo que quede en el futuro (DECISIÓN 1).
    update public.ventas set fecha = fecha + make_interval(days => v_s)
     where restaurante_id = v_rest;
    get diagnostics n_ventas = row_count;

    update public.ventas set fecha = fecha - make_interval(days => 56)
     where restaurante_id = v_rest and (fecha at time zone 'America/Lima')::date > v_hoy;
    get diagnostics n_recicladas = row_count;

    update public.ventas
       set anulada_at = greatest(fecha, least(now(), anulada_at + make_interval(days => v_d)))
     where restaurante_id = v_rest and anulada_at is not null;
    get diagnostics n_anuladas = row_count;

    -- El resto: + d días exactos.
    update public.compras
       set fecha = fecha + make_interval(days => v_d), vence_el = vence_el + v_d
     where restaurante_id = v_rest;
    get diagnostics n_compras = row_count;

    update public.movimientos_inventario set fecha = fecha + make_interval(days => v_d)
     where restaurante_id = v_rest;
    get diagnostics n_movs = row_count;

    update public.notas_negocio
       set vigente_desde = vigente_desde + v_d, vigente_hasta = vigente_hasta + v_d,
           created_at = created_at + make_interval(days => v_d)
     where restaurante_id = v_rest;
    get diagnostics n_notas = row_count;

    update public.acciones_pendientes
       set created_at = created_at + make_interval(days => v_d),
           resuelta_at = resuelta_at + make_interval(days => v_d)
     where restaurante_id = v_rest;
    get diagnostics n_acciones = row_count;

    update public.log_chat set created_at = created_at + make_interval(days => v_d)
     where restaurante_id = v_rest;
    get diagnostics n_log = row_count;

    update public.lista_compras_eventos set created_at = created_at + make_interval(days => v_d)
     where restaurante_id = v_rest;
    get diagnostics n_eventos = row_count;

    -- Gastos puntuales: + d días (DECISIÓN 2).
    update public.gastos set fecha = fecha + v_d
     where restaurante_id = v_rest and gasto_fijo_id is null;
    get diagnostics n_puntuales = row_count;
  end if;

  -- Gastos fijos del mes actual y los dos anteriores (no duplica; se corre aunque d = 0).
  n_fijos := public.generar_gastos_mes(v_rest, v_hoy)
           + public.generar_gastos_mes(v_rest, (v_hoy - interval '1 month')::date)
           + public.generar_gastos_mes(v_rest, (v_hoy - interval '2 months')::date);
  -- Opcional (no se hace): borrar los gastos fijos de meses más antiguos que el historial de ventas.
  -- delete from public.gastos where restaurante_id = v_rest and gasto_fijo_id is not null
  --    and periodo < date_trunc('month', v_hoy - interval '2 months')::date;

  select md5(coalesce(string_agg(format('%s:%s', id, stock), ',' order by id), ''))
    into v_stock_despues from public.insumos where restaurante_id = v_rest;
  if v_stock_antes is distinct from v_stock_despues then
    raise exception 'El stock cambió al refrescar la demo: no se guarda nada.';
  end if;

  v_resumen := jsonb_build_object(
    'hoy', v_hoy,
    'ultima_venta_antes', v_ultima,
    'ultima_venta_despues', (select max((fecha at time zone 'America/Lima')::date) from public.ventas where restaurante_id = v_rest),
    'dias_desplazados', v_d,
    'dias_desplazadas_las_ventas', v_s,
    'ventas_movidas', n_ventas,
    'ventas_recicladas_8_semanas_atras', n_recicladas,
    'ventas_anuladas_ajustadas', n_anuladas,
    'compras', n_compras,
    'movimientos_inventario', n_movs,
    'notas_negocio', n_notas,
    'acciones_pendientes', n_acciones,
    'log_chat', n_log,
    'lista_compras_eventos', n_eventos,
    'gastos_puntuales', n_puntuales,
    'gastos_fijos_generados', n_fijos,
    'stock_sin_cambios', v_stock_antes = v_stock_despues,
    'ventas_de_hoy', (select count(*) from public.ventas where restaurante_id = v_rest
                        and (fecha at time zone 'America/Lima')::date = v_hoy));
  if v_d = 0 then
    v_resumen := v_resumen || jsonb_build_object('nota', 'La demo ya estaba al día: no se movió ninguna fecha.');
  end if;

  raise notice 'Refrescar demo: %', v_resumen;
  perform set_config('demo.resumen_refresco', v_resumen::text, false);
end $$;

-- Resumen de lo que hizo (también sale como NOTICE).
select jsonb_pretty(current_setting('demo.resumen_refresco', true)::jsonb) as resumen;
