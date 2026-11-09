import { useEffect, useState } from 'react'
import { api, fmtCantidad, fmtSoles } from '../lib/api'
import { Tarjeta } from '../components/ui'

const clase = (m) => (m >= 65 ? 'ok' : m >= 50 ? 'bajo' : 'critico')

export default function Ganancias() {
  const [data, setData] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.ganancias().then(setData).catch(() => setError(true))
  }, [])

  if (error) return <div className="screen"><h1>Ganancias</h1><p className="error">No se pudo cargar el reporte. Intenta de nuevo.</p></div>
  if (!data) return <div className="screen"><h1>Ganancias</h1><p className="muted">Calculando…</p></div>

  const { semana, platos } = data
  const max = Math.max(...semana.dias.map((d) => d.ganancia))

  return (
    <div className="screen">
      <h1>Ganancias</h1>

      <Tarjeta className="hero">
        <span className="muted small">Ganancia de la semana</span>
        <div className="hero-num">{fmtSoles(semana.ganancia)}</div>
        <div className="hero-grid small">
          <div><span className="muted">Ventas</span><b>{fmtSoles(semana.ventas)}</b></div>
          <div><span className="muted">Costo insumos</span><b>{fmtSoles(semana.costo)}</b></div>
          <div><span className="muted">Margen</span><b>{semana.margen_pct} %</b></div>
        </div>
      </Tarjeta>

      <Tarjeta>
        <h2>Por día</h2>
        <div className="bars" role="img" aria-label="Ganancia por día de la semana">
          {semana.dias.map((d) => (
            <div className="bar" key={d.dia} title={fmtSoles(d.ganancia)}>
              <i style={{ height: `${(d.ganancia / max) * 100}%` }} />
              <span>{d.dia}</span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <h2>Por plato</h2>
      {platos.map((p) => (
        <button
          key={p.id}
          className={`plato-ganancia ${abierto === p.id ? 'open' : ''}`}
          aria-expanded={abierto === p.id}
          onClick={() => setAbierto(abierto === p.id ? null : p.id)}
        >
          <div className="pg-head">
            <div>
              <div className="row-title">{p.nombre}</div>
              <div className="muted small">{p.vendidos} vendidos · {fmtSoles(p.ganancia_total)} esta semana</div>
            </div>
            <span className={`pill ${clase(p.margen_pct)}`}>{p.margen_pct} %</span>
          </div>
          <div className="pg-nums small">
            <div><span className="muted">Precio</span><b>{fmtSoles(p.precio)}</b></div>
            <div><span className="muted">Costo</span><b>{fmtSoles(p.costo)}</b></div>
            <div><span className="muted">Ganas</span><b>{fmtSoles(p.ganancia)}</b></div>
          </div>
          {abierto === p.id && (
            <div className="receta">
              <span className="muted small">Costo de cada insumo</span>
              {p.receta.map((r) => (
                <div key={r.insumo}>
                  <span>{r.insumo} · {fmtCantidad(r.cantidad, r.unidad)}</span>
                  <b>{fmtSoles(r.costo)}</b>
                </div>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
