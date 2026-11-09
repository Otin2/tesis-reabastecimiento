// Datos de ejemplo para el MODO DEMO (sin backend). Coinciden con el seed del PLAN.
// Unidades base: g, ml, unid.

const platos = [
  { id: 1, nombre: 'Menú del día', categoria: 'Menú', precio: 12 },
  { id: 2, nombre: 'Lomo saltado', categoria: 'Carta', precio: 22 },
  { id: 3, nombre: 'Arroz con pollo', categoria: 'Carta', precio: 16 },
  { id: 4, nombre: 'Ají de gallina', categoria: 'Carta', precio: 16 },
  { id: 5, nombre: 'Ceviche', categoria: 'Carta', precio: 25 },
  { id: 6, nombre: 'Chicha morada (jarra)', categoria: 'Bebidas', precio: 10 },
]

const insumos = [
  { id: 1, nombre: 'Pollo', unidad: 'g', stock: 3000, punto_reorden: 8000, presentacion_compra: 1000, costo_unitario: 0.012, uso_semanal: 14000 },
  { id: 2, nombre: 'Papa amarilla', unidad: 'g', stock: 10000, punto_reorden: 15000, presentacion_compra: 5000, costo_unitario: 0.0032, uso_semanal: 22000 },
  { id: 3, nombre: 'Ají amarillo', unidad: 'g', stock: 500, punto_reorden: 2000, presentacion_compra: 500, costo_unitario: 0.008, uso_semanal: 2500 },
  { id: 4, nombre: 'Cebolla roja', unidad: 'g', stock: 3000, punto_reorden: 5000, presentacion_compra: 1000, costo_unitario: 0.0028, uso_semanal: 7000 },
  { id: 5, nombre: 'Carne de res', unidad: 'g', stock: 12000, punto_reorden: 8000, presentacion_compra: 1000, costo_unitario: 0.035, uso_semanal: 9000 },
  { id: 6, nombre: 'Arroz', unidad: 'g', stock: 40000, punto_reorden: 15000, presentacion_compra: 50000, costo_unitario: 0.0045, uso_semanal: 18000 },
  { id: 7, nombre: 'Aceite', unidad: 'ml', stock: 9000, punto_reorden: 3000, presentacion_compra: 1000, costo_unitario: 0.009, uso_semanal: 3500 },
  { id: 8, nombre: 'Tomate', unidad: 'g', stock: 6000, punto_reorden: 3000, presentacion_compra: 1000, costo_unitario: 0.004, uso_semanal: 4000 },
  { id: 9, nombre: 'Pescado', unidad: 'g', stock: 5000, punto_reorden: 3000, presentacion_compra: 1000, costo_unitario: 0.03, uso_semanal: 6000 },
  { id: 10, nombre: 'Limón', unidad: 'g', stock: 3000, punto_reorden: 1500, presentacion_compra: 1000, costo_unitario: 0.006, uso_semanal: 2000 },
  { id: 11, nombre: 'Maíz morado', unidad: 'g', stock: 2500, punto_reorden: 1000, presentacion_compra: 1000, costo_unitario: 0.008, uso_semanal: 1500 },
  // Uso general: no entran en recetas, no descuentan stock ni generan alertas.
  { id: 12, nombre: 'Servilletas', unidad: 'unid', en_recetas: false, stock: null, presentacion_compra: 100, costo_unitario: 0.03 },
  { id: 13, nombre: 'Bolsas para llevar', unidad: 'unid', en_recetas: false, stock: null, presentacion_compra: 50, costo_unitario: 0.1 },
]

const ventasHoy = { platos: 18, total: 342 }

const pausa = (ms = 250) => new Promise((r) => setTimeout(r, ms))

function nivel(i) {
  if (i.stock > i.punto_reorden) return null
  return i.stock <= i.punto_reorden * 0.5 ? 'Crítico' : 'Bajo'
}

function porAgotarse() {
  return insumos
    .filter((i) => i.en_recetas !== false && nivel(i))
    .map((i) => ({ ...i, nivel: nivel(i) }))
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'Crítico' ? -1 : 1))
}

