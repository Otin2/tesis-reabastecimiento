// Datos de ejemplo para el MODO DEMO (sin backend). Coinciden con el seed del PLAN.
// Unidades base: g, ml, unid. Todo vive en memoria: al recargar la página vuelve al inicio.

const DIA = 86400000
const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString()
const hoyA = (h, m) => {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const pausa = (ms = 250) => new Promise((r) => setTimeout(r, ms))

let platos = [
  { id: 1, nombre: 'Menú del día', categoria: 'Menú', precio: 12, activo: true },
  { id: 2, nombre: 'Lomo saltado', categoria: 'Carta', precio: 22, activo: true },
  { id: 3, nombre: 'Arroz con pollo', categoria: 'Carta', precio: 16, activo: true },
  { id: 4, nombre: 'Ají de gallina', categoria: 'Carta', precio: 16, activo: true },
  { id: 5, nombre: 'Ceviche', categoria: 'Carta', precio: 25, activo: true },
  { id: 6, nombre: 'Chicha morada (jarra)', categoria: 'Bebidas', precio: 10, activo: true },
]

const insumos = [
  { id: 1, nombre: 'Pollo', unidad: 'g', stock: 3000, punto_reorden: 8000, presentacion_compra: 1000, costo_unitario: 0.012, uso_semanal: 14000, vida_util_dias: 4 },
  { id: 2, nombre: 'Papa amarilla', unidad: 'g', stock: 10000, punto_reorden: 15000, presentacion_compra: 5000, costo_unitario: 0.0032, uso_semanal: 22000 },
  { id: 3, nombre: 'Ají amarillo', unidad: 'g', stock: 500, punto_reorden: 2000, presentacion_compra: 500, costo_unitario: 0.008, uso_semanal: 2500 },
  { id: 4, nombre: 'Cebolla roja', unidad: 'g', stock: 3000, punto_reorden: 5000, presentacion_compra: 1000, costo_unitario: 0.0028, uso_semanal: 7000 },
  { id: 5, nombre: 'Carne de res', unidad: 'g', stock: 12000, punto_reorden: 8000, presentacion_compra: 1000, costo_unitario: 0.035, uso_semanal: 9000 },
  { id: 6, nombre: 'Arroz', unidad: 'g', stock: 40000, punto_reorden: 15000, presentacion_compra: 50000, costo_unitario: 0.0045, uso_semanal: 18000 },
  { id: 7, nombre: 'Aceite', unidad: 'ml', stock: 9000, punto_reorden: 3000, presentacion_compra: 1000, costo_unitario: 0.009, uso_semanal: 3500 },
  { id: 8, nombre: 'Tomate', unidad: 'g', stock: 6000, punto_reorden: 3000, presentacion_compra: 1000, costo_unitario: 0.004, uso_semanal: 4000, vida_util_dias: 6 },
  { id: 9, nombre: 'Pescado', unidad: 'g', stock: 5000, punto_reorden: 3000, presentacion_compra: 1000, costo_unitario: 0.03, uso_semanal: 6000, vida_util_dias: 2 },
  { id: 10, nombre: 'Limón', unidad: 'g', stock: 3000, punto_reorden: 1500, presentacion_compra: 1000, costo_unitario: 0.006, uso_semanal: 2000 },
  { id: 11, nombre: 'Maíz morado', unidad: 'g', stock: 2500, punto_reorden: 1000, presentacion_compra: 1000, costo_unitario: 0.008, uso_semanal: 1500 },
  // Uso general: no entran en recetas, no descuentan stock ni generan alertas.
  { id: 12, nombre: 'Servilletas', unidad: 'unid', en_recetas: false, stock: null, presentacion_compra: 100, costo_unitario: 0.03 },
  { id: 13, nombre: 'Bolsas para llevar', unidad: 'unid', en_recetas: false, stock: null, presentacion_compra: 50, costo_unitario: 0.1 },
]

// Cuánto lleva UN plato de cada insumo (unidad base). El lomo saltado coincide con el PLAN:
// costo 9.29, ganancia 12.71, margen 57.8 %.
const recetas = {
  1: [{ insumo_id: 1, cantidad: 120 }, { insumo_id: 6, cantidad: 150 }, { insumo_id: 2, cantidad: 100 }, { insumo_id: 7, cantidad: 15 }, { insumo_id: 4, cantidad: 40 }],
  2: [{ insumo_id: 5, cantidad: 200 }, { insumo_id: 2, cantidad: 250 }, { insumo_id: 6, cantidad: 150 }, { insumo_id: 8, cantidad: 80 }, { insumo_id: 7, cantidad: 30 }, { insumo_id: 4, cantidad: 80 }],
  3: [{ insumo_id: 1, cantidad: 250 }, { insumo_id: 6, cantidad: 180 }, { insumo_id: 3, cantidad: 30 }, { insumo_id: 4, cantidad: 60 }, { insumo_id: 7, cantidad: 20 }],
  4: [{ insumo_id: 1, cantidad: 200 }, { insumo_id: 2, cantidad: 200 }, { insumo_id: 3, cantidad: 50 }, { insumo_id: 6, cantidad: 150 }, { insumo_id: 7, cantidad: 20 }],
  5: [{ insumo_id: 9, cantidad: 250 }, { insumo_id: 10, cantidad: 60 }, { insumo_id: 4, cantidad: 60 }, { insumo_id: 3, cantidad: 20 }],
  6: [{ insumo_id: 11, cantidad: 150 }, { insumo_id: 10, cantidad: 20 }],
}

const compras = [
  { insumo_id: 1, cantidad: 8000, costo_total: 96, fecha: hace(3) },
  { insumo_id: 9, cantidad: 6000, costo_total: 180, fecha: hace(1) },
]

const item = (plato_id, cantidad) => {
  const p = platos.find((x) => x.id === plato_id)
  return { plato_id, nombre: p.nombre, cantidad, precio_unitario: p.precio }
}
let sigVenta = 7
const ventasLog = [
  { id: 1, fecha: hoyA(12, 5), tipo: 'mesa', mesa: '3', metodo_pago: 'efectivo', items: [item(2, 2), item(6, 1)], estado: 'activa' },
  { id: 2, fecha: hoyA(12, 40), tipo: 'mesa', mesa: '5', metodo_pago: 'yape_plin', items: [item(1, 3)], estado: 'activa' },
  { id: 3, fecha: hoyA(13, 10), tipo: 'llevar', mesa: '', metodo_pago: 'efectivo', items: [item(3, 2)], estado: 'activa' },
  { id: 4, fecha: hoyA(13, 30), tipo: 'mesa', mesa: '1', metodo_pago: 'tarjeta', items: [item(5, 2), item(6, 1)], estado: 'activa' },
  { id: 5, fecha: hoyA(14, 0), tipo: 'mesa', mesa: '2', metodo_pago: 'efectivo', items: [item(4, 2), item(1, 2)], estado: 'activa' },
  { id: 6, fecha: hoyA(14, 20), tipo: 'llevar', mesa: '', metodo_pago: 'yape_plin', items: [item(2, 2), item(5, 1)], estado: 'activa' },
].map((v) => ({ ...v, total: totalItems(v.items) }))

function totalItems(items) {
  return +items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0).toFixed(2)
}

