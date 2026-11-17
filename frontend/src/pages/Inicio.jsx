import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtCantidad, fmtDias, fmtSoles } from '../lib/api'
import { useAjustes } from '../lib/ajustes'
import { Tarjeta, Pill, BotonPrimario, BotonEnlace, Medidor, Icons } from '../components/ui'
import { PAGOS } from './VentasHoy'

const saludo = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}
const hora12 = (h) => `${h % 12 || 12} ${h < 12 ? 'a. m.' : 'p. m.'}`

// Ventas activas de hoy agrupadas por hora: de la primera venta hasta ahora (mínimo 6 horas, máximo 12).
function ventasPorHora(ventas) {
  if (!ventas.length) return []
  const porHora = {}
  ventas.forEach((v) => {
    const h = new Date(v.fecha).getHours()
    porHora[h] = (porHora[h] || 0) + v.total
  })
  const horas = Object.keys(porHora).map(Number)
  const desde = Math.min(...horas)
  const hasta = Math.min(Math.max(...horas, new Date().getHours(), desde + 5), desde + 11, 23)
  const lista = []
  for (let h = desde; h <= hasta; h++) lista.push({ h, total: porHora[h] || 0 })
  return lista
}

export default function Inicio() {
  const { ajustes } = useAjustes()
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState([])
  const [costoLista, setCostoLista] = useState(null)
  const [error, setError] = useState(false)

  const cargar = () => {
    setError(false)
    api.resumen().then(setData).catch(() => setError(true))
    // Detalle del día y costo de reponer: si fallan, Inicio se muestra igual sin ellos.
    api.ventasHoy().then((v) => setVentas(v.filter((x) => x.estado === 'activa'))).catch(() => setVentas([]))
    api.listaCompras().then((l) => setCostoLista(l.costo_total)).catch(() => setCostoLista(null))
  }
  useEffect(cargar, [])

  const alertas = data?.por_agotarse ?? []
  const porVencer = data?.por_vencer ?? []

  const horas = useMemo(() => ventasPorHora(ventas), [ventas])
  const maxHora = Math.max(...horas.map((x) => x.total), 1)
  const pico = horas.reduce((m, x) => (x.total > (m?.total ?? 0) ? x : m), null)
  const pagos = Object.keys(PAGOS).map((k) => ({
    k,
    total: ventas.filter((v) => v.metodo_pago === k).reduce((s, v) => s + v.total, 0),
  }))

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h1>{saludo()}</h1>
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

      {/* El día de hoy: cuánto va vendido, a qué hora y cómo se cobró */}
      <section className="card hero hoy">
        <Link to="/ventas" className="hoy-top">
          <div className="hoy-linea">
            <span>Vendido hoy</span>
            <span>ver ventas ›</span>
          </div>
          <div className="hero-num">{data ? fmtSoles(data.total) : '–'}</div>
          <p>
            {!data ? ' ' : data.platos === 0 ? 'Todavía no hay ventas hoy' : (
              `${data.platos} ${data.platos === 1 ? 'plato' : 'platos'}${ventas.length ? ` en ${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}` : ''}`
            )}
          </p>
        </Link>

        {horas.length > 1 && (
          <>
            <div className="horas" role="img" aria-label={`Ventas por hora. La hora con más ventas fue ${hora12(pico.h)}, con ${fmtSoles(pico.total)}.`}>
              {horas.map((x, n) => (
                <div className="hora" key={x.h}>
                  <i className={x.total ? '' : 'vacia'} style={{ height: x.total ? Math.max(6, Math.round((x.total / maxHora) * 56)) : 3, animationDelay: `${n * 40}ms` }} />
                  <span>{x.h % 12 || 12}</span>
                </div>
              ))}
            </div>
            <p className="small">Más movimiento a las {hora12(pico.h)}</p>
          </>
        )}

        {ventas.length > 0 && (
          <div className="hero-grid hoy-pagos">
            {pagos.map((p) => (
              <div key={p.k}>
                <span className="small">{PAGOS[p.k]}</span>
                <b>{fmtSoles(p.total)}</b>
              </div>
            ))}
          </div>
        )}

        <BotonEnlace to="/vender" className="big hoy-cta">Registrar venta</BotonEnlace>
      </section>

      {/* Qué falta y cuánto cuesta reponerlo */}
      <Tarjeta>
        <div className="sec-head">
          <h2>{ajustes.alertas ? 'Para comprar' : 'Compras'}</h2>
          {ajustes.alertas && alertas.length > 0 && (
            <span className="muted small">{alertas.length} {alertas.length === 1 ? 'insumo bajo' : 'insumos bajos'}</span>
          )}
        </div>
        {ajustes.alertas && data && alertas.length === 0 && <p className="muted">Todo en orden, no hay insumos bajos.</p>}
        {ajustes.alertas && alertas.map((i) => (
            <Link key={i.id} to="/insumos" state={{ abrir: i.id }} className="stock-row">
              <div className="stock-top">
                <span className="row-title">{i.nombre}</span>
                <Pill nivel={i.nivel} />
              </div>
              <Medidor stock={i.stock} punto={i.punto_reorden} nivel={i.nivel} />
              <div className="muted small">
                Quedan {fmtCantidad(i.stock, i.unidad)}
                {i.dias_restantes != null && <> · <strong>alcanza {fmtDias(i.dias_restantes)}</strong></>}
                {' '}· avisa en {fmtCantidad(i.punto_reorden, i.unidad)}
              </div>
            </Link>
        ))}
        {alertas.length > 0 && (
          <div className="reponer">
            {costoLista != null && (
              <p>Reponer todo cuesta aprox. <strong>{fmtSoles(costoLista)}</strong></p>
            )}
            <BotonEnlace to="/lista" variante="secondary">Ver lista de compras</BotonEnlace>
          </div>
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

      {/* Entrada al asistente con forma de caja de mensaje */}
      <Link to="/asistente" className="pregunta">
        <span>Dile al asistente «vendí 3 lomos»</span>
        <span className="send" aria-hidden="true">{Icons.enviar}</span>
      </Link>
    </div>
  )
}
