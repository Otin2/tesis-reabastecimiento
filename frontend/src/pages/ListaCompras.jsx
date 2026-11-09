import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtCantidad, fmtSoles } from '../lib/api'
import { compartir, descargar, generarPdf, nombreArchivo } from '../lib/lista'
import { Tarjeta, Pill, BotonPrimario } from '../components/ui'

const clave = (fecha) => `lista-compras-${fecha}`
const VACIO = { marcados: [], ajustes: {}, extras: [] }
const leer = (fecha) => {
  try { return { ...VACIO, ...JSON.parse(localStorage.getItem(clave(fecha)) || '{}') } } catch { return VACIO }
}

// Unidades que se pueden elegir para un producto extra, con su factor a unidad base.
const UNIDADES = { kg: ['g', 1000], L: ['ml', 1000], unid: ['unid', 1] }

export default function ListaCompras() {
  const [base, setBase] = useState(null)
  const [est, setEst] = useState(VACIO)
  const [error, setError] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [nuevo, setNuevo] = useState({ nombre: '', cantidad: '1', unidad: 'unid' })

  useEffect(() => {
    api.listaCompras()
      .then((l) => {
        setBase(l)
        setEst(leer(l.fecha))
        api.registrarEvento('generada', { n_insumos: l.lineas.length, costo_total: l.costo_total })
      })
      .catch(() => setError(true))
  }, [])

  function guardar(nuevoEst) {
    setEst(nuevoEst)
    try { localStorage.setItem(clave(base.fecha), JSON.stringify(nuevoEst)) } catch { /* sin almacenamiento */ }
  }

  const avisar = (t) => {
    setAviso(t)
    setTimeout(() => setAviso(''), 2200)
  }

  // Lista efectiva: sugerida + cantidades ajustadas + extras. Es la que se exporta.
  const filas = useMemo(() => {
    if (!base) return []
    const sugeridas = base.lineas.map((l) => {
      const cantidad = est.ajustes[l.insumo_id] ?? l.cantidad
      return { ...l, sugerida: l.cantidad, cantidad, paso: l.presentacion_compra, costo_estimado: +(cantidad * l.costo_unitario).toFixed(2) }
    })
    const extras = est.extras.map((e) => ({ ...e, extra: true, costo_estimado: null, paso: e.unidad === 'unid' ? 1 : 500 }))
    return [...sugeridas, ...extras]
  }, [base, est])

  const activas = filas.filter((f) => f.cantidad > 0)
  const hayExtras = est.extras.length > 0
  const costoTotal = +activas.reduce((s, f) => s + (f.costo_estimado ?? 0), 0).toFixed(2)
  const listaExport = { fecha: base?.fecha, lineas: activas, costo_total: costoTotal, hayExtras }
  const hechos = activas.filter((f) => est.marcados.includes(f.insumo_id)).length
  const modificada = Object.keys(est.ajustes).length > 0

  function marcar(id) {
    const ya = est.marcados.includes(id)
    guardar({ ...est, marcados: ya ? est.marcados.filter((m) => m !== id) : [...est.marcados, id] })
    if (!ya) api.registrarEvento('marcada', { insumo_id: id })
  }

  function cambiarCantidad(f, delta) {
    const cantidad = Math.max(0, +(f.cantidad + delta * f.paso).toFixed(3))
    if (f.extra) {
      guardar({ ...est, extras: est.extras.map((e) => (e.insumo_id === f.insumo_id ? { ...e, cantidad } : e)) })
    } else {
      guardar({ ...est, ajustes: { ...est.ajustes, [f.insumo_id]: cantidad } })
      api.registrarEvento('ajustada', { insumo_id: f.insumo_id, sugerida: f.sugerida, cantidad })
    }
  }

  function quitarExtra(id) {
    guardar({ ...est, extras: est.extras.filter((e) => e.insumo_id !== id), marcados: est.marcados.filter((m) => m !== id) })
  }

  function agregarExtra(e) {
    e.preventDefault()
    const nombre = nuevo.nombre.trim()
    const n = parseFloat(String(nuevo.cantidad).replace(',', '.'))
    if (!nombre || !(n > 0)) return
    const [unidad, factor] = UNIDADES[nuevo.unidad]
    guardar({ ...est, extras: [...est.extras, { insumo_id: `x-${Date.now()}`, nombre, unidad, cantidad: n * factor }] })
    api.registrarEvento('extra_agregada', { nombre })
    setNuevo({ nombre: '', cantidad: '1', unidad: nuevo.unidad })
  }

  async function pdf() {
    setOcupado(true)
    try {
      descargar(await generarPdf(listaExport), nombreArchivo(listaExport))
      api.registrarEvento('pdf')
    } catch {
      avisar('No se pudo crear el PDF')
    } finally {
      setOcupado(false)
    }
  }

  async function enviar() {
    setOcupado(true)
    try {
      if (await compartir(listaExport)) api.registrarEvento('compartida')
    } catch {
      avisar('No se pudo compartir')
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <div className="screen"><h1>Lista de compras</h1><p className="error">No se pudo cargar la lista. Intenta de nuevo.</p></div>
  if (!base) return <div className="screen"><h1>Lista de compras</h1><p className="muted">Preparando…</p></div>

  return (
    <>
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="screen" style={{ paddingBottom: 190 }}>
        <div className="header">
          <div>
            <h1>Lista de compras</h1>
            <p className="muted">{activas.length ? `${hechos} de ${activas.length} comprados` : 'Nada por comprar'}</p>
          </div>
          <Link to="/" className="link-btn">Volver</Link>
        </div>

        {modificada && (
          <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => guardar({ ...est, ajustes: {} })}>
            Volver a las cantidades sugeridas
          </button>
        )}

        {filas.map((f) => {
          const ok = est.marcados.includes(f.insumo_id)
          const cambio = !f.extra && f.cantidad !== f.sugerida
          return (
            <div key={f.insumo_id} className={`compra ${ok ? 'hecho' : ''} ${f.cantidad === 0 ? 'cero' : ''}`}>
              <label className="compra-main">
                <input type="checkbox" checked={ok} onChange={() => marcar(f.insumo_id)} />
                <span className="caja" aria-hidden />
                <span className="compra-txt">
                  <span className="row-title">{f.nombre}</span>
                  <span className="muted small">
                    {f.extra ? 'Producto extra' : `Quedan ${fmtCantidad(f.stock, f.unidad)}`}
                    {f.costo_estimado != null && ` · ${fmtSoles(f.costo_estimado)}`}
                  </span>
                </span>
                {f.nivel && <Pill nivel={f.nivel} />}
                {f.extra && (
                  <button type="button" className="quitar" aria-label={`Quitar ${f.nombre}`} onClick={(e) => { e.preventDefault(); quitarExtra(f.insumo_id) }}>✕</button>
                )}
              </label>
              <div className="compra-edit">
                <span className="muted small">
                  {f.cantidad === 0 ? 'No comprar' : cambio ? `Sugerido: ${fmtCantidad(f.sugerida, f.unidad)}` : 'Cantidad'}
                </span>
                <div className="stepper compacto">
                  <button aria-label={`Menos ${f.nombre}`} onClick={() => cambiarCantidad(f, -1)} disabled={f.cantidad === 0}>−</button>
                  <span>{fmtCantidad(f.cantidad, f.unidad)}</span>
                  <button className="plus" aria-label={`Más ${f.nombre}`} onClick={() => cambiarCantidad(f, 1)}>+</button>
                </div>
              </div>
            </div>
          )
        })}

        <Tarjeta>
          <h2 style={{ marginBottom: 10 }}>Agregar otro producto</h2>
          <form className="extra-form" onSubmit={agregarExtra}>
            <input className="input" placeholder="Ej. Servilletas" aria-label="Nombre del producto" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <div className="extra-fila">
              <input className="input" inputMode="decimal" aria-label="Cantidad" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
              <select className="input" aria-label="Unidad" value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}>
                <option value="unid">unid</option>
                <option value="kg">kg</option>
                <option value="L">L</option>
              </select>
              <BotonPrimario type="submit" variante="secondary" className="small" disabled={!nuevo.nombre.trim()}>Agregar</BotonPrimario>
            </div>
          </form>
        </Tarjeta>

        {activas.length > 0 && (
          <Tarjeta style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Costo estimado{hayExtras ? ' (sin extras)' : ''}</span>
            <strong>{fmtSoles(costoTotal)}</strong>
          </Tarjeta>
        )}
      </div>

      {activas.length > 0 && (
        <div className="savebar">
          <BotonPrimario variante="ghost" disabled={ocupado} onClick={pdf} style={{ flex: 1 }}>Descargar PDF</BotonPrimario>
          <BotonPrimario disabled={ocupado} onClick={enviar} style={{ flex: 1 }}>Compartir</BotonPrimario>
        </div>
      )}
    </>
  )
}