// Precio por unidad base (S/ por g o ml) y recetas de ejemplo. El lomo saltado
// coincide con el PLAN: costo 9.29, ganancia 12.71, margen 57.8 %.
const precios = {
  Carne: 0.035, Papa: 0.0032, Arroz: 0.0045, Tomate: 0.004, Aceite: 0.009, Cebolla: 0.0028,
  Pollo: 0.012, 'Ají amarillo': 0.008, Pescado: 0.03, Limón: 0.006, 'Maíz morado': 0.008,
}
const unidadDe = { Aceite: 'ml' }
const recetas = {
  1: { Pollo: 120, Arroz: 150, Papa: 100, Aceite: 15, Cebolla: 40 },
  2: { Carne: 200, Papa: 250, Arroz: 150, Tomate: 80, Aceite: 30, Cebolla: 80 },
  3: { Pollo: 250, Arroz: 180, 'Ají amarillo': 30, Cebolla: 60, Aceite: 20 },
  4: { Pollo: 200, Papa: 200, 'Ají amarillo': 50, Arroz: 150, Aceite: 20 },
  5: { Pescado: 250, Limón: 60, Cebolla: 60, 'Ají amarillo': 20 },
  6: { 'Maíz morado': 150, Limón: 20 },
}
const vendidosSemana = { 1: 70, 2: 48, 3: 35, 4: 30, 5: 26, 6: 40 }
const pesoDia = [0.1, 0.11, 0.12, 0.13, 0.17, 0.2, 0.17]
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Gastos mensuales de ejemplo. En una semana cuenta 7/30 de cada uno (se reparten por día).
const gastosMensuales = [
  ['Servicios', 'Luz', 180],
  ['Servicios', 'Agua', 90],
  ['Servicios', 'Internet', 80],
  ['Servicios', 'Gas', 120],
  ['Sueldos', 'Cocinera', 1300],
  ['Sueldos', 'Mozo', 1100],
  ['Alquiler', 'Alquiler del local', 1200],
]

function costosSemana(costoInsumos) {
  return [
    { id: 'insumos', grupo: 'Insumos', nombre: 'Insumos de lo vendido', monto: costoInsumos },
    { id: 'mermas', grupo: 'Insumos', nombre: 'Mermas y uso propio', monto: 24.5 },
    ...gastosMensuales.map(([grupo, nombre, mensual]) => ({
      id: nombre,
      grupo,
      nombre,
      monto: +((mensual * 7) / 30).toFixed(2),
    })),
  ]
}

function calcularGanancias() {
  const filas = platos.map((p) => {
    const receta = Object.entries(recetas[p.id]).map(([insumo, cantidad]) => ({
      insumo,
      cantidad,
      unidad: unidadDe[insumo] ?? 'g',
      precio_unitario: precios[insumo],
      costo: +(cantidad * precios[insumo]).toFixed(2),
    }))
    const costo = receta.reduce((s, r) => s + r.cantidad * r.precio_unitario, 0)
    const ganancia = p.precio - costo
    const vendidos = vendidosSemana[p.id]
    return {
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      costo: +costo.toFixed(2),
      ganancia: +ganancia.toFixed(2),
      margen_pct: +((ganancia / p.precio) * 100).toFixed(1),
      vendidos,
      ventas_total: +(p.precio * vendidos).toFixed(2),
      ganancia_total: +(ganancia * vendidos).toFixed(2),
      receta,
    }
  })
  const ventas = filas.reduce((s, f) => s + f.ventas_total, 0)
  const ganancia = filas.reduce((s, f) => s + f.ganancia_total, 0)
  return {
    platos: filas.sort((a, b) => b.margen_pct - a.margen_pct),
    semana: {
      ventas: +ventas.toFixed(2),
      costo: +(ventas - ganancia).toFixed(2),
      ganancia: +ganancia.toFixed(2),
      margen_pct: +((ganancia / ventas) * 100).toFixed(1),
      costos: costosSemana(+(ventas - ganancia).toFixed(2)),
      dias: DIAS.map((dia, i) => ({ dia, ganancia: +(ganancia * pesoDia[i]).toFixed(2) })),
    },
  }
}

