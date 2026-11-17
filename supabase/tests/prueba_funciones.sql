-- Prueba de las funciones para el backend (migraciones 0004 a 0007).
-- Igual que prueba_esquema.sql: al final lanza una excepción a propósito, así TODO lo que
-- inserta se deshace (no deja datos). El resultado aparece en el mensaje "RESULTADOS: {...}".
-- Ejecutar en el SQL Editor de Supabase o con execute_sql (como service role / postgres).
--
-- Resultados esperados:
--   01_importar                {creados 2, omitidos 1}      01_vida_util_carne 3 (2.6 redondeado)
--   02_venta                   total 66.00                   02_carne_tras_vender 11400
--   02_venta_plato_invalido    error                         02_venta_otro_restaurante error
--   03_consumo_carne           600                           03_dias_restantes_carne 19.0 (11400 / 600 en 1 día)
--   03_consumo_tras_editar_receta 600 (editar la receta no cambia el pasado)
--   04_anular ok, 04_anular_dos_veces error, 04_anular_desde_otro error, 04_carne_tras_anular 12000
--   05_carne_tras_compra 17000, 05_costo_unitario 0.04, 05_vence_en_3_dias true
--   06_conteo 16000, 06_merma 15000, 06_merma_sin_stock error, 06_uso_general error
--   07_confirmar mensaje "Anotado. El stock bajó.", 07_carne 14500, 07_confirmar_dos_veces error
--   08_receta_insumo_ajeno error
--   09_gastos_lista 2, 09_monto_mes_tras_editar 200.00, 09_gastos_lista_tras_quitar 1, 09_quitar_desde_otro error
--   10_usuario_llama_rpc       bloqueada
--   11_sin_punto_de_aviso      {nivel_sal null, sal_en_lista 0, sal_por_agotarse 0, arroz_en_lista 50000}

do $$
declare
  a uuid; b uuid; u uuid := gen_random_uuid();
  r jsonb := '{}'; x jsonb;
  pl bigint; v bigint; acc uuid;
  i_carne bigint; i_papa bigint; i_arroz bigint; i_serv bigint; i_b bigint;
  gf text; gp text;
