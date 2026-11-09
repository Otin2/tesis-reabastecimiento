import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtSoles } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'

export const PAGOS = { efectivo: 'Efectivo', yape_plin: 'Yape / Plin', tarjeta: 'Tarjeta' }

const hora = (iso) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
const resumenItems = (items) => items.map((it) => `${it.cantidad} ${it.nombre}`).join(', ')

// Ventas del día: ver, corregir (anular) y resumen por método de pago (cierre de caja).
export default function VentasHoy() {
  const [ventas, setVentas] = useState(null)
  const [error, setError] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(() => api.ventasHoy().then(setVentas).catch(() => setError(true)), [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2400)
    return () => clearTimeout(t)
  }, [aviso])

  async function anular(id) {
    try {
      await api.anularVenta(id)
      setConfirmar(null)
      await cargar()
      setAviso('Venta anulada. Los insumos volvieron al stock ✓')
    } catch {
      setAviso('No se pudo anular')
    }
  }

  if (error) return <div className="screen"><h1>Ventas de hoy</h1><p className="error">No se pudieron cargar las ventas.</p></div>
  if (!ventas) return <div className="screen"><h1>Ventas de hoy</h1><p className="muted">Cargando…</p></div>

  const activas = ventas.filter((v) => v.estado === 'activa')
  const total = activas.reduce((s, v) => s + v.total, 0)
  const porPago = Object.keys(PAGOS).map((k) => ({
    k,
    monto: activas.filter((v) => v.metodo_pago === k).reduce((s, v) => s + v.total, 0),
  }))

  return (
    <div className="screen">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="header">
        <div>
          <h1>Ventas de hoy</h1>
          <p className="muted">{activas.length} ventas · {fmtSoles(total)}</p>
        </div>
        <Link to="/mas" className="link-btn">Volver</Link>
      </div>

      <Tarjeta>
        <h2 style={{ marginBottom: 8 }}>Cierre de caja</h2>
        {porPago.map((p) => (
          <div className="ajuste-fila" key={p.k} style={{ padding: '6px 0' }}>
            <span className="muted">{PAGOS[p.k]}</span>
            <b>{fmtSoles(p.monto)}</b>
          </div>
        ))}
      </Tarjeta>

      {ventas.length === 0 && <p className="empty">Todavía no hay ventas hoy.</p>}

      {ventas.map((v) => (
        <Tarjeta key={v.id} className={`venta ${v.estado === 'anulada' ? 'anulada' : ''}`}>
          <div className="pg-head">
            <div>
              <div className="row-title">{hora(v.fecha)} · {v.tipo === 'llevar' ? 'Para llevar' : v.mesa ? `Mesa ${v.mesa}` : 'Mesa'}</div>
              <div className="muted small">{resumenItems(v.items)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b>{fmtSoles(v.total)}</b>
              <div className="muted small">{PAGOS[v.metodo_pago]}</div>
            </div>
          </div>

          {v.estado === 'anulada' ? (
            <span className="pill critico" style={{ alignSelf: 'flex-start' }}>Anulada</span>
          ) : confirmar === v.id ? (
            <div className="actions">
              <BotonPrimario variante="ghost" className="small" onClick={() => setConfirmar(null)}>Cancelar</BotonPrimario>
              <BotonPrimario className="small" style={{ background: 'var(--danger)' }} onClick={() => anular(v.id)}>Sí, anular</BotonPrimario>
            </div>
          ) : (
            <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmar(v.id)}>Anular venta</button>
          )}
        </Tarjeta>
      ))}
    </div>
  )
}
