import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, fmtSoles, num, vistaUnidad } from '../lib/api'
import { claveLista } from './ListaCompras'
import { Tarjeta, BotonPrimario } from '../components/ui'

// "Ya compré": confirma cuánto se compró de verdad y cuánto se pagó.
// Sube el stock y actualiza el costo con el último precio pagado.
export default function RegistrarCompra() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [filas, setFilas] = useState(() =>
    (state?.lineas ?? []).map((f) => {
      const v = vistaUnidad(f.unidad)
      return {
        id: f.insumo_id,
        insumo_id: f.extra ? f.origen_id : f.insumo_id,
        nombre: f.nombre,
        unidad: f.unidad,
        extra: Boolean(f.extra),
        cant: String(+(f.cantidad / v.factor).toFixed(3)),
        pagado: f.costo_estimado != null ? f.costo_estimado.toFixed(2) : '',
      }
    }),
  )
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  if (!state?.lineas?.length) return <Navigate to="/lista" replace />

  const set = (id, k) => (e) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [k]: e.target.value } : f)))
  const validas = filas.every((f) => num(f.cant) > 0 && num(f.pagado) > 0)
  const total = filas.reduce((s, f) => s + (num(f.pagado) || 0), 0)

  async function guardar() {
    setOcupado(true)
    setError('')
    try {
      await api.registrarCompra({
        lineas: filas.map((f) => ({
          insumo_id: f.insumo_id,
          cantidad: num(f.cant) * vistaUnidad(f.unidad).factor,
          costo_total: num(f.pagado),
        })),
      })
      api.registrarEvento('comprada', { n_insumos: filas.length, total })

      // Lo comprado sale de la lista de hoy.
      const ids = filas.map((f) => f.id)
      try {
        const g = JSON.parse(localStorage.getItem(claveLista(state.fecha)) || '{}')
        g.marcados = (g.marcados ?? []).filter((m) => !ids.includes(m))
        g.extras = (g.extras ?? []).filter((e) => !ids.includes(e.insumo_id))
        g.ajustes = Object.fromEntries(Object.entries(g.ajustes ?? {}).filter(([k]) => !ids.includes(Number(k))))
        localStorage.setItem(claveLista(state.fecha), JSON.stringify(g))
      } catch { /* sin almacenamiento */ }

      navigate('/lista', { replace: true, state: { aviso: 'Compra registrada ✓ Stock actualizado' } })
    } catch {
      setError('No se pudo guardar la compra. Intenta de nuevo.')
      setOcupado(false)
    }
  }

  return (
    <>
      <div className="screen" style={{ paddingBottom: 190 }}>
        <div className="header">
          <div>
            <h1>Registrar compra</h1>
            <p className="muted">Pon lo que compraste de verdad y lo que pagaste.</p>
          </div>
          <button className="link-btn" onClick={() => navigate('/lista')}>Volver</button>
        </div>

        {filas.map((f) => {
          const v = vistaUnidad(f.unidad)
          const unitario = num(f.pagado) > 0 && num(f.cant) > 0 ? num(f.pagado) / num(f.cant) : null
          return (
            <Tarjeta key={f.id} className="compra-form">
              <div className="row-title">{f.nombre}</div>
              <div className="campo-par">
                <div className="field">
                  <label htmlFor={`c-${f.id}`}>Compré ({v.sufijo})</label>
                  <input id={`c-${f.id}`} className="input" inputMode="decimal" value={f.cant} onChange={set(f.id, 'cant')} />
                </div>
                <div className="field">
                  <label htmlFor={`p-${f.id}`}>Pagué (S/)</label>
                  <input id={`p-${f.id}`} className="input" inputMode="decimal" value={f.pagado} onChange={set(f.id, 'pagado')} />
                </div>
              </div>
              {unitario != null && <span className="muted small">{fmtSoles(unitario)} por {v.sufijo}</span>}
            </Tarjeta>
          )
        })}
      </div>

      <div className="savebar">
        <div className="total">
          <span className="muted small">Total pagado</span>
          <strong>{fmtSoles(total)}</strong>
        </div>
        <BotonPrimario disabled={!validas || ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar compra'}</BotonPrimario>
      </div>
      {error && <div className="toast" role="alert">{error}</div>}
    </>
  )
}
