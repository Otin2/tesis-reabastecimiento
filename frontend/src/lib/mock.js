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
]

const ventasHoy = { platos: 18, total: 342 }
const pedidosAceptados = []

const pausa = (ms = 250) => new Promise((r) => setTimeout(r, ms))

function nivel(i) {
  if (i.stock > i.punto_reorden) return null
  return i.stock <= i.punto_reorden * 0.5 ? 'Crítico' : 'Bajo'
}

function porAgotarse() {
  return insumos
    .filter((i) => nivel(i))
    .map((i) => ({ ...i, nivel: nivel(i) }))
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'Crítico' ? -1 : 1))
}

function pedidoSugerido() {
  const lineas = porAgotarse().map((i) => {
    const falta = i.punto_reorden * 2 - i.stock
    const cantidad = Math.ceil(falta / i.presentacion_compra) * i.presentacion_compra
    return {
      insumo_id: i.id,
      nombre: i.nombre,
      unidad: i.unidad,
      stock: i.stock,
      punto_reorden: i.punto_reorden,
      uso_semanal: i.uso_semanal,
      cantidad,
      costo_estimado: +(cantidad * i.costo_unitario).toFixed(2),
    }
  })
  return {
    lineas,
    resumen: {
      n_insumos: lineas.length,
      costo_total: +lineas.reduce((s, l) => s + l.costo_estimado, 0).toFixed(2),
    },
  }
}

export const mock = {
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
  async resumen() {
    await pausa(150)
    return { ...ventasHoy, por_agotarse: porAgotarse() }
  },
  async pedido() {
    await pausa(200)
    return pedidoSugerido()
  },
  async aceptarPedido(lineas) {
    await pausa()
    pedidosAceptados.push(lineas)
    return { ok: true }
  },
  async chat(texto) {
    await pausa(700)
    const t = texto.toLowerCase()
    const enKg = (i) => (i.unidad === 'unid' ? `${i.stock} unid` : `${(i.stock / 1000).toLocaleString('es-PE')} ${i.unidad === 'g' ? 'kg' : 'L'}`)
    const insumo = insumos.find((i) => t.includes(i.nombre.toLowerCase().split(' ')[0]))
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
    if (/(pedido|comprar|compra)/.test(t)) {
      const p = pedidoSugerido()
      return { respuesta: `Te sugiero comprar ${p.resumen.n_insumos} insumos, por unos S/ ${p.resumen.costo_total.toFixed(2)}.`, funcion_usada: 'pedido_sugerido' }
    }
    return { respuesta: 'Solo puedo ayudarte con el inventario y las ventas del restaurante.', funcion_usada: 'fuera_de_tema' }
  },
}