let perdidas = 24.5 // costo de mermas y uso propio de la semana (suma al registrar nuevas)

// ---------- Cálculos ----------

const insumoPorId = (id) => insumos.find((i) => i.id === id)

function nivel(i) {
  if (i.stock == null || i.stock > i.punto_reorden) return null
  return i.stock <= i.punto_reorden * 0.5 ? 'Crítico' : 'Bajo'
}

// "Alcanza para X días": stock dividido entre el uso diario promedio.
const diasRestantes = (i) => (i.uso_semanal && i.stock != null ? +(i.stock / (i.uso_semanal / 7)).toFixed(1) : null)

const vista = (i) => ({
  id: i.id,
  nombre: i.nombre,
  unidad: i.unidad,
  stock: i.stock,
  punto_reorden: i.punto_reorden ?? null,
  presentacion_compra: i.presentacion_compra,
  costo_unitario: i.costo_unitario,
  en_recetas: i.en_recetas !== false,
  vida_util_dias: i.vida_util_dias ?? null,
  nivel: i.en_recetas !== false ? nivel(i) : null,
  dias_restantes: diasRestantes(i),
})

function porAgotarse() {
  return insumos
    .filter((i) => i.en_recetas !== false && nivel(i))
    .map(vista)
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'Crítico' ? -1 : 1))
}

