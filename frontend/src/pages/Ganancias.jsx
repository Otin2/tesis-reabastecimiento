import { useEffect, useState } from 'react'
import { api, fmtCantidad, fmtSoles } from '../lib/api'
import { Tarjeta } from '../components/ui'

const clase = (m) => (m >= 65 ? 'ok' : m >= 50 ? 'bajo' : 'critico')
const GRUPOS = ['Insumos', 'Servicios', 'Sueldos', 'Alquiler', 'Otros']
const COLOR = {
  Insumos: 'var(--warning)',
  Servicios: '#5B8DEF',
  Sueldos: '#A07CE8',
  Alquiler: 'var(--danger)',
  Otros: 'var(--muted)',
}

export default function Ganancias() {
  const [data, setData] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [apagados, setApagados] = useState([]) // costos que NO se restan
  const [error, setError] = useState(false)

  useEffect(() => {
    api.ganancias().then(setData).catch(() => setError(true))
  }, [])

  if (error) return <div className="screen"><h1>Ganancias</h1><p className="error">No se pudo cargar el reporte. Intenta de nuevo.</p></div>
  if (!data) return <div className="screen"><h1>Ganancias</h1><p className="muted">Calculando…</p></div>

  const { semana, platos } = data
  const costos = semana.costos ?? []
  const max = Math.max(...semana.dias.map((d) => d.ganancia))

  const activos = costos.filter((c) => !apagados.includes(c.id))
  const restado = activos.reduce((s, c) => s + c.monto, 0)
  const queda = semana.ventas - restado
  const pct = semana.ventas > 0 ? (queda / semana.ventas) * 100 : 0
  const titulo = activos.length === costos.length ? 'Ganancia neta' : activos.length === 0 ? 'Ventas' : 'Te queda'

  const porGrupo = GRUPOS.map((g) => ({ grupo: g, items: costos.filter((c) => c.grupo === g) })).filter((g) => g.items.length)
  const segmentos = porGrupo
    .map(({ grupo, items }) => ({ grupo, monto: items.filter((c) => !apagados.includes(c.id)).reduce((s, c) => s + c.monto, 0) }))
    .filter((g) => g.monto > 0)

  const alternar = (id) => setApagados((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))

  return (
    <div className="screen">
      <h1>Ganancias</h1>

      <Tarjeta className="neto">
        <span className="muted small">{titulo} de la semana</span>
        <div className={`neto-num ${queda < 0 ? 'neg' : ''}`}>{queda < 0 ? '−' : ''}{fmtSoles(Math.abs(queda))}</div>
        <span className="muted small">{pct.toFixed(1)} % de {fmtSoles(semana.ventas)} vendidos</span>

        <div className="barra" role="img" aria-label={`De ${fmtSoles(semana.ventas)} vendidos, restas ${fmtSoles(restado)} y te quedan ${fmtSoles(queda)}`}>
          {segmentos.map((s) => (
            <i key={s.grupo} style={{ width: `${Math.min(100, (s.monto / semana.ventas) * 100)}%`, background: COLOR[s.grupo] }} />
          ))}
          <i className="resto" style={{ flex: 1, background: 'var(--primary)', opacity: queda > 0 ? 1 : 0 }} />
        </div>
      </Tarjeta>

      <div className="header" style={{ alignItems: 'center' }}>
        <h2>¿Qué restas?</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="link-btn" onClick={() => setApagados([])}>Todo</button>
          <button className="link-btn" onClick={() => setApagados(costos.map((c) => c.id))}>Nada</button>
        </div>
      </div>

      <Tarjeta className="costos">
        <div className="costo-fila total">
          <span>Ventas</span>
          <b>{fmtSoles(semana.ventas)}</b>
        </div>
        {porGrupo.map(({ grupo, items }) => (
          <div key={grupo} className="costo-grupo">
            <div className="costo-titulo small muted">{grupo}</div>
            {items.map((c) => {
              const on = !apagados.includes(c.id)
              return (
                <label key={c.id} className={`costo-fila ${on ? '' : 'off'}`}>
                  <input type="checkbox" checked={on} onChange={() => alternar(c.id)} />
                  <span className="caja" aria-hidden />
                  <i className="dot" style={{ background: COLOR[grupo] }} aria-hidden />
                  <span className="costo-nombre">{c.nombre}</span>
                  <b>−{fmtSoles(c.monto)}</b>
                </label>
              )
            })}
          </div>
        ))}
        <p className="muted small" style={{ marginTop: 12 }}>
          Alquiler, servicios y sueldos son mensuales: cada semana cuenta la parte que le corresponde (7/30).
        </p>
      </Tarjeta>

      <Tarjeta>
        <h2>Por día</h2>
        <div className="bars" role="img" aria-label="Ganancia bruta por día de la semana">
          {semana.dias.map((d) => (
            <div className="bar" key={d.dia} title={fmtSoles(d.ganancia)}>
              <i style={{ height: `${(d.ganancia / max) * 100}%` }} />
              <span>{d.dia}</span>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Ganancia bruta: ventas menos insumos.</p>
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
