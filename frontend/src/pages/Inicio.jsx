import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtCantidad, fmtSoles } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Tarjeta, Pill, BotonPrimario } from '../components/ui'

export default function Inicio() {
  const { logout } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.resumen().then(setData).catch(() => setError(true))
  }, [])

  const alertas = data?.por_agotarse ?? []

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>Hola 👋</h1>
          <p className="muted">{new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button className="link-btn" onClick={logout}>Salir</button>
      </div>

      {error && <p className="error">No se pudo cargar el resumen. Intenta de nuevo.</p>}

      <div className="stats">
        <Tarjeta>
          <span className="muted small">Platos vendidos hoy</span>
          <div className="stat-num">{data ? data.platos : '–'}</div>
          <span className="muted small">{data ? fmtSoles(data.total) : ' '}</span>
        </Tarjeta>
        <Tarjeta>
          <span className="muted small">Insumos por agotarse</span>
          <div className="stat-num danger">{data ? alertas.length : '–'}</div>
          <span className="muted small">revisar stock</span>
        </Tarjeta>
      </div>

      <Link to="/vender" style={{ textDecoration: 'none' }}>
        <BotonPrimario className="big" tabIndex={-1}>Registrar venta</BotonPrimario>
      </Link>

      <Tarjeta>
        <h2 style={{ marginBottom: 6 }}>Alertas de stock</h2>
        {data && alertas.length === 0 && <p className="muted">Todo en orden, no hay insumos bajos.</p>}
        {alertas.map((i) => (
          <div className="alert-row" key={i.id}>
            <div>
              <div className="row-title">{i.nombre}</div>
              <div className="muted small">Quedan {fmtCantidad(i.stock, i.unidad)}</div>
            </div>
            <Pill nivel={i.nivel} />
          </div>
        ))}
        {alertas.length > 0 && (
          <Link to="/lista" style={{ textDecoration: 'none' }}>
            <BotonPrimario variante="secondary" style={{ marginTop: 8 }} tabIndex={-1}>Generar lista de compras</BotonPrimario>
          </Link>
        )}
      </Tarjeta>

      <Link to="/asistente" style={{ textDecoration: 'none' }}>
        <Tarjeta style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--primary)', background: 'var(--primary-light)', borderColor: 'transparent' }}>
          <span style={{ fontWeight: 600 }}>Pregúntale al asistente</span>
          <span aria-hidden>→</span>
        </Tarjeta>
      </Link>
    </div>
  )
}