// Aviso simple: asume que el stock actual viene de la última compra.
function porVencer() {
  const hoy0 = new Date()
  hoy0.setHours(0, 0, 0, 0)
  return insumos
    .filter((i) => i.vida_util_dias && i.en_recetas !== false && i.stock > 0)
    .flatMap((i) => {
      const c = compras.filter((x) => x.insumo_id === i.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]
      if (!c) return []
      const comprado = new Date(c.fecha)
      comprado.setHours(0, 0, 0, 0)
      const dias = Math.round((comprado.getTime() + i.vida_util_dias * DIA - hoy0.getTime()) / DIA)
      if (dias > 2) return []
      const estado = dias < 0 ? 'Vencido' : dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : 'Vence en 2 días'
      return [{ insumo_id: i.id, nombre: i.nombre, unidad: i.unidad, stock: i.stock, dias_restantes: dias, estado }]
    })
    .sort((a, b) => a.dias_restantes - b.dias_restantes)
}

function detalleReceta(platoId) {
  return (recetas[platoId] ?? []).map((r) => {
    const i = insumoPorId(r.insumo_id)
    return {
      insumo_id: i.id,
      insumo: i.nombre,
      cantidad: r.cantidad,
      unidad: i.unidad,
      precio_unitario: i.costo_unitario,
      costo: +(r.cantidad * i.costo_unitario).toFixed(2),
    }
  })
}

const costoPlato = (platoId) => (recetas[platoId] ?? []).reduce((s, r) => s + r.cantidad * insumoPorId(r.insumo_id).costo_unitario, 0)

function ventasActivas() {
  return ventasLog.filter((v) => v.estado === 'activa')
}

function moverStock(items, signo) {
  items.forEach((it) => {
    ;(recetas[it.plato_id] ?? []).forEach((r) => {
      const i = insumoPorId(r.insumo_id)
      if (i.stock != null) i.stock = Math.max(0, i.stock + signo * r.cantidad * it.cantidad)
    })
  })
}

// ---------- Ganancias ----------

const vendidosSemana = { 1: 70, 2: 48, 3: 35, 4: 30, 5: 26, 6: 40 }
const pesoDia = [0.1, 0.11, 0.12, 0.13, 0.17, 0.2, 0.17]
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Gastos de ejemplo. Los fijos se pagan cada mes: en un periodo cuenta la parte que le toca (días/30).
// Los de "solo esta vez" cuentan completos en el periodo actual.
let sigGasto = 100
let gastos = [
  { id: 1, nombre: 'Luz', categoria: 'servicios', monto: 180, fijo: true },
  { id: 2, nombre: 'Agua', categoria: 'servicios', monto: 90, fijo: true },
  { id: 3, nombre: 'Internet', categoria: 'servicios', monto: 80, fijo: true },
  { id: 4, nombre: 'Gas', categoria: 'servicios', monto: 120, fijo: true },
  { id: 5, nombre: 'Cocinera', categoria: 'sueldos', monto: 1300, fijo: true },
  { id: 6, nombre: 'Mozo', categoria: 'sueldos', monto: 1100, fijo: true },
  { id: 7, nombre: 'Alquiler del local', categoria: 'alquiler', monto: 1200, fijo: true },
]
const GRUPO_GASTO = { alquiler: 'Alquiler', servicios: 'Servicios', sueldos: 'Sueldos', otros: 'Otros' }

// f = cuánto se vendió respecto a la semana de referencia. Es solo para que el demo tenga historia.
const PERIODOS = {
  semana: { f: 1, dias: 7, anterior: 0.92, actual: true, etiqueta: 'esta semana', previo: 'la semana pasada', barras: 'Por día' },
  semana_pasada: { f: 0.92, dias: 7, anterior: 0.85, actual: false, etiqueta: 'la semana pasada', previo: 'la semana anterior', barras: 'Por día' },
  semana_antepasada: { f: 0.85, dias: 7, anterior: 0.78, actual: false, etiqueta: 'la semana antepasada', previo: 'la semana anterior', barras: 'Por día' },
  mes: { f: 4.1, dias: 30, anterior: 3.8, actual: true, etiqueta: 'este mes', previo: 'el mes pasado', barras: 'Por semana' },
}

