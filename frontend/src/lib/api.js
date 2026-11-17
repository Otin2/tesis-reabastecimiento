import { DEMO, supabase } from './supabase'
import { mock } from './mock'

// Error con una causa que se le puede mostrar a la persona ("No hay stock de este insumo...").
export const conMotivo = (texto) => Object.assign(new Error(texto), { motivo: texto })
// Texto para mostrar: la causa que dio el backend o, si no la hay (sin conexión, error 500), el genérico.
export const motivoDe = (err, generico) => err?.motivo ?? generico

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
  if (!res.ok) {
    // El backend responde { detail: "..." } (FastAPI) o { message: "..." } con el motivo en español.
    const cuerpo = await res.json().catch(() => null)
    const motivo = cuerpo?.detail ?? cuerpo?.message
    // Solo un 400 trae una causa pensada para la persona; un 401 o un 500 se quedan con el texto genérico.
    if (res.status === 400 && typeof motivo === 'string' && motivo) throw conMotivo(motivo)
    throw new Error(`Error ${res.status}`)
  }
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
  // Solo en demo: el backend todavía no tiene cómo deshacer una compra.
  deshacerCompra: (id) => (DEMO ? mock.deshacerCompra(id) : Promise.reject(new Error('No disponible'))),
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
  // opciones (solo ventas): { metodo_pago, tipo }. Si fue una venta, la respuesta trae venta_id para poder deshacerla.
  confirmarAccion: (id, opciones = {}) => (DEMO ? mock.confirmarAccion(id, opciones) : post(`/chat/acciones/${id}/confirmar`, opciones)),
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

// "S/ 1,829.75" (separador de miles con coma, decimales con punto). No depende del idioma del navegador.
export function fmtSoles(n) {
  const v = Number(n)
  const [entero, dec] = Math.abs(v).toFixed(2).split('.')
  const signo = v < 0 && Number(`${entero}.${dec}`) !== 0 ? '-' : ''
  return `${signo}S/ ${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`
}

export function fmtDias(d) {
  if (d == null) return ''
  if (d < 1) return 'menos de 1 día'
  const n = +d.toFixed(1)
  return `${n} ${n === 1 ? 'día' : 'días'}`
}

export const num = (v) => parseFloat(String(v).replace(',', '.'))