export const mock = {
  async ganancias() {
    await pausa(200)
    return calcularGanancias()
  },
  async login() {
    await pausa()
    return { nombre: 'Dueña (demo)' }
  },
  async platos() {
    await pausa(100)
    return platos
  },
  async guardarVenta({ items }) {
    await pausa()
    const unidades = items.reduce((s, it) => s + it.cantidad, 0)
    const total = items.reduce((s, it) => s + it.cantidad * platos.find((p) => p.id === it.plato_id).precio, 0)
    ventasHoy.platos += unidades
    ventasHoy.total += total
    return { ok: true, total }
  },
  async listaCompras() {
    await pausa(200)
    // Fase 1 del PLAN: cantidad = punto_reorden × 2 − stock, redondeada a la presentación de compra.
    const lineas = porAgotarse().map((i) => {
      const cantidad = Math.ceil((i.punto_reorden * 2 - i.stock) / i.presentacion_compra) * i.presentacion_compra
      return {
        insumo_id: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        nivel: i.nivel,
        stock: i.stock,
        cantidad,
        presentacion_compra: i.presentacion_compra,
        costo_unitario: i.costo_unitario,
        costo_estimado: +(cantidad * i.costo_unitario).toFixed(2),
      }
    })
    return {
      fecha: new Date().toISOString().slice(0, 10),
      lineas,
      costo_total: +lineas.reduce((s, l) => s + l.costo_estimado, 0).toFixed(2),
    }
  },
  async insumos() {
    await pausa(100)
    return insumos.map(({ id, nombre, unidad, presentacion_compra, costo_unitario, en_recetas }) => ({
      id, nombre, unidad, presentacion_compra, costo_unitario, en_recetas: en_recetas !== false,
    }))
  },
  async crearInsumo(d) {
    await pausa(200)
    const nuevo = {
      id: Math.max(...insumos.map((i) => i.id)) + 1,
      nombre: d.nombre,
      unidad: d.unidad,
      en_recetas: d.en_recetas,
      stock: d.en_recetas ? d.stock : null,
      punto_reorden: d.en_recetas ? d.punto_reorden : undefined,
      presentacion_compra: d.presentacion_compra,
      costo_unitario: d.costo_unitario,
      uso_semanal: 0,
    }
    insumos.push(nuevo)
    const { id, nombre, unidad, presentacion_compra, costo_unitario, en_recetas } = nuevo
    return { id, nombre, unidad, presentacion_compra, costo_unitario, en_recetas: en_recetas !== false }
  },
  async registrarEvento() {
    return { ok: true }
  },
  async resumen() {
    await pausa(150)
    return { ...ventasHoy, por_agotarse: porAgotarse() }
  },
  async chat(texto) {
    await pausa(700)
    const t = texto.toLowerCase()
    const enKg = (i) => (i.unidad === 'unid' ? `${i.stock} unid` : `${(i.stock / 1000).toLocaleString('es-PE')} ${i.unidad === 'g' ? 'kg' : 'L'}`)
    const insumo = insumos.filter((i) => i.en_recetas !== false).find((i) => t.includes(i.nombre.toLowerCase().split(' ')[0]))
    if (insumo && /(cu[aá]nto|queda|stock|hay)/.test(t)) {
      return {
        respuesta: `Quedan ${enKg(insumo)} de ${insumo.nombre.toLowerCase()}.`,
        funcion_usada: 'consultar_stock',
      }
    }
    if (/(agot|poco|falta|bajo)/.test(t)) {
      const l = porAgotarse().map((i) => i.nombre.toLowerCase())
      return { respuesta: `Por agotarse: ${l.join(', ')}.`, funcion_usada: 'insumos_por_agotarse' }
    }
    if (/(plato|sale m[aá]s|vend)/.test(t)) {
      return { respuesta: 'El lomo saltado es el plato que más sale (demo).', funcion_usada: 'ventas_por_plato' }
    }
    if (/(margen|ganancia)/.test(t)) {
      return { respuesta: 'El lomo saltado deja S/ 12.71 por plato, un margen de 57.8 %.', funcion_usada: 'margen_por_plato' }
    }
    return { respuesta: 'Solo puedo ayudarte con el inventario y las ventas del restaurante.', funcion_usada: 'fuera_de_tema' }
  },
}
