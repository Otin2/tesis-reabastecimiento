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

export const api = {
  platos: () => (DEMO ? mock.platos() : request('/platos')),
  guardarVenta: (venta) => (DEMO ? mock.guardarVenta(venta) : request('/ventas', { method: 'POST', body: venta })),
  resumen: () => (DEMO ? mock.resumen() : request('/resumen')),
  listaCompras: () => (DEMO ? mock.listaCompras() : request('/lista-compras')),
  // tipo: 'generada' | 'pdf' | 'compartida' | 'marcada'. Sirve como evidencia del piloto.
  registrarEvento: (tipo, detalle = {}) =>
    (DEMO ? mock.registrarEvento() : request('/lista-compras/eventos', { method: 'POST', body: { tipo, ...detalle } })).catch(() => {}),
  ganancias: () => (DEMO ? mock.ganancias() : request('/ganancias')),
  chat: (texto) => (DEMO ? mock.chat(texto) : request('/chat', { method: 'POST', body: { texto } })),
}

// Todo se guarda en unidad base; aquí solo se muestra en kg / L.
export function fmtCantidad(valor, unidad) {
  if (unidad === 'g') return valor >= 1000 ? `${+(valor / 1000).toFixed(2)} kg` : `${valor} g`
  if (unidad === 'ml') return valor >= 1000 ? `${+(valor / 1000).toFixed(2)} L` : `${valor} ml`
  return `${valor} unid`
}

export const fmtSoles = (n) => `S/ ${Number(n).toFixed(2)}`