function costosPeriodo(costoInsumos, p, factor) {
  return [
    { id: 'insumos', grupo: 'Insumos', nombre: 'Insumos de lo vendido', monto: +costoInsumos.toFixed(2) },
    { id: 'mermas', grupo: 'Insumos', nombre: 'Mermas y uso propio', monto: +(perdidas * factor).toFixed(2) },
    ...gastos
      .filter((g) => g.fijo || p.actual)
      .map((g) => ({
        id: `g${g.id}`,
        grupo: GRUPO_GASTO[g.categoria],
        nombre: g.nombre,
        monto: g.fijo ? +((g.monto * p.dias) / 30).toFixed(2) : g.monto,
      })),
  ]
}

function calc(factor, p) {
  const filas = platos.map((pl) => {
    const receta = detalleReceta(pl.id)
    const costo = costoPlato(pl.id)
    const ganancia = pl.precio - costo
    const vendidos = Math.round((vendidosSemana[pl.id] ?? 0) * factor)
    return {
      id: pl.id,
      nombre: pl.nombre,
      precio: pl.precio,
      costo: +costo.toFixed(2),
      ganancia: +ganancia.toFixed(2),
      margen_pct: pl.precio > 0 ? +((ganancia / pl.precio) * 100).toFixed(1) : 0,
      vendidos,
      ventas_total: +(pl.precio * vendidos).toFixed(2),
      ganancia_total: +(ganancia * vendidos).toFixed(2),
      receta,
    }
  })
  const ventas = filas.reduce((s, f) => s + f.ventas_total, 0)
  const bruta = filas.reduce((s, f) => s + f.ganancia_total, 0)
  const costos = costosPeriodo(ventas - bruta, p, factor)
  return { filas, ventas, bruta, costos, neta: ventas - costos.reduce((s, c) => s + c.monto, 0) }
}

function calcularGanancias(periodo = 'semana') {
  const p = PERIODOS[periodo] ?? PERIODOS.semana
  const act = calc(p.f, p)
  const ant = calc(p.anterior, { ...p, actual: false })
  const pesos = p.dias === 30 ? [0.22, 0.25, 0.27, 0.26] : pesoDia
  const etiquetas = p.dias === 30 ? ['S1', 'S2', 'S3', 'S4'] : DIAS
  return {
    platos: act.filas.sort((a, b) => b.margen_pct - a.margen_pct),
    resumen: {
      etiqueta: p.etiqueta,
      previo: p.previo,
      dias: p.dias,
      barras_titulo: p.barras,
      ventas: +act.ventas.toFixed(2),
      costo: +(act.ventas - act.bruta).toFixed(2),
      ganancia: +act.bruta.toFixed(2),
      margen_pct: act.ventas > 0 ? +((act.bruta / act.ventas) * 100).toFixed(1) : 0,
      costos: act.costos,
      barras: etiquetas.map((etiqueta, i) => ({ etiqueta, ganancia: +(act.bruta * pesos[i]).toFixed(2) })),
      anterior: { ventas: +ant.ventas.toFixed(2), neta: +ant.neta.toFixed(2) },
    },
  }
}

// ---------- Agente: interpreta frases y PROPONE acciones (nada se guarda sin confirmar) ----------

const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const NUMS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 }
const ER_NUM = `\\d+|${Object.keys(NUMS).join('|')}`
const aNumero = (x) => (NUMS[x] ?? parseFloat(String(x).replace(',', '.')))
const UNID = { kg: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000], g: ['g', 1], gramos: ['g', 1], l: ['ml', 1000], litro: ['ml', 1000], litros: ['ml', 1000] }

const acciones = new Map()
const notas = []
let sigAccion = 1

function nueva(tipo, resumen, payload) {
  const id = `acc-${sigAccion++}`
  acciones.set(id, { tipo, payload })
  return { id, tipo, resumen }
}

