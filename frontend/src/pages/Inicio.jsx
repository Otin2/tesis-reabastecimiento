import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtCantidad, fmtDias, fmtSoles } from '../lib/api'
import { useAjustes } from '../lib/ajustes'
import { Tarjeta, Pill, BotonPrimario, BotonEnlace, Icons } from '../components/ui'

export default function Inicio() {
  const { ajustes } = useAjustes()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  const cargar = () => {
    setError(false)
    api.resumen().then(setData).catch(() => setError(true))
  }
  useEffect(cargar, [])

  const alertas = data?.por_agotarse ?? []
  const porVencer = data?.por_vencer ?? []

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Hola 👋</h1>
          <p className="muted">{ajustes.restaurante ? `${ajustes.restaurante} · ` : ''}{new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Link to="/ajustes" className="icon-btn" aria-label="Ajustes">{Icons.ajustes}</Link>
      </div>

      {error && (
        <>
          <p className="error">No se pudo cargar el resumen.</p>
          <BotonPrimario variante="ghost" className="small" style={{ alignSelf: 'flex-start' }} onClick={cargar}>Reintentar</BotonPrimario>
        </>
      )}

      <div className="stats">
        <Link to="/ventas" className="card stat-link">
          <span className="muted small">Platos vendidos hoy</span>
          <div className="stat-num">{data ? data.platos : '–'}</div>
          <span className="muted small">{data ? `${fmtSoles(data.total)} · ver ventas ›` : ' '}</span>
        </Link>
        <Link to="/lista" className="card stat-link">
          <span className="muted small">Insumos por agotarse</span>
          <div className="stat-num danger">{data ? alertas.length : '–'}</div>
          <span className="muted small">ver la lista ›</span>
        </Link>
      </div>

      <BotonEnlace to="/vender" className="big">Registrar venta</BotonEnlace>

      <Tarjeta>
        <h2 style={{ marginBottom: 6 }}>{ajustes.alertas ? 'Alertas de stock' : 'Compras'}</h2>
        {ajustes.alertas && data && alertas.length === 0 && <p className="muted">Todo en orden, no hay insumos bajos.</p>}
        {ajustes.alertas && alertas.map((i) => (
          <div className="alert-row" key={i.id}>
            <div>
              <div className="row-title">{i.nombre}</div>
              <div className="muted small">
                Quedan {fmtCantidad(i.stock, i.unidad)}
                {i.dias_restantes != null && ` · alcanza ${fmtDias(i.dias_restantes)}`}
              </div>
            </div>
            <Pill nivel={i.nivel} />
          </div>
        ))}
        {alertas.length > 0 && (
          <BotonEnlace to="/lista" variante="secondary" style={{ marginTop: 8 }}>Generar lista de compras</BotonEnlace>
        )}
      </Tarjeta>

      {porVencer.length > 0 && (
        <Tarjeta>
          <h2 style={{ marginBottom: 6 }}>Por vencer</h2>
          {porVencer.map((i) => (
            <Link key={i.insumo_id} to="/insumos" state={{ abrir: i.insumo_id }} className="alert-row alert-link">
              <div>
                <div className="row-title">{i.nombre}</div>
                <div className="muted small">Quedan {fmtCantidad(i.stock, i.unidad)} · toca para revisar</div>
              </div>
              <Pill nivel={i.dias_restantes <= 0 ? 'Crítico' : 'Bajo'} texto={i.estado} />
            </Link>
          ))}
        </Tarjeta>
      )}

      <Link to="/asistente" style={{ textDecoration: 'none' }}>
        <Tarjeta style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--primary-ink)', background: 'var(--primary-light)', borderColor: 'transparent' }}>
          <span style={{ fontWeight: 600 }}>Pregúntale al asistente</span>
          <span aria-hidden>→</span>
        </Tarjeta>
      </Link>
    </div>
  )
}
