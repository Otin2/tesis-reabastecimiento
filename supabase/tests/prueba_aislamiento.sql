-- Prueba del aislamiento entre restaurantes (multiempresa).
-- Igual que prueba_esquema.sql y prueba_funciones.sql: al final lanza una excepción a propósito,
-- así TODO lo que inserta se deshace (no deja datos). El resultado aparece en el mensaje
-- "RESULTADOS: [...]" como una lista ordenada por sección.
-- Ejecutar en el SQL Editor de Supabase o con execute_sql (como service role / postgres).
-- Funciona con o sin las migraciones 0006 y 0007 aplicadas.
--
-- Qué hace
--  * Crea dos usuarios (A y B) en auth.users. El alta automática (0003) les crea un restaurante
--    y un perfil a cada uno; si no existiera, se crean a mano. Crea un tercer usuario (C) sin
--    perfil, solo para intentar "colgarse" de un restaurante ajeno.
--  * Llena los dos restaurantes con las funciones del backend (crear_insumo, guardar_plato,
--    registrar_venta, anular_venta, registrar_compra, ajustar_stock, crear_gasto,
--    confirmar_accion) y, donde no hay función, con inserts directos como service role
--    (proveedores, acciones_pendientes, log_chat, lista_compras_eventos).
--  * Como service role: las funciones y los triggers check_tenant rechazan mezclar restaurantes.
--  * Como cada usuario: ve SOLO lo suyo en las 16 tablas y las 14 vistas, no puede escribir
--    directo en ninguna tabla ni ejecutar ninguna función de escritura.
--  * Como anon: no ve nada.
--
-- Cómo se decide cada resultado
--  * Lectura: se cuentan las filas propias como service role (antes de cambiar de rol) y luego
--    como el usuario. "ok (N propias, 0 ajenas)" si ve exactamente sus N filas y ninguna otra
--    (ajenas = cualquier fila que no sea suya, incluidas las de la demo u otras cuentas reales).
--  * UPDATE y DELETE bajo RLS no dan error: afectan 0 filas. Por eso cada escritura mira
--    row_count sobre filas que existen: 0 filas o error de permisos = bloqueada; 1 o más = MAL.
--  * Solo se acepta como "bloqueada" el error esperado (42501 permisos/RLS para el usuario;
--    P0001 "raise exception" para funciones y triggers). Cualquier otro error (p. ej. una
--    función mal escrita en esta prueba) sale como "ERROR INESPERADO (MAL)", para que un error
--    de la propia prueba no pase por "bloqueada".
--
-- Resultados esperados:
--   00_fallas                         0
--   01_preparacion                    restaurantes_distintos true, restaurante_creado_por_el_trigger {A true, B true}
--   02_funciones_sobre_objetos_ajenos todas "bloqueada: <mensaje de la función>":
--       vender_plato_ajeno, vender_plato_propio_y_ajeno  -> "Hay platos que no existen, están inactivos..."
--       editar_plato_ajeno                               -> "El plato no existe"
--       receta_con_insumo_ajeno, editar_receta_con_insumo_ajeno -> "La receta tiene insumos inexistentes..."
--       comprar_insumo_ajeno                             -> "Hay insumos inexistentes, cantidades inválidas..."
--       merma_de_insumo_ajeno, conteo_de_insumo_ajeno    -> "El insumo no existe"
--       anular_venta_ajena                               -> "La venta no existe"
--       confirmar_accion_ajena, confirmar_accion_ajena_con_usuario_ajeno -> "La acción no existe"
--       confirmar_accion_propia_con_merma_ajena          -> "El insumo no existe"
--       confirmar_accion_propia_con_venta_ajena          -> "Hay platos que no existen..."
--       confirmar_accion_propia_con_compra_ajena         -> "Hay insumos inexistentes..."
--       actualizar_gasto_*_ajeno, quitar_gasto_*_ajeno   -> "El gasto no existe"
--   03_check_tenant                   las 8 "bloqueada: Los datos pertenecen a restaurantes distintos (<tabla>)"
--   04_proveedor_ajeno                compra_con_proveedor_ajeno "bloqueada: El proveedor no existe"
--                                     (hueco que encontró esta prueba; lo cerró la migración 0007)
--   05_B_intacto_tras_los_ataques     "ok"
--   06_lectura_A / 06_lectura_B       todas "ok (N propias, 0 ajenas)" con N > 0. N aproximado:
--       restaurantes 1, perfiles 1, proveedores 1, insumos 4, platos 1, recetas 2, ventas 2,
--       venta_detalle 2, compras 1, movimientos_inventario 11,
--       gastos_fijos 1, gastos 2, notas_negocio 1, acciones_pendientes 2 (A: 5), log_chat 1,
--       lista_compras_eventos 1, margen_por_plato 1, insumos_por_agotarse 1, consumo_diario_insumo 2,
--       ventas_por_plato_dia 1, ganancia_por_dia 1, gastos_por_dia (días del mes + 1),
--       perdidas_por_dia 1, insumos_por_vencer 1, resumen_hoy 1, uso_diario_insumo 2,
--       insumos_resumen 4, lista_compras_sugerida 1, gastos_lista 2, ventas_hoy 2
--   07_escritura_directa_A / _B       las 49 "bloqueada": los insert con
--       "new row violates row-level security policy for table ..." (o "permission denied for table ...");
--       los update y delete con "bloqueada (0 filas)" (o "permission denied for table ...")
--   08_funciones_como_usuario_A / _B  las 12 "bloqueada: permission denied for function ..."
--   09_anon                           las 30 "ok (0 filas)" (u "ok (sin permiso)")

