import { useEffect, useRef, useState } from 'react'
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
const PERIODOS = [
  ['semana', 'Esta semana'],
  ['semana_pasada', 'Semana pasada'],
  ['semana_antepasada', 'Antepasada'],
  ['mes', 'Este mes'],
]
const ORDENES = [
  ['margen', 'Más margen'],
  ['mas', 'Más vendidos'],
  ['menos', 'Menos vendidos'],
]

// Casilla de un grupo: marca o desmarca todos sus renglones a la vez.
// Queda "a medias" cuando solo algunos están marcados.
function FilaGrupo({ grupo, items, apagados, onCambiar }) {
  const ref = useRef(null)
  const activos = items.filter((c) => !apagados.includes(c.id))
  const todos = activos.length === items.length
  const ninguno = activos.length === 0

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !todos && !ninguno
  }, [todos, ninguno])

  return (
    <label className="costo-fila grupo">
      <input ref={ref} type="checkbox" checked={todos} onChange={() => onCambiar(items.map((c) => c.id), todos)} />
      <span className="caja" aria-hidden />
      <i className="dot" style={{ background: COLOR[grupo] }} aria-hidden />
      <span className="costo-nombre">{grupo}</span>
      <b className={ninguno ? 'muted' : ''}>−{fmtSoles(activos.reduce((s, c) => s + c.monto, 0))}</b>
    </label>
  )
}

export default function Ganancias() {
  const [periodo, setPeriodo] = useState('semana')
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(null)
  const [apagados, setApagados] = useState([]) // costos que NO se restan
  const [orden, setOrden] = useState('margen')
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    api.ganancias(periodo)
      .then((d) => { if (vigente) { setData(d); setError(false); setAbierto(null) } })
      .catch(() => { if (vigente) setError(true) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [periodo])

  const chips = (
    <div className="filters" role="radiogroup" aria-label="Periodo">
      {PERIODOS.map(([k, t]) => (
        <button key={k} role="radio" aria-checked={periodo === k} className={`pill chip ${periodo === k ? 'active' : ''}`} onClick={() => setPeriodo(k)}>{t}</button>
      ))}
    </div>
  )

  if (error && !data) return <div className="screen"><h1>Ganancias</h1><p className="error">No se pudo cargar el reporte. Intenta de nuevo.</p></div>
  if (!data) return <div className="screen"><h1>Ganancias</h1><p className="muted">Calculando…</p></div>

  const { resumen, platos } = data
  const costos = resumen.costos ?? []
  const max = Math.max(...resumen.barras.map((d) => d.ganancia))

  const activos = costos.filter((c) => !apagados.includes(c.id))
  const restado = activos.reduce((s, c) => s + c.monto, 0)
  const queda = resumen.ventas - restado
  const pct = resumen.ventas > 0 ? (queda / resumen.ventas) * 100 : 0
  const titulo = activos.length === costos.length ? 'Ganancia neta' : activos.length === 0 ? 'Ventas' : 'Te queda'

  const previas = resumen.anterior?.ventas
  const delta = previas > 0 ? ((resumen.ventas - previas) / previas) * 100 : null

  const porGrupo = GRUPOS.map((g) => ({ grupo: g, items: costos.filter((c) => c.grupo === g) })).filter((g) => g.items.length)
  const segmentos = porGrupo
    .map(({ grupo, items }) => ({ grupo, monto: items.filter((c) => !apagados.includes(c.id)).reduce((s, c) => s + c.monto, 0) }))
    .filter((g) => g.monto > 0)

  const alternar = (id) => setApagados((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  // Apaga (si estaban todos prendidos) o prende todos los ids de un grupo.
  const cambiarGrupo = (ids, estabanTodosPrendidos) =>
    setApagados((a) => (estabanTodosPrendidos ? [...new Set([...a, ...ids])] : a.filter((x) => !ids.includes(x))))

  const platosOrdenados = [...platos].sort((a, b) =>
    orden === 'mas' ? b.vendidos - a.vendidos : orden === 'menos' ? a.vendidos - b.vendidos : b.margen_pct - a.margen_pct,
  )

  return (
    <div className="screen" style={{ opacity: cargando ? 0.6 : 1, transition: 'opacity .15s' }}>
      <h1>Ganancias</h1>
      {chips}

      <Tarjeta className="neto">
        <span className="muted small">{titulo} de {resumen.etiqueta}</span>
        <div className={`neto-num ${queda < 0 ? 'neg' : ''}`}>{queda < 0 ? '−' : ''}{fmtSoles(Math.abs(queda))}</div>
        <span className="muted small">{pct.toFixed(1)} % de {fmtSoles(resumen.ventas)} vendidos</span>
        {delta != null && (
          <span className={`delta ${delta >= 0 ? 'sube' : 'baja'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)} % en ventas frente a {resumen.previo}
          </span>
        )}

        <div className="barra" role="img" aria-label={`De ${fmtSoles(resumen.ventas)} vendidos, restas ${fmtSoles(restado)} y te quedan ${fmtSoles(queda)}`}>
          {segmentos.map((s) => (
            <i key={s.grupo} style={{ width: `${Math.min(100, (s.monto / resumen.ventas) * 100)}%`, background: COLOR[s.grupo] }} />
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
          <b>{fmtSoles(resumen.ventas)}</b>
        </div>
        {porGrupo.map(({ grupo, items }) => (
          <div key={grupo} className="costo-grupo">
            <FilaGrupo grupo={grupo} items={items} apagados={apagados} onCambiar={cambiarGrupo} />
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
        {resumen.dias !== 30 && (
          <p className="muted small" style={{ marginTop: 12 }}>
            Alquiler, servicios y sueldos son mensuales: cada semana cuenta la parte que le corresponde ({resumen.dias}/30).
          </p>
        )}
      </Tarjeta>

      <Tarjeta>
        <h2>{resumen.barras_titulo}</h2>
        <div className="bars" role="img" aria-label="Ganancia bruta por tramo del periodo">
          {resumen.barras.map((d) => (
            <div className="bar" key={d.etiqueta} title={fmtSoles(d.ganancia)}>
              <i style={{ height: `${(d.ganancia / max) * 100}%` }} />
              <span>{d.etiqueta}</span>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>Ganancia bruta: ventas menos insumos.</p>
      </Tarjeta>

      <div className="header" style={{ alignItems: 'center' }}>
        <h2>Por plato</h2>
      </div>
      <div className="segmentos" role="radiogroup" aria-label="Ordenar platos">
        {ORDENES.map(([k, t]) => (
          <button key={k} role="radio" aria-checked={orden === k} className={orden === k ? 'on' : ''} onClick={() => setOrden(k)}>{t}</button>
        ))}
      </div>

      {platosOrdenados.map((p) => (
        <button
          key={p.id}
          className={`plato-ganancia ${abierto === p.id ? 'open' : ''}`}
          aria-expanded={abierto === p.id}
          onClick={() => setAbierto(abierto === p.id ? null : p.id)}
        >
          <div className="pg-head">
            <div>
              <div className="row-title">{p.nombre}</div>
              <div className="muted small">{p.vendidos} vendidos · {fmtSoles(p.ganancia_total)} de ganancia</div>
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
                <div key={r.insumo_id ?? r.insumo}>
                  <span>{r.insumo} · {fmtCantidad(r.cantidad, r.unidad)}</span>
                  <b>{fmtSoles(r.costo)}</b>
                </div>
              ))}
              {p.receta.length === 0 && <span className="muted small">Este plato no tiene receta todavía.</span>}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
