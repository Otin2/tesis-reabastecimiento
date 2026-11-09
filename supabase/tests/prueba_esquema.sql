-- Prueba del esquema. Se puede ejecutar cuantas veces se quiera: al final lanza una
-- excepción a propósito, así TODO lo que inserta se deshace (no deja datos).
-- El resultado aparece en el mensaje de error "RESULTADOS: {...}".
-- Ejecutar en el SQL Editor de Supabase o con execute_sql.
--
-- Resultados esperados (verificados el 9-nov-2026):
--   1_margen_lomo           costo 9.29, ganancia 12.71, margen_pct 57.8
--   2_carne_tras_vender_2   11600   (12000 - 2 x 200 g)        2_aceite: 8940
--   3_carne_tras_anular     12000   (anular devuelve el stock) 3_movimientos: 12
--   4_carne_tras_compra     17000, 4_costo_unitario 0.04, 4_vence_el_es_hoy_mas_3 true
--   5_perdida_merma         40.00, 5_consumo_carne_hoy 200, 5_resumen_hoy {platos 1, total 22}
--   6_por_agotarse          Cebolla Bajo, Papa Bajo, Tomate Crítico
--   7_generados 1ra vez 1, 2da vez 0, 7_suma_mes_prorrateada 180.00
--   8_*                     el usuario solo ve su restaurante; escritura directa y RPC bloqueadas

do $$
declare
  a uuid; b uuid; u uuid := gen_random_uuid();
  r jsonb := '{}';
  pl bigint; v bigint; v2 bigint;
  i_carne bigint; i_papa bigint; i_arroz bigint; i_tom bigint; i_ace bigint; i_ceb bigint;
  n1 int; n2 int;