do $$
declare
  r jsonb := '{}';
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  hoy date := (now() at time zone 'America/Lima')::date;
  rest uuid[] := '{}'; usr uuid[] := '{}';
  prov bigint[] := '{}'; carne bigint[] := '{}'; papa bigint[] := '{}'; limon bigint[] := '{}';
  plato bigint[] := '{}'; venta bigint[] := '{}'; compra bigint[] := '{}';
  acc uuid[] := '{}'; gf text[] := '{}'; gp text[] := '{}';
  acc_merma_ajena uuid; acc_venta_ajena uuid; acc_compra_ajena uuid;
  por_trigger jsonb := '{}';
  k int; letra text; t text; pred text; veredicto text;
  x_id bigint; x_uuid uuid; x_rest uuid;
  pls bigint[]; vts bigint[];
  preds jsonb; esp jsonb; grupo jsonb;
  ops text[]; q text[];
  n_tot bigint; n_own bigint; n_esp bigint; c bigint;
  huella_antes text; huella_despues text;
  -- Las 16 tablas (primero) y las 14 vistas del schema public.
  tablas text[] := array[
    'restaurantes', 'perfiles', 'proveedores', 'insumos', 'platos', 'recetas', 'ventas', 'venta_detalle',
    'compras', 'movimientos_inventario', 'gastos_fijos', 'gastos', 'notas_negocio', 'acciones_pendientes',
    'log_chat', 'lista_compras_eventos'];
  vistas text[] := array[
    'margen_por_plato', 'insumos_por_agotarse', 'consumo_diario_insumo', 'ventas_por_plato_dia',
    'ganancia_por_dia', 'gastos_por_dia', 'perdidas_por_dia', 'insumos_por_vencer', 'resumen_hoy',
    'uso_diario_insumo', 'insumos_resumen', 'lista_compras_sugerida', 'gastos_lista', 'ventas_hoy'];
  -- "Huella" de los datos de un restaurante: si cambia algo, cambia el md5.
  huella_sql text := $q$
    select md5(concat_ws('|',
      (select string_agg(format('%s:%s:%s:%s', id, stock, costo_unitario, activo), ',' order by id) from public.insumos where restaurante_id = $1),
      (select string_agg(format('%s:%s:%s:%s', id, nombre, precio, activo), ',' order by id) from public.platos where restaurante_id = $1),
      (select string_agg(format('%s:%s:%s', r.plato_id, r.insumo_id, r.cantidad), ',' order by r.plato_id, r.insumo_id)
         from public.recetas r join public.platos p on p.id = r.plato_id where p.restaurante_id = $1),
      (select string_agg(format('%s:%s:%s', id, estado, total), ',' order by id) from public.ventas where restaurante_id = $1),
      (select count(*)::text from public.venta_detalle d join public.ventas v on v.id = d.venta_id where v.restaurante_id = $1),
      (select count(*)::text from public.compras where restaurante_id = $1),
      (select count(*)::text from public.movimientos_inventario where restaurante_id = $1),
      (select string_agg(format('%s:%s', id, monto), ',' order by id) from public.gastos where restaurante_id = $1),
      (select string_agg(format('%s:%s:%s', id, monto, activo), ',' order by id) from public.gastos_fijos where restaurante_id = $1),
      (select string_agg(format('%s:%s', id, estado), ',' order by id) from public.acciones_pendientes where restaurante_id = $1),
      (select count(*)::text from public.notas_negocio where restaurante_id = $1)))
  $q$;