begin
  -- Usuario de prueba. Si existe el alta automática (0003), ya le creó restaurante y perfil.
  insert into auth.users(id, email) values (u, 'prueba-funciones@test.local');
  select restaurante_id into a from public.perfiles where user_id = u;
  if a is null then
    insert into public.restaurantes(nombre) values ('A') returning id into a;
    insert into public.perfiles(user_id, restaurante_id, nombre) values (u, a, 'test');
  end if;
  insert into public.restaurantes(nombre) values ('B') returning id into b;
  insert into public.insumos(restaurante_id, nombre, unidad) values (b, 'SoloB', 'g') returning id into i_b;

  -- 1) Insumos: crear e importar (el stock inicial entra como movimiento)
  i_carne := (public.crear_insumo(a, u, '{"nombre":"Carne","unidad":"g","costo_unitario":0.035,"presentacion_compra":1000,"stock":12000,"punto_reorden":8000,"vida_util_dias":"2.6"}') ->> 'id')::bigint;
  i_papa  := (public.crear_insumo(a, u, '{"nombre":"Papa","unidad":"g","costo_unitario":0.0032,"presentacion_compra":5000,"stock":10000,"punto_reorden":15000}') ->> 'id')::bigint;
  r := r || jsonb_build_object('01_importar', public.importar_insumos(a, u, '[
      {"nombre":"carne","unidad":"g","costo_unitario":1,"presentacion_compra":1},
      {"nombre":"Arroz","unidad":"g","costo_unitario":0.0045,"presentacion_compra":50000,"punto_reorden":15000},
      {"nombre":"Servilletas","unidad":"unid","costo_unitario":0.03,"presentacion_compra":100,"en_recetas":false}]'),
    '01_vida_util_carne', (select vida_util_dias from public.insumos where id = i_carne));
  select id into i_arroz from public.insumos where restaurante_id = a and nombre = 'Arroz';
  select id into i_serv from public.insumos where restaurante_id = a and nombre = 'Servilletas';

  -- 2) Venta: precios y total salen de la tabla; líneas repetidas se suman
  pl := (public.guardar_plato(a, null, 'Lomo saltado', 'Carta', 22, true,
          jsonb_build_array(jsonb_build_object('insumo_id', i_carne, 'cantidad', 200), jsonb_build_object('insumo_id', i_papa, 'cantidad', 250))) ->> 'id')::bigint;
  x := public.registrar_venta(a, u, jsonb_build_array(jsonb_build_object('plato_id', pl, 'cantidad', 2), jsonb_build_object('plato_id', pl, 'cantidad', 1)), 'yape_plin', 'llevar');
  v := (x ->> 'id')::bigint;
  r := r || jsonb_build_object('02_venta', x, '02_carne_tras_vender', (select stock from public.insumos where id = i_carne));
  begin
    perform public.registrar_venta(a, u, '[{"plato_id": -1, "cantidad": 1}]');
    r := r || jsonb_build_object('02_venta_plato_invalido', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('02_venta_plato_invalido', 'error: ' || sqlerrm); end;
  begin
    perform public.registrar_venta(b, u, jsonb_build_array(jsonb_build_object('plato_id', pl, 'cantidad', 1)));
    r := r || jsonb_build_object('02_venta_otro_restaurante', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('02_venta_otro_restaurante', 'error: ' || sqlerrm); end;

  -- 3) Consumo y días de stock (0006): salen del libro de movimientos y de los días con ventas
  r := r || jsonb_build_object(
    '03_consumo_carne', (select sum(consumo) from public.consumo_diario_insumo where restaurante_id = a and insumo_id = i_carne),
    '03_dias_restantes_carne', (select dias_restantes from public.insumos_resumen where id = i_carne));
  perform public.guardar_plato(a, pl, 'Lomo saltado', 'Carta', 22, true, jsonb_build_array(jsonb_build_object('insumo_id', i_carne, 'cantidad', 300)));
  r := r || jsonb_build_object('03_consumo_tras_editar_receta', (select sum(consumo) from public.consumo_diario_insumo where restaurante_id = a and insumo_id = i_carne));

  -- 4) Anular: devuelve el stock; no se puede dos veces ni desde otro restaurante
  r := r || jsonb_build_object('04_anular', public.anular_venta(a, v, 'Error de digitación'));
  begin
    perform public.anular_venta(a, v);
    r := r || jsonb_build_object('04_anular_dos_veces', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('04_anular_dos_veces', 'error: ' || sqlerrm); end;
  begin
    perform public.anular_venta(b, v);
    r := r || jsonb_build_object('04_anular_desde_otro', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('04_anular_desde_otro', 'error: ' || sqlerrm); end;
  r := r || jsonb_build_object('04_carne_tras_anular', (select stock from public.insumos where id = i_carne));

  -- 5) Compra: sube stock, actualiza costo y calcula vencimiento
  perform public.registrar_compra(a, u, jsonb_build_array(jsonb_build_object('insumo_id', i_carne, 'cantidad', 5000, 'costo_total', 200)));
  r := r || jsonb_build_object('05_carne_tras_compra', (select stock from public.insumos where id = i_carne),
    '05_costo_unitario', (select costo_unitario from public.insumos where id = i_carne),
    '05_vence_en_3_dias', (select vence_el = (now() at time zone 'America/Lima')::date + 3 from public.compras where insumo_id = i_carne));

  -- 6) Ajustes de stock
  r := r || jsonb_build_object('06_conteo', public.ajustar_stock(a, u, i_carne, 'ajuste', 16000) -> 'stock',
                               '06_merma', public.ajustar_stock(a, u, i_carne, 'merma', 1000, 'Se malogró') -> 'stock');
  begin
    perform public.ajustar_stock(a, u, i_arroz, 'merma', 100);
    r := r || jsonb_build_object('06_merma_sin_stock', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('06_merma_sin_stock', 'error: ' || sqlerrm); end;
  begin
    perform public.ajustar_stock(a, u, i_serv, 'ajuste', 10);
    r := r || jsonb_build_object('06_uso_general', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('06_uso_general', 'error: ' || sqlerrm); end;

  -- 7) El agente propone y el usuario confirma (una sola vez)
  insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen)
  values (a, u, 'merma', jsonb_build_object('insumo_id', i_carne, 'cantidad', 500, 'motivo', 'Se cayó'), 'Merma de 500 g de carne')
  returning id into acc;
  r := r || jsonb_build_object('07_confirmar', public.confirmar_accion(a, u, acc) ->> 'mensaje');
  -- En una sentencia aparte: dentro de la misma, la consulta no ve lo que la función acaba de cambiar.
  r := r || jsonb_build_object('07_carne', (select stock from public.insumos where id = i_carne));
  begin
    perform public.confirmar_accion(a, u, acc);
    r := r || jsonb_build_object('07_confirmar_dos_veces', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('07_confirmar_dos_veces', 'error: ' || sqlerrm); end;

  -- 8) Una receta no puede usar insumos de otro restaurante
  begin
    perform public.guardar_plato(a, null, 'Plato raro', 'Carta', 10, true, jsonb_build_array(jsonb_build_object('insumo_id', i_b, 'cantidad', 1)));
    r := r || jsonb_build_object('08_receta_insumo_ajeno', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('08_receta_insumo_ajeno', 'error: ' || sqlerrm); end;

  -- 9) Gastos: fijo (plantilla + mes actual) y puntual
  gf := public.crear_gasto(a, u, 'Luz', 'servicios', 180, true) ->> 'id';
  gp := public.crear_gasto(a, u, 'Gasfitero', 'otros', 50, false) ->> 'id';
  r := r || jsonb_build_object('09_gastos_lista', (select count(*) from public.gastos_lista where restaurante_id = a));
  perform public.actualizar_gasto(a, gf, 200);
  r := r || jsonb_build_object('09_monto_mes_tras_editar', (select monto from public.gastos where restaurante_id = a and gasto_fijo_id is not null));
  perform public.quitar_gasto(a, gf);
  r := r || jsonb_build_object('09_gastos_lista_tras_quitar', (select count(*) from public.gastos_lista where restaurante_id = a));
  begin
    perform public.quitar_gasto(b, gp);
    r := r || jsonb_build_object('09_quitar_desde_otro', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('09_quitar_desde_otro', 'error: ' || sqlerrm); end;

  -- 11) Sin punto de aviso no hay nivel ni entra a la lista (0007). Arroz (aviso 15000, stock 0) sí entra.
  perform public.crear_insumo(a, u, '{"nombre":"Sal","unidad":"g","costo_unitario":0.002,"presentacion_compra":1000}');
  r := r || jsonb_build_object('11_sin_punto_de_aviso', jsonb_build_object(
    'nivel_sal', (select nivel from public.insumos_resumen where restaurante_id = a and nombre = 'Sal'),
    'sal_en_lista', (select count(*) from public.lista_compras_sugerida where restaurante_id = a and nombre = 'Sal'),
    'sal_por_agotarse', (select count(*) from public.insumos_por_agotarse where restaurante_id = a and nombre = 'Sal'),
    'arroz_en_lista', (select cantidad from public.lista_compras_sugerida where restaurante_id = a and nombre = 'Arroz')));

  -- 10) Un usuario normal no puede llamar a las funciones
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.registrar_venta(a, u, jsonb_build_array(jsonb_build_object('plato_id', pl, 'cantidad', 1)));
    r := r || jsonb_build_object('10_usuario_llama_rpc', 'PERMITIDA (MAL)');
  exception when others then r := r || jsonb_build_object('10_usuario_llama_rpc', 'bloqueada');
  end;
  reset role;

  raise exception 'RESULTADOS: %', jsonb_pretty(r);
end $$;
