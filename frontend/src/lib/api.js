import { DEMO, supabase } from './supabase'
import { mock } from './mock'

async function request(path, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

const post = (path, body) => request(path, { method: 'POST', body })

export const api = {
  // Inicio y ventas
  resumen: () => (DEMO ? mock.resumen() : request('/resumen')),
  platos: () => (DEMO ? mock.platos() : request('/platos')),
  guardarVenta: (venta) => (DEMO ? mock.guardarVenta(venta) : post('/ventas', venta)),
  ventasHoy: () => (DEMO ? mock.ventas() : request('/ventas/hoy')),
  anularVenta: (id, motivo) => (DEMO ? mock.anularVenta(id) : post(`/ventas/${id}/anular`, { motivo })),

  // Menú y recetas
  platosAdmin: () => (DEMO ? mock.platosAdmin() : request('/menu')),
  guardarPlato: (p) => (DEMO ? mock.guardarPlato(p) : request(p.id ? `/menu/${p.id}` : '/menu', { method: p.id ? 'PUT' : 'POST', body: p })),

  // Insumos, stock y compras
  insumos: () => (DEMO ? mock.insumos() : request('/insumos')),
  crearInsumo: (d) => (DEMO ? mock.crearInsumo(d) : post('/insumos', d)),
  importarInsumos: (lista) => (DEMO ? mock.importarInsumos(lista) : post('/insumos/importar', { insumos: lista })),
  // tipo: 'ajuste' (cantidad = stock contado) | 'merma' | 'consumo_propio' (cantidad = lo que sale)
  ajustarStock: (a) => (DEMO ? mock.ajustarStock(a) : post(`/insumos/${a.insumo_id}/ajuste`, a)),
  registrarCompra: (c) => (DEMO ? mock.registrarCompra(c) : post('/compras', c)),
  listaCompras: () => (DEMO ? mock.listaCompras() : request('/lista-compras')),
  // tipo: 'generada' | 'pdf' | 'compartida' | 'marcada' | 'ajustada' | 'extra_agregada' | 'insumo_creado' | 'comprada'.
  registrarEvento: (tipo, detalle = {}) =>
    (DEMO ? mock.registrarEvento() : post('/lista-compras/eventos', { tipo, ...detalle })).catch(() => {}),

  // periodo: 'semana' | 'semana_pasada' | 'semana_antepasada' | 'mes'
  ganancias: (periodo = 'semana') => (DEMO ? mock.ganancias(periodo) : request(`/ganancias?periodo=${periodo}`)),

  // Gastos (servicios, sueldos, alquiler...). fijo = se paga cada mes.
  gastos: () => (DEMO ? mock.gastos() : request('/gastos')),
  crearGasto: (g) => (DEMO ? mock.crearGasto(g) : post('/gastos', g)),
  actualizarGasto: (g) => (DEMO ? mock.actualizarGasto(g) : request(`/gastos/${g.id}`, { method: 'PUT', body: g })),
  quitarGasto: (id) => (DEMO ? mock.quitarGasto(id) : request(`/gastos/${id}`, { method: 'DELETE' })),
  // El agente propone una acción (accion = { id, tipo, resumen }); solo se ejecuta al confirmarla.
  chat: (texto) => (DEMO ? mock.chat(texto) : post('/chat', { texto })),
  confirmarAccion: (id) => (DEMO ? mock.confirmarAccion(id) : post(`/chat/acciones/${id}/confirmar`, {})),
  cancelarAccion: (id) => (DEMO ? mock.cancelarAccion(id) : post(`/chat/acciones/${id}/cancelar`, {})),
}

// Todo se guarda en unidad base; aquí solo se muestra en kg / L.
export function fmtCantidad(valor, unidad) {
  if (unidad === 'g') return valor >= 1000 ? `${+(valor / 1000).toFixed(2)} kg` : `${valor} g`
  if (unidad === 'ml') return valor >= 1000 ? `${+(valor / 1000).toFixed(2)} L` : `${valor} ml`
  return `${valor} unid`
}

// Unidad en la que se escribe y se lee una cantidad grande (kg, L, unid) y su factor a unidad base.
export const vistaUnidad = (u) =>
  u === 'g' ? { sufijo: 'kg', factor: 1000 } : u === 'ml' ? { sufijo: 'L', factor: 1000 } : { sufijo: 'unid', factor: 1 }

export const fmtSoles = (n) => `S/ ${Number(n).toFixed(2)}`

export function fmtDias(d) {
  if (d == null) return ''
  if (d < 1) return 'menos de 1 día'
  const n = +d.toFixed(1)
  return `${n} ${n === 1 ? 'día' : 'días'}`
}

export const num = (v) => parseFloat(String(v).replace(',', '.'))