begin
  -- =================================================================
  -- 1) Preparación: dos usuarios, cada uno con su restaurante
  -- =================================================================
  insert into auth.users(id, email) values
    (ua, 'aislamiento-a@test.local'), (ub, 'aislamiento-b@test.local'), (uc, 'aislamiento-c@test.local');
  usr := array[ua, ub];
  for k in 1..2 loop
    letra := chr(64 + k);
    select restaurante_id into x_rest from public.perfiles where user_id = usr[k];
    por_trigger := por_trigger || jsonb_build_object(letra, x_rest is not null);
    if x_rest is null then
      insert into public.restaurantes(nombre) values ('Aislamiento ' || letra) returning id into x_rest;
      insert into public.perfiles(user_id, restaurante_id, nombre) values (usr[k], x_rest, 'test ' || letra);
    end if;
    rest[k] := x_rest;
  end loop;
  if rest[1] = rest[2] then
    raise exception 'Los dos usuarios quedaron en el mismo restaurante: la prueba no sirve';
  end if;
  -- C queda sin perfil: sirve para intentar crear un perfil en un restaurante (debe fallar).
  delete from public.perfiles where user_id = uc;
  r := r || jsonb_build_object('01_preparacion', jsonb_build_object(
    'restaurantes_distintos', rest[1] <> rest[2], 'restaurante_creado_por_el_trigger', por_trigger));

  -- Datos completos en los dos restaurantes, con las funciones del backend.
  for k in 1..2 loop
    letra := chr(64 + k);
    insert into public.proveedores(restaurante_id, nombre, telefono, dias_entrega)
      values (rest[k], 'Proveedor ' || letra, '999 000 00' || k, 'todos los días') returning id into x_id;
    prov[k] := x_id;

    -- Carne: vence en 2 días (sale en insumos_por_vencer tras la compra de hoy).
    -- Papa: bajo su punto de aviso (sale en insumos_por_agotarse y en la lista de compras).
    carne[k] := (public.crear_insumo(rest[k], usr[k],
      '{"nombre":"Carne","unidad":"g","costo_unitario":0.035,"presentacion_compra":1000,"stock":12000,"punto_reorden":8000,"vida_util_dias":2}') ->> 'id')::bigint;
    papa[k] := (public.crear_insumo(rest[k], usr[k],
      '{"nombre":"Papa","unidad":"g","costo_unitario":0.0032,"presentacion_compra":5000,"stock":10000,"punto_reorden":15000}') ->> 'id')::bigint;
    limon[k] := (public.crear_insumo(rest[k], usr[k],
      '{"nombre":"Limón","unidad":"g","costo_unitario":0.006,"presentacion_compra":1000,"stock":3000,"punto_reorden":1500}') ->> 'id')::bigint;
    perform public.crear_insumo(rest[k], usr[k],
      '{"nombre":"Servilletas","unidad":"unid","costo_unitario":0.03,"presentacion_compra":100,"en_recetas":false}');

    plato[k] := (public.guardar_plato(rest[k], null, 'Lomo saltado', 'Carta', 22, true, jsonb_build_array(
      jsonb_build_object('insumo_id', carne[k], 'cantidad', 200),
      jsonb_build_object('insumo_id', papa[k], 'cantidad', 250))) ->> 'id')::bigint;

    -- Una venta activa y otra anulada (hoy, hora de Lima).
    venta[k] := (public.registrar_venta(rest[k], usr[k],
      jsonb_build_array(jsonb_build_object('plato_id', plato[k], 'cantidad', 2)), 'efectivo', 'mesa', '3') ->> 'id')::bigint;
    x_id := (public.registrar_venta(rest[k], usr[k],
      jsonb_build_array(jsonb_build_object('plato_id', plato[k], 'cantidad', 1)), 'yape_plin', 'llevar') ->> 'id')::bigint;
    perform public.anular_venta(rest[k], x_id, 'Prueba de aislamiento');

    perform public.registrar_compra(rest[k], usr[k],
      jsonb_build_array(jsonb_build_object('insumo_id', carne[k], 'cantidad', 5000, 'costo_total', 200)), prov[k]);
    select max(id) into x_id from public.compras where restaurante_id = rest[k];
    compra[k] := x_id;

    perform public.ajustar_stock(rest[k], usr[k], papa[k], 'merma', 500, 'Prueba de aislamiento');

    gf[k] := public.crear_gasto(rest[k], usr[k], 'Luz', 'servicios', 180, true) ->> 'id';
    gp[k] := public.crear_gasto(rest[k], usr[k], 'Gasfitero', 'otros', 50, false) ->> 'id';

    -- Una nota (por el flujo del agente: acción pendiente + confirmar) y una acción que queda pendiente.
    insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen)
      values (rest[k], usr[k], 'nota', jsonb_build_object('texto', 'Nota de prueba ' || letra), 'Anotar una nota')
      returning id into x_uuid;
    perform public.confirmar_accion(rest[k], usr[k], x_uuid);
    insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen)
      values (rest[k], usr[k], 'merma', jsonb_build_object('insumo_id', carne[k], 'cantidad', 100, 'motivo', 'Prueba'), 'Merma de 100 g de carne')
      returning id into x_uuid;
    acc[k] := x_uuid;

    insert into public.log_chat(restaurante_id, user_id, texto, funcion, respuesta)
      values (rest[k], usr[k], '¿Cuánto vendí hoy?', 'ventas_hoy', 'Respuesta de prueba');
    insert into public.lista_compras_eventos(restaurante_id, user_id, tipo, detalle)
      values (rest[k], usr[k], 'generada', '{"items": 1}');
  end loop;

  -- Acciones pendientes de A cuyo contenido apunta a objetos de B (confirmarlas debe fallar).
  insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen)
    values (rest[1], usr[1], 'merma', jsonb_build_object('insumo_id', carne[2], 'cantidad', 100), 'Merma de un insumo ajeno')
    returning id into acc_merma_ajena;
  insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen)
    values (rest[1], usr[1], 'venta', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('plato_id', plato[2], 'cantidad', 1))), 'Venta de un plato ajeno')
    returning id into acc_venta_ajena;
  insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen)
    values (rest[1], usr[1], 'compra', jsonb_build_object('lineas', jsonb_build_array(jsonb_build_object('insumo_id', carne[2], 'cantidad', 1, 'costo_total', 1))), 'Compra de un insumo ajeno')
    returning id into acc_compra_ajena;

  -- =================================================================
  -- 2-5) Como service role: A intenta operar sobre objetos de B
  -- =================================================================
  execute huella_sql into huella_antes using rest[2];

  ops := array[
    -- 2) Funciones del backend con el restaurante A y objetos de B
    array['02_funciones_sobre_objetos_ajenos', 'vender_plato_ajeno',
      format('select public.registrar_venta(%L::uuid, %L::uuid, %L::jsonb)', rest[1], usr[1],
        jsonb_build_array(jsonb_build_object('plato_id', plato[2], 'cantidad', 1)))],
    array['02_funciones_sobre_objetos_ajenos', 'vender_plato_propio_y_ajeno',
      format('select public.registrar_venta(%L::uuid, %L::uuid, %L::jsonb)', rest[1], usr[1],
        jsonb_build_array(jsonb_build_object('plato_id', plato[1], 'cantidad', 1), jsonb_build_object('plato_id', plato[2], 'cantidad', 1)))],
    array['02_funciones_sobre_objetos_ajenos', 'editar_plato_ajeno',
      format('select public.guardar_plato(%L::uuid, %s, %L, %L, 1, true, null)', rest[1], plato[2], 'Robado', 'Carta')],
    array['02_funciones_sobre_objetos_ajenos', 'receta_con_insumo_ajeno',
      format('select public.guardar_plato(%L::uuid, null, %L, %L, 10, true, %L::jsonb)', rest[1], 'Plato raro', 'Carta',
        jsonb_build_array(jsonb_build_object('insumo_id', carne[2], 'cantidad', 1)))],
    array['02_funciones_sobre_objetos_ajenos', 'editar_receta_con_insumo_ajeno',
      format('select public.guardar_plato(%L::uuid, %s, %L, %L, 22, true, %L::jsonb)', rest[1], plato[1], 'Lomo saltado', 'Carta',
        jsonb_build_array(jsonb_build_object('insumo_id', carne[1], 'cantidad', 200), jsonb_build_object('insumo_id', carne[2], 'cantidad', 1)))],
    array['02_funciones_sobre_objetos_ajenos', 'comprar_insumo_ajeno',
      format('select public.registrar_compra(%L::uuid, %L::uuid, %L::jsonb)', rest[1], usr[1],
        jsonb_build_array(jsonb_build_object('insumo_id', carne[2], 'cantidad', 1, 'costo_total', 1)))],
    array['02_funciones_sobre_objetos_ajenos', 'merma_de_insumo_ajeno',
      format('select public.ajustar_stock(%L::uuid, %L::uuid, %s, %L, 1)', rest[1], usr[1], carne[2], 'merma')],
    array['02_funciones_sobre_objetos_ajenos', 'conteo_de_insumo_ajeno',
      format('select public.ajustar_stock(%L::uuid, %L::uuid, %s, %L, 1)', rest[1], usr[1], carne[2], 'ajuste')],
    array['02_funciones_sobre_objetos_ajenos', 'anular_venta_ajena',
      format('select public.anular_venta(%L::uuid, %s)', rest[1], venta[2])],
    array['02_funciones_sobre_objetos_ajenos', 'confirmar_accion_ajena',
      format('select public.confirmar_accion(%L::uuid, %L::uuid, %L::uuid)', rest[1], usr[1], acc[2])],
    -- Con el usuario dueño de la acción: lo que la rechaza es el filtro por restaurante.
    array['02_funciones_sobre_objetos_ajenos', 'confirmar_accion_ajena_con_usuario_ajeno',
      format('select public.confirmar_accion(%L::uuid, %L::uuid, %L::uuid)', rest[1], usr[2], acc[2])],
    array['02_funciones_sobre_objetos_ajenos', 'confirmar_accion_propia_con_merma_ajena',
      format('select public.confirmar_accion(%L::uuid, %L::uuid, %L::uuid)', rest[1], usr[1], acc_merma_ajena)],
    array['02_funciones_sobre_objetos_ajenos', 'confirmar_accion_propia_con_venta_ajena',
      format('select public.confirmar_accion(%L::uuid, %L::uuid, %L::uuid)', rest[1], usr[1], acc_venta_ajena)],
    array['02_funciones_sobre_objetos_ajenos', 'confirmar_accion_propia_con_compra_ajena',
      format('select public.confirmar_accion(%L::uuid, %L::uuid, %L::uuid)', rest[1], usr[1], acc_compra_ajena)],
    array['02_funciones_sobre_objetos_ajenos', 'actualizar_gasto_puntual_ajeno',
      format('select public.actualizar_gasto(%L::uuid, %L, 1)', rest[1], gp[2])],
    array['02_funciones_sobre_objetos_ajenos', 'actualizar_gasto_fijo_ajeno',
      format('select public.actualizar_gasto(%L::uuid, %L, 1)', rest[1], gf[2])],
    array['02_funciones_sobre_objetos_ajenos', 'quitar_gasto_puntual_ajeno',
      format('select public.quitar_gasto(%L::uuid, %L)', rest[1], gp[2])],
    array['02_funciones_sobre_objetos_ajenos', 'quitar_gasto_fijo_ajeno',
      format('select public.quitar_gasto(%L::uuid, %L)', rest[1], gf[2])],

    -- 3) Triggers check_tenant: inserts y updates directos que mezclan restaurantes
    array['03_check_tenant', 'insert_receta_plato_A_insumo_B',
      format('insert into public.recetas(plato_id, insumo_id, cantidad) values (%s, %s, 1)', plato[1], carne[2])],
    array['03_check_tenant', 'insert_detalle_venta_A_plato_B',
      format('insert into public.venta_detalle(venta_id, plato_id, cantidad, precio_unitario) values (%s, %s, 1, 1)', venta[1], plato[2])],
    array['03_check_tenant', 'insert_compra_A_insumo_B',
      format('insert into public.compras(restaurante_id, insumo_id, cantidad, costo_total) values (%L::uuid, %s, 1, 1)', rest[1], carne[2])],
    array['03_check_tenant', 'insert_movimiento_A_insumo_B',
      format('insert into public.movimientos_inventario(restaurante_id, insumo_id, tipo, cantidad) values (%L::uuid, %s, %L, 1)', rest[1], carne[2], 'ajuste')],
    array['03_check_tenant', 'update_receta_A_a_insumo_B',
      format('update public.recetas set insumo_id = %s where plato_id = %s and insumo_id = %s', carne[2], plato[1], carne[1])],
    array['03_check_tenant', 'update_detalle_venta_A_a_plato_B',
      format('update public.venta_detalle set plato_id = %s where venta_id = %s', plato[2], venta[1])],
    array['03_check_tenant', 'update_compra_A_a_restaurante_B',
      format('update public.compras set restaurante_id = %L::uuid where id = %s', rest[2], compra[1])],
    array['03_check_tenant', 'update_movimiento_A_a_restaurante_B',
      format('update public.movimientos_inventario set restaurante_id = %L::uuid where compra_id = %s', rest[2], compra[1])],

    -- 4) registrar_compra con un proveedor de otro restaurante (lo valida desde la migración 0007).
    array['04_proveedor_ajeno', 'compra_con_proveedor_ajeno',
      format('select public.registrar_compra(%L::uuid, %L::uuid, %L::jsonb, %s)', rest[1], usr[1],
        jsonb_build_array(jsonb_build_object('insumo_id', carne[1], 'cantidad', 1, 'costo_total', 1)), prov[2])]
  ];

  foreach q slice 1 in array ops loop
    begin
      execute q[3];
      get diagnostics c = row_count;
      veredicto := case when c > 0 then 'PERMITIDA (MAL)'
                        else 'ERROR DE LA PRUEBA (MAL): 0 filas, el where no encontró la fila' end;
    exception
      when raise_exception then veredicto := 'bloqueada: ' || sqlerrm;
      when others then veredicto := 'ERROR INESPERADO (MAL): ' || sqlstate || ' ' || sqlerrm;
    end;
    r := r || jsonb_build_object(q[1], coalesce(r -> q[1], '{}'::jsonb) || jsonb_build_object(q[2], veredicto));
  end loop;

  -- 5) Nada de B cambió con los intentos anteriores.
  execute huella_sql into huella_despues using rest[2];
  r := r || jsonb_build_object('05_B_intacto_tras_los_ataques',
    case when huella_antes = huella_despues then 'ok' else 'MAL: los datos de B cambiaron' end);

  -- =================================================================
  -- 6-8) Como cada usuario (authenticated)
  -- =================================================================
  for k in 1..2 loop
    letra := chr(64 + k);

    -- Todo lo que necesita leer filas se prepara ANTES de cambiar de rol (como service role).
    select coalesce(array_agg(id), '{}') into pls from public.platos where restaurante_id = rest[k];
    select coalesce(array_agg(id), '{}') into vts from public.ventas where restaurante_id = rest[k];
    preds := '{}';
    foreach t in array tablas || vistas loop
      preds := preds || jsonb_build_object(t, case t
        when 'restaurantes'  then format('id = %L::uuid', rest[k])
        when 'recetas'       then format('plato_id = any(%L::bigint[])', pls)
        when 'venta_detalle' then format('venta_id = any(%L::bigint[])', vts)
        else format('restaurante_id = %L::uuid', rest[k]) end);
    end loop;
    esp := '{}';
    foreach t in array tablas || vistas loop
      execute format('select count(*) from public.%I where %s', t, preds ->> t) into n_esp;
      esp := esp || jsonb_build_object(t, n_esp);
    end loop;

    -- 7) Escritura directa en cada tabla, con datos válidos del propio restaurante
    --    (si fallara, que sea por seguridad y no por una restricción).
    ops := '{}';
    foreach t in array tablas loop
      pred := preds ->> t;
      ops := ops || array[
        array['07_escritura_directa_' || letra, t || '_insert', case t
          when 'restaurantes' then format('insert into public.restaurantes(nombre) values (%L)', 'Hack')
          when 'perfiles' then format('insert into public.perfiles(user_id, restaurante_id, nombre) values (%L::uuid, %L::uuid, %L)', uc, rest[k], 'Hack')
          when 'proveedores' then format('insert into public.proveedores(restaurante_id, nombre) values (%L::uuid, %L)', rest[k], 'Hack')
          when 'insumos' then format('insert into public.insumos(restaurante_id, nombre, unidad) values (%L::uuid, %L, %L)', rest[k], 'Hack', 'g')
          when 'platos' then format('insert into public.platos(restaurante_id, nombre, categoria, precio) values (%L::uuid, %L, %L, 1)', rest[k], 'Hack', 'Carta')
          when 'recetas' then format('insert into public.recetas(plato_id, insumo_id, cantidad) values (%s, %s, 1)', plato[k], limon[k])
          when 'ventas' then format('insert into public.ventas(restaurante_id, total) values (%L::uuid, 1)', rest[k])
          when 'venta_detalle' then format('insert into public.venta_detalle(venta_id, plato_id, cantidad, precio_unitario) values (%s, %s, 1, 1)', venta[k], plato[k])
          when 'compras' then format('insert into public.compras(restaurante_id, insumo_id, cantidad, costo_total) values (%L::uuid, %s, 1, 1)', rest[k], carne[k])
          when 'movimientos_inventario' then format('insert into public.movimientos_inventario(restaurante_id, insumo_id, tipo, cantidad) values (%L::uuid, %s, %L, 1)', rest[k], carne[k], 'ajuste')
          when 'gastos_fijos' then format('insert into public.gastos_fijos(restaurante_id, nombre, categoria, monto) values (%L::uuid, %L, %L, 1)', rest[k], 'Hack', 'otros')
          when 'gastos' then format('insert into public.gastos(restaurante_id, categoria, monto) values (%L::uuid, %L, 1)', rest[k], 'otros')
          when 'notas_negocio' then format('insert into public.notas_negocio(restaurante_id, texto) values (%L::uuid, %L)', rest[k], 'Hack')
          when 'acciones_pendientes' then format('insert into public.acciones_pendientes(restaurante_id, user_id, tipo, payload, resumen) values (%L::uuid, %L::uuid, %L, %L::jsonb, %L)', rest[k], usr[k], 'nota', '{}', 'Hack')
          when 'log_chat' then format('insert into public.log_chat(restaurante_id, texto) values (%L::uuid, %L)', rest[k], 'Hack')
          when 'lista_compras_eventos' then format('insert into public.lista_compras_eventos(restaurante_id, tipo) values (%L::uuid, %L)', rest[k], 'generada')
        end],
        array['07_escritura_directa_' || letra, t || '_update', case t
          when 'restaurantes'  then format('update public.restaurantes set nombre = nombre where %s', pred)
          when 'recetas'       then format('update public.recetas set cantidad = cantidad where %s', pred)
          when 'venta_detalle' then format('update public.venta_detalle set cantidad = cantidad where %s', pred)
          else format('update public.%I set restaurante_id = restaurante_id where %s', t, pred) end],
        array['07_escritura_directa_' || letra, t || '_delete', format('delete from public.%I where %s', t, pred)]
      ];
    end loop;
    -- El ataque más directo: cambiarse de restaurante editando el propio perfil.
    ops := ops || array[array['07_escritura_directa_' || letra, 'perfiles_cambiarse_de_restaurante',
      format('update public.perfiles set restaurante_id = %L::uuid where user_id = %L::uuid', rest[3 - k], usr[k])]];

    -- 8) Las 12 funciones de escritura, con su propio restaurante.
    ops := ops || array[
      array['08_funciones_como_usuario_' || letra, 'registrar_venta',
        format('select public.registrar_venta(%L::uuid, %L::uuid, %L::jsonb)', rest[k], usr[k],
          jsonb_build_array(jsonb_build_object('plato_id', plato[k], 'cantidad', 1)))],
      array['08_funciones_como_usuario_' || letra, 'anular_venta',
        format('select public.anular_venta(%L::uuid, %s)', rest[k], venta[k])],
      array['08_funciones_como_usuario_' || letra, 'registrar_compra',
        format('select public.registrar_compra(%L::uuid, %L::uuid, %L::jsonb)', rest[k], usr[k],
          jsonb_build_array(jsonb_build_object('insumo_id', carne[k], 'cantidad', 1, 'costo_total', 1)))],
      array['08_funciones_como_usuario_' || letra, 'ajustar_stock',
        format('select public.ajustar_stock(%L::uuid, %L::uuid, %s, %L, 1)', rest[k], usr[k], carne[k], 'ajuste')],
      array['08_funciones_como_usuario_' || letra, 'confirmar_accion',
        format('select public.confirmar_accion(%L::uuid, %L::uuid, %L::uuid)', rest[k], usr[k], acc[k])],
      array['08_funciones_como_usuario_' || letra, 'guardar_plato',
        format('select public.guardar_plato(%L::uuid, null, %L, %L, 1, true, null)', rest[k], 'Hack', 'Carta')],
      array['08_funciones_como_usuario_' || letra, 'crear_insumo',
        format('select public.crear_insumo(%L::uuid, %L::uuid, %L::jsonb)', rest[k], usr[k],
          '{"nombre":"Hack","unidad":"g","costo_unitario":1,"presentacion_compra":1}')],
      array['08_funciones_como_usuario_' || letra, 'importar_insumos',
        format('select public.importar_insumos(%L::uuid, %L::uuid, %L::jsonb)', rest[k], usr[k], '[]')],
      array['08_funciones_como_usuario_' || letra, 'crear_gasto',
        format('select public.crear_gasto(%L::uuid, %L::uuid, %L, %L, 1, false)', rest[k], usr[k], 'Hack', 'otros')],
      array['08_funciones_como_usuario_' || letra, 'actualizar_gasto',
        format('select public.actualizar_gasto(%L::uuid, %L, 1)', rest[k], gp[k])],
      array['08_funciones_como_usuario_' || letra, 'quitar_gasto',
        format('select public.quitar_gasto(%L::uuid, %L)', rest[k], gp[k])],
      array['08_funciones_como_usuario_' || letra, 'generar_gastos_mes',
        format('select public.generar_gastos_mes(%L::uuid, %L::date)', rest[k], hoy)]
    ];

    -- ---------- Desde aquí, actuando como el usuario ----------
    perform set_config('request.jwt.claims', jsonb_build_object('sub', usr[k], 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- 6) Lectura: solo lo propio, en todas las tablas y vistas
    grupo := '{}';
    foreach t in array tablas || vistas loop
      begin
        execute format('select count(*), count(*) filter (where %s) from public.%I', preds ->> t, t) into n_tot, n_own;
        n_esp := (esp ->> t)::bigint;
        grupo := grupo || jsonb_build_object(t, case
          when n_esp = 0 then 'MAL: sin datos propios, la prueba no cubre esta relación'
          when n_own = n_esp and n_tot = n_own then format('ok (%s propias, 0 ajenas)', n_own)
          else format('MAL: ve %s de %s propias y %s ajenas', n_own, n_esp, n_tot - n_own) end);
      exception when others then
        grupo := grupo || jsonb_build_object(t, 'ERROR INESPERADO (MAL): ' || sqlstate || ' ' || sqlerrm);
      end;
    end loop;
    r := r || jsonb_build_object('06_lectura_' || letra, grupo);

    -- 7) y 8) Escrituras directas y funciones: todo debe quedar bloqueado.
    foreach q slice 1 in array ops loop
      begin
        execute q[3];
        get diagnostics c = row_count;
        veredicto := case when c > 0 then 'PERMITIDA (MAL)' else 'bloqueada (0 filas)' end;
      exception
        when insufficient_privilege then veredicto := 'bloqueada: ' || sqlerrm;
        when others then veredicto := 'ERROR INESPERADO (MAL): ' || sqlstate || ' ' || sqlerrm;
      end;
      r := r || jsonb_build_object(q[1], coalesce(r -> q[1], '{}'::jsonb) || jsonb_build_object(q[2], veredicto));
    end loop;

    reset role;
  end loop;

  -- =================================================================
  -- 9) anon no ve nada
  -- =================================================================
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  set local role anon;
  grupo := '{}';
  foreach t in array tablas || vistas loop
    begin
      execute format('select count(*) from public.%I', t) into n_tot;
      grupo := grupo || jsonb_build_object(t, case when n_tot = 0 then 'ok (0 filas)' else format('MAL: ve %s filas', n_tot) end);
    exception
      when insufficient_privilege then grupo := grupo || jsonb_build_object(t, 'ok (sin permiso)');
      when others then grupo := grupo || jsonb_build_object(t, 'ERROR INESPERADO (MAL): ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  reset role;
  r := r || jsonb_build_object('09_anon', grupo);

  -- Total de resultados con "MAL" (esperado 0).
  r := r || jsonb_build_object('00_fallas', (length(r::text) - length(replace(r::text, 'MAL', ''))) / 3);

  -- jsonb ordena las claves por largo; se devuelve una lista para que salga en orden de sección.
  raise exception 'RESULTADOS: %',
    jsonb_pretty((select jsonb_agg(jsonb_build_object(key, value) order by key) from jsonb_each(r)));
end $$;