// Busca "<cantidad> <unidad> de <insumo>" en la frase.
function cantidadInsumo(t) {
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|gramos?|g|litros?|l)\b/)
  const i = insumos.find((x) => x.en_recetas !== false && t.includes(norm(x.nombre).split(' ')[0]))
  if (!m || !i) return null
  const [base, factor] = UNID[m[2]]
  if (base !== i.unidad) return null
  const n = parseFloat(m[1].replace(',', '.'))
  return { insumo: i, base: n * factor, texto: `${m[1]} ${m[2]} de ${i.nombre.toLowerCase()}` }
}

function proponer(texto) {
  const t = norm(texto)

  // Venta: "vendí 3 lomos y 2 ceviches"
  if (/vend[io]|vendieron|vendimos/.test(t)) {
    const items = []
    platos.forEach((p) => {
      const clave = norm(p.nombre).split(' ')[0]
      const m = t.match(new RegExp(`(${ER_NUM})\\s+(?:de\\s+)?${clave}`))
      if (m) items.push({ plato_id: p.id, cantidad: aNumero(m[1]), nombre: p.nombre, precio: p.precio })
    })
    if (items.length) {
      const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0)
      const resumen = `${items.map((it) => `${it.cantidad} × ${it.nombre}`).join(', ')} · S/ ${total.toFixed(2)}`
      return { accion: nueva('venta', `Venta: ${resumen}`, { items: items.map(({ plato_id, cantidad }) => ({ plato_id, cantidad })) }) }
    }
  }

  // Compra: "compré 5 kg de pollo a 11 soles el kilo" / "por 55 soles"
  if (/compre|compramos/.test(t)) {
    const c = cantidadInsumo(t)
    if (c) {
      const pr = t.match(/\b(a|por)\s+(?:s\/\s*)?(\d+(?:[.,]\d+)?)/)
      if (!pr) return { pregunta: '¿Cuánto pagaste por eso? Dímelo así: "a 11 soles el kilo" o "por 55 soles".' }
      const precio = parseFloat(pr[2].replace(',', '.'))
      const total = pr[1] === 'a' ? precio * (c.base / vista_(c.insumo)) : precio
      return {
        accion: nueva('compra', `Compra: ${c.texto} · S/ ${total.toFixed(2)}`, {
          lineas: [{ insumo_id: c.insumo.id, cantidad: c.base, costo_total: +total.toFixed(2) }],
        }),
      }
    }
  }

  // Merma o uso propio: "se malogró 1 kilo de pescado" / "usamos 2 kg de pollo para el personal"
  const propio = /personal|propio|comimos|almuerzo del/.test(t)
  if (propio || /malog|bote|perdi|se cayo|vencio|desech|se echo/.test(t)) {
    const c = cantidadInsumo(t)
    if (c) {
      const tipo = propio ? 'consumo_propio' : 'merma'
      return {
        accion: nueva(tipo, `${propio ? 'Uso propio' : 'Merma'}: ${c.texto}`, {
          insumo_id: c.insumo.id, tipo, cantidad: c.base, motivo: texto,
        }),
      }
    }
  }

  // Nota del negocio: contexto que el motor no puede saber.
  if (/^nota\b/.test(t) || /cumpleanos|feriado|evento|fiesta|reserva|no entrega|no llega|no vendra/.test(t)) {
    const limpio = texto.replace(/^nota\s*[:\-]?\s*/i, '').trim()
    return { accion: nueva('nota', `Nota: ${limpio}`, { texto: limpio }) }
  }
  return null
}

// kg o L por unidad "grande" del insumo (para precios "a X el kilo").
const vista_ = (i) => (i.unidad === 'unid' ? 1 : 1000)

// ---------- API de ejemplo ----------