begin
  insert into public.restaurantes(nombre) values ('A') returning id into a;
  insert into public.restaurantes(nombre) values ('B') returning id into b;

  insert into public.insumos(restaurante_id,nombre,unidad,costo_unitario,stock,punto_reorden,vida_util_dias) values (a,'Carne','g',0.035,12000,8000,3) returning id into i_carne;
  insert into public.insumos(restaurante_id,nombre,unidad,costo_unitario,stock,punto_reorden) values (a,'Papa','g',0.0032,10000,15000) returning id into i_papa;
  insert into public.insumos(restaurante_id,nombre,unidad,costo_unitario,stock,punto_reorden) values (a,'Arroz','g',0.0045,40000,15000) returning id into i_arroz;
  insert into public.insumos(restaurante_id,nombre,unidad,costo_unitario,stock,punto_reorden) values (a,'Tomate','g',0.004,6000,3000) returning id into i_tom;
  insert into public.insumos(restaurante_id,nombre,unidad,costo_unitario,stock,punto_reorden) values (a,'Aceite','ml',0.009,9000,3000) returning id into i_ace;
  insert into public.insumos(restaurante_id,nombre,unidad,costo_unitario,stock,punto_reorden) values (a,'Cebolla','g',0.0028,3000,5000) returning id into i_ceb;
  insert into public.platos(restaurante_id,nombre,categoria,precio) values (a,'Lomo saltado','Carta',22) returning id into pl;
  insert into public.recetas values (pl,i_carne,200),(pl,i_papa,250),(pl,i_arroz,150),(pl,i_tom,80),(pl,i_ace,30),(pl,i_ceb,80);

  -- 1) Margen del lomo (referencia del PLAN: 9.29 / 12.71 / 57.8)
  r := r || jsonb_build_object('1_margen_lomo', (select jsonb_build_object('costo', round(costo,2), 'ganancia', round(ganancia,2), 'margen_pct', margen_pct) from public.margen_por_plato where plato_id = pl));

  -- 2) Una venta descuenta la receta
  insert into public.ventas(restaurante_id,total) values (a,44) returning id into v;
  insert into public.venta_detalle(venta_id,plato_id,cantidad,precio_unitario) values (v,pl,2,22);
  r := r || jsonb_build_object('2_carne_tras_vender_2', (select stock from public.insumos where id=i_carne), '2_aceite_tras_vender_2', (select stock from public.insumos where id=i_ace));

  -- 3) Anular devuelve el stock
  update public.ventas set estado='anulada' where id=v;
  r := r || jsonb_build_object('3_carne_tras_anular', (select stock from public.insumos where id=i_carne), '3_movimientos', (select count(*) from public.movimientos_inventario where venta_id=v));

  -- 4) Compra: suma stock, actualiza costo y calcula vencimiento
  insert into public.compras(restaurante_id,insumo_id,cantidad,costo_total) values (a,i_carne,5000,200);
  r := r || jsonb_build_object('4_carne_tras_compra', (select stock from public.insumos where id=i_carne), '4_costo_unitario', (select costo_unitario from public.insumos where id=i_carne), '4_vence_el_es_hoy_mas_3', (select vence_el = (now() at time zone 'America/Lima')::date + 3 from public.compras where insumo_id=i_carne));

  -- 5) Mermas, consumo diario, resumen de hoy y ganancia por día
  insert into public.movimientos_inventario(restaurante_id,insumo_id,tipo,cantidad,motivo) values (a,i_carne,'merma',-1000,'test');
  insert into public.ventas(restaurante_id,total) values (a,22) returning id into v2;
  insert into public.venta_detalle(venta_id,plato_id,cantidad,precio_unitario) values (v2,pl,1,22);
  r := r || jsonb_build_object('5_perdida_merma', (select round(sum(costo),2) from public.perdidas_por_dia where restaurante_id=a),
                               '5_consumo_carne_hoy', (select sum(consumo) from public.consumo_diario_insumo where restaurante_id=a and insumo_id=i_carne),
                               '5_resumen_hoy', (select jsonb_build_object('platos',platos,'total',total) from public.resumen_hoy where restaurante_id=a),
                               '5_ganancia_dia', (select jsonb_build_object('ventas',ventas,'costo',round(costo,2),'ganancia',round(ganancia,2)) from public.ganancia_por_dia where restaurante_id=a));

  -- 6) Insumos por agotarse
  update public.insumos set stock = 1000 where id = i_tom;
  r := r || jsonb_build_object('6_por_agotarse', (select jsonb_agg(jsonb_build_object('n',nombre,'nivel',nivel) order by nombre) from public.insumos_por_agotarse where restaurante_id=a));

  -- 7) Gastos fijos: generar el mes una vez, y que no duplique
  insert into public.gastos_fijos(restaurante_id,nombre,categoria,monto,dia_mes) values (a,'Luz','servicios',180,31);
  n1 := public.generar_gastos_mes(a, current_date);
  n2 := public.generar_gastos_mes(a, current_date);
  r := r || jsonb_build_object('7_generados_1ra_vez', n1, '7_generados_2da_vez', n2,
        '7_suma_mes_prorrateada', (select round(sum(monto),2) from public.gastos_por_dia where restaurante_id=a and date_trunc('month', dia) = date_trunc('month', current_date)));

  -- 8) Seguridad: un usuario del restaurante A solo ve lo suyo y no puede escribir
  insert into auth.users(id,email) values (u,'test@test.local');
  insert into public.perfiles(user_id,restaurante_id,nombre) values (u,a,'test');
  insert into public.insumos(restaurante_id,nombre,unidad) values (b,'SoloB','g');
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('8_insumos_visibles_(esperado 6)', (select count(*) from public.insumos),
                               '8_ve_SoloB_(esperado 0)', (select count(*) from public.insumos where nombre='SoloB'),
                               '8_restaurantes_visibles_(esperado 1)', (select count(*) from public.restaurantes),
                               '8_vista_margen_filas_(esperado 1)', (select count(*) from public.margen_por_plato),
                               '8_resumen_hoy_filas_(esperado 1)', (select count(*) from public.resumen_hoy));
  begin
    insert into public.insumos(restaurante_id,nombre,unidad) values (a,'hack','g');
    r := r || jsonb_build_object('8_escritura_directa','PERMITIDA (MAL)');
  exception when others then
    r := r || jsonb_build_object('8_escritura_directa','bloqueada');
  end;
  begin
    perform public.generar_gastos_mes(a, current_date);
    r := r || jsonb_build_object('8_rpc_generar_gastos','PERMITIDA (MAL)');
  exception when others then
    r := r || jsonb_build_object('8_rpc_generar_gastos','bloqueada');
  end;
  reset role;
  set local role anon;
  r := r || jsonb_build_object('8_anon_ve_insumos_(esperado 0)', (select count(*) from public.insumos));
  reset role;

  raise exception 'RESULTADOS: %', jsonb_pretty(r);
end $$;