export const mock = {
  async login() {
    await pausa()
    return { nombre: 'Dueña (demo)' }
  },

  // Ventas
  async platos() {
    await pausa(100)
    return platos.filter((p) => p.activo).map(({ id, nombre, categoria, precio }) => ({ id, nombre, categoria, precio }))
  },
  async guardarVenta({ items, metodo_pago = 'efectivo', tipo = 'mesa', mesa = '' }) {
    await pausa()
    const venta = {
      id: sigVenta++,
      fecha: new Date().toISOString(),
      tipo,
      mesa,
      metodo_pago,
      items: items.map((it) => item(it.plato_id, it.cantidad)),
      estado: 'activa',
    }
    venta.total = totalItems(venta.items)
    ventasLog.push(venta)
    moverStock(venta.items, -1)
    return { ok: true, id: venta.id, total: venta.total }
  },
  async ventas() {
    await pausa(150)
    return [...ventasLog].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  },
  async anularVenta(id) {
    await pausa(200)
    const v = ventasLog.find((x) => x.id === id)
    if (v && v.estado === 'activa') {
      v.estado = 'anulada'
      moverStock(v.items, +1)
    }
    return { ok: true }
  },
  async resumen() {
    await pausa(150)
    const act = ventasActivas()
    return {
      platos: act.reduce((s, v) => s + v.items.reduce((a, it) => a + it.cantidad, 0), 0),
      total: +act.reduce((s, v) => s + v.total, 0).toFixed(2),
      por_agotarse: porAgotarse(),
      por_vencer: porVencer(),
    }
  },

  // Menú y recetas
  async platosAdmin() {
    await pausa(150)
    return platos.map((p) => {
      const costo = costoPlato(p.id)
      return {
        ...p,
        costo: +costo.toFixed(2),
        ganancia: +(p.precio - costo).toFixed(2),
        margen_pct: p.precio > 0 ? +(((p.precio - costo) / p.precio) * 100).toFixed(1) : 0,
        receta: (recetas[p.id] ?? []).map((r) => ({ ...r })),
      }
    })
  },
  async guardarPlato(d) {
    await pausa(200)
    let id = d.id
    if (id) {
      platos = platos.map((p) => (p.id === id ? { ...p, nombre: d.nombre, categoria: d.categoria, precio: d.precio, activo: d.activo } : p))
    } else {
      id = Math.max(...platos.map((p) => p.id)) + 1
      platos.push({ id, nombre: d.nombre, categoria: d.categoria, precio: d.precio, activo: d.activo })
    }
    if (d.receta) recetas[id] = d.receta.map(({ insumo_id, cantidad }) => ({ insumo_id, cantidad }))
    return { ok: true, id }
  },

  // Insumos y stock
  async insumos() {
    await pausa(100)
    return insumos.map(vista)
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
      vida_util_dias: d.vida_util_dias || undefined,
      uso_semanal: 0,
    }
    insumos.push(nuevo)
    return vista(nuevo)
  },
  async importarInsumos(lista) {
    await pausa(400)
    let creados = 0
    let omitidos = 0
    for (const d of lista) {
      if (insumos.some((i) => i.nombre.toLowerCase() === d.nombre.toLowerCase())) {
        omitidos++
        continue
      }
      await mock.crearInsumo(d)
      creados++
    }
    return { creados, omitidos }
  },
  // tipo: 'ajuste' (cantidad = stock real contado) | 'merma' | 'consumo_propio' (cantidad = lo que sale)
  async ajustarStock({ insumo_id, tipo, cantidad }) {
    await pausa(200)
    const i = insumoPorId(insumo_id)
    if (!i || i.stock == null) return { ok: false }
    if (tipo === 'ajuste') {
      i.stock = Math.max(0, cantidad)
    } else {
      const sale = Math.min(cantidad, i.stock)
      i.stock -= sale
      perdidas += sale * i.costo_unitario
    }
    return { ok: true, stock: i.stock }
  },
  async registrarCompra({ lineas }) {
    await pausa(300)
    lineas.forEach((l) => {
      const i = insumoPorId(l.insumo_id)
      if (!i) return
      if (i.stock != null) i.stock += l.cantidad
      i.costo_unitario = l.costo_total / l.cantidad // último precio pagado
      compras.push({ insumo_id: l.insumo_id, cantidad: l.cantidad, costo_total: l.costo_total, fecha: new Date().toISOString() })
    })
    return { ok: true }
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
        dias_restantes: i.dias_restantes,
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
  async registrarEvento() {
    return { ok: true }
  },

  async ganancias(periodo) {
    await pausa(200)
    return calcularGanancias(periodo)
  },

  // Gastos
  async gastos() {
    await pausa(100)
    return gastos.map((g) => ({ ...g }))
  },
  async crearGasto(d) {
    await pausa(150)
    gastos.push({ id: sigGasto++, nombre: d.nombre, categoria: d.categoria, monto: d.monto, fijo: d.fijo })
    return { ok: true }
  },
  async actualizarGasto(d) {
    await pausa(100)
    gastos = gastos.map((g) => (g.id === d.id ? { ...g, monto: d.monto } : g))
    return { ok: true }
  },
  async quitarGasto(id) {
    await pausa(100)
    gastos = gastos.filter((g) => g.id !== id)
    return { ok: true }
  },

  async confirmarAccion(id) {
    await pausa(300)
    const a = acciones.get(id)
    if (!a) return { ok: false, mensaje: 'Esa acción ya no está disponible.' }
    acciones.delete(id)
    const { tipo, payload } = a
    if (tipo === 'venta') {
      const r = await mock.guardarVenta({ items: payload.items })
      return { ok: true, mensaje: `Venta registrada ✓ Total S/ ${r.total.toFixed(2)}.` }
    }
    if (tipo === 'compra') {
      await mock.registrarCompra({ lineas: payload.lineas })
      return { ok: true, mensaje: 'Compra registrada ✓ El stock y el costo se actualizaron.' }
    }
    if (tipo === 'merma' || tipo === 'consumo_propio') {
      await mock.ajustarStock({ insumo_id: payload.insumo_id, tipo: payload.tipo, cantidad: payload.cantidad, motivo: payload.motivo })
      return { ok: true, mensaje: 'Anotado ✓ El stock bajó.' }
    }
    if (tipo === 'nota') {
      notas.push(payload.texto)
      return { ok: true, mensaje: 'Anotado ✓ Lo tendré en cuenta en las recomendaciones.' }
    }
    return { ok: false, mensaje: 'No sé cómo guardar eso.' }
  },
  async cancelarAccion(id) {
    acciones.delete(id)
    return { ok: true }
  },
  async chat(texto) {
    await pausa(700)
    const t = texto.toLowerCase()
    const prop = proponer(texto)
    if (prop?.pregunta) return { respuesta: prop.pregunta, funcion_usada: 'pedir_dato' }
    if (prop?.accion) return { respuesta: 'Entendí esto. ¿Lo guardo?', funcion_usada: `proponer_${prop.accion.tipo}`, accion: prop.accion }

    const enKg = (i) => (i.unidad === 'unid' ? `${i.stock} unid` : `${(i.stock / 1000).toLocaleString('es-PE')} ${i.unidad === 'g' ? 'kg' : 'L'}`)
    const insumo = insumos.filter((i) => i.en_recetas !== false).find((i) => t.includes(i.nombre.toLowerCase().split(' ')[0]))
    if (insumo && /(por qu[eé]|porque|explica)/.test(t) && /(compr|sugier|recomiend|lista)/.test(t)) {
      const diario = (insumo.uso_semanal ?? 0) / 7
      return {
        respuesta: `De ${insumo.nombre.toLowerCase()} quedan ${enKg(insumo)} y se usan unos ${(diario / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} ${insumo.unidad === 'g' ? 'kg' : 'L'} al día, así que alcanza ${diasRestantes(insumo)} días. Tu aviso está en ${(insumo.punto_reorden / 1000).toLocaleString('es-PE')} ${insumo.unidad === 'g' ? 'kg' : 'L'}, por eso te lo sugiero.`,
        funcion_usada: 'explicar_compra',
      }
    }
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
    if (/(sale m[aá]s|m[aá]s vend|vend)/.test(t) || /plato/.test(t)) {
      const top = platos.reduce((a, b) => ((vendidosSemana[b.id] ?? 0) > (vendidosSemana[a.id] ?? 0) ? b : a))
      return { respuesta: `${top.nombre} es el plato que más sale esta semana.`, funcion_usada: 'ventas_por_plato' }
    }
    if (/(margen|ganancia)/.test(t)) {
      const p = platos.find((x) => t.includes(x.nombre.toLowerCase().split(' ')[0])) ?? platos[1]
      const costo = costoPlato(p.id)
      return {
        respuesta: `${p.nombre} deja S/ ${(p.precio - costo).toFixed(2)} por plato, un margen de ${(((p.precio - costo) / p.precio) * 100).toFixed(1)} %.`,
        funcion_usada: 'margen_por_plato',
      }
    }
    return { respuesta: 'Solo puedo ayudarte con el inventario y las ventas del restaurante.', funcion_usada: 'fuera_de_tema' }
  },
}
