import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, fmtCantidad, fmtDias, fmtSoles } from '../lib/api'
import { compartir, descargar, generarPdf, nombreArchivo } from '../lib/lista'
import { Tarjeta, Pill, BotonPrimario } from '../components/ui'
import FormInsumo from '../components/FormInsumo'

export const claveLista = (fecha) => `lista-compras-${fecha}`
const VACIO = { marcados: [], ajustes: {}, extras: [] }
const leer = (fecha) => {
  try { return { ...VACIO, ...JSON.parse(localStorage.getItem(claveLista(fecha)) || '{}') } } catch { return VACIO }
}

export default function ListaCompras() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [base, setBase] = useState(null)
  const [est, setEst] = useState(VACIO)
  const [error, setError] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(state?.aviso ?? '')
  const [catalogo, setCatalogo] = useState([])
  const [buscar, setBuscar] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    api.insumos().then(setCatalogo).catch(() => {})
    api.listaCompras()
      .then((l) => {
        setBase(l)
        setEst(leer(l.fecha))
        api.registrarEvento('generada', { n_insumos: l.lineas.length, costo_total: l.costo_total })
      })
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2600)
    return () => clearTimeout(t)
  }, [aviso])

  function guardar(nuevoEst) {
    setEst(nuevoEst)
    try { localStorage.setItem(claveLista(base.fecha), JSON.stringify(nuevoEst)) } catch { /* sin almacenamiento */ }
  }

  // Lista efectiva: sugerida + cantidades ajustadas + extras. Es la que se exporta.
  const filas = useMemo(() => {
    if (!base) return []
    const sugeridas = base.lineas.map((l) => {
      const cantidad = est.ajustes[l.insumo_id] ?? l.cantidad
      return { ...l, sugerida: l.cantidad, cantidad, paso: l.presentacion_compra, costo_estimado: +(cantidad * l.costo_unitario).toFixed(2) }
    })
    const extras = est.extras.map((e) => ({
      ...e,
      extra: true,
      paso: e.presentacion_compra ?? (e.unidad === 'unid' ? 1 : 500),
      costo_estimado: e.costo_unitario != null ? +(e.cantidad * e.costo_unitario).toFixed(2) : null,
    }))
    return [...sugeridas, ...extras]
  }, [base, est])

  const activas = filas.filter((f) => f.cantidad > 0)
  const hayExtras = activas.some((f) => f.costo_estimado == null) // extras viejos sin precio
  const costoTotal = +activas.reduce((s, f) => s + (f.costo_estimado ?? 0), 0).toFixed(2)
  const listaExport = { fecha: base?.fecha, lineas: activas, costo_total: costoTotal, hayExtras }
  const marcadas = activas.filter((f) => est.marcados.includes(f.insumo_id))
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

  const enLista = (id) => filas.some((f) => (f.extra ? f.origen_id : f.insumo_id) === id)

  function agregarDeCatalogo(i) {
    guardar({
      ...est,
      extras: [...est.extras, {
        insumo_id: `x-${i.id}`, origen_id: i.id, nombre: i.nombre, unidad: i.unidad,
        cantidad: i.presentacion_compra, presentacion_compra: i.presentacion_compra, costo_unitario: i.costo_unitario,
        general: !i.en_recetas,
      }],
    })
    api.registrarEvento('extra_agregada', { insumo_id: i.id })
    setBuscar('')
  }

  function insumoCreado(creado) {
    setCatalogo((c) => [...c, creado])
    agregarDeCatalogo(creado)
    api.registrarEvento('insumo_creado', { insumo_id: creado.id, en_recetas: creado.en_recetas })
    setCreando(false)
    setAviso('Insumo creado y agregado ✓')
  }

  // Pasa a registrar lo que realmente se compró (cantidad y precio pagado).
  const irAComprar = () => navigate('/lista/comprar', { state: { fecha: base.fecha, lineas: marcadas } })

  async function pdf() {
    setOcupado(true)
    try {
      descargar(await generarPdf(listaExport), nombreArchivo(listaExport))
      api.registrarEvento('pdf')
    } catch {
      setAviso('No se pudo crear el PDF')
    } finally {
      setOcupado(false)
    }
  }

  async function enviar() {
    setOcupado(true)
    try {
      if (await compartir(listaExport)) api.registrarEvento('compartida')
    } catch {
      setAviso('No se pudo compartir')
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <div className="screen"><h1>Lista de compras</h1><p className="error">No se pudo cargar la lista. Intenta de nuevo.</p></div>
  if (!base) return <div className="screen"><h1>Lista de compras</h1><p className="muted">Preparando…</p></div>

  const q = buscar.trim().toLowerCase()
  const coincidencias = q ? catalogo.filter((i) => i.nombre.toLowerCase().includes(q)).slice(0, 6) : []

  return (
    <>
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="screen" style={{ paddingBottom: 190 }}>
        <div className="header">
          <div>
            <h1>Lista de compras</h1>
            <p className="muted">{activas.length ? `${marcadas.length} de ${activas.length} comprados` : 'Nada por comprar'}</p>
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
                    {f.extra ? (f.general ? 'Uso general' : 'Producto extra') : `Quedan ${fmtCantidad(f.stock, f.unidad)}`}
                    {f.dias_restantes != null && ` · alcanza ${fmtDias(f.dias_restantes)}`}
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
          {!creando ? (
            <div className="extra-form">
              <input className="input" type="search" placeholder="Busca entre tus insumos…" aria-label="Buscar insumo" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              {q && (
                <div className="opciones">
                  {coincidencias.map((i) => (
                    <button key={i.id} type="button" className="opcion" disabled={enLista(i.id)} onClick={() => agregarDeCatalogo(i)}>
                      <span>{i.nombre}</span>
                      <span className="muted small">{enLista(i.id) ? 'Ya está en la lista' : `Se compra de a ${fmtCantidad(i.presentacion_compra, i.unidad)}`}</span>
                    </button>
                  ))}
                  <button type="button" className="opcion crear" onClick={() => setCreando(true)}>
                    <span>+ Crear «{buscar.trim()}» como insumo nuevo</span>
                  </button>
                </div>
              )}
              {!q && <span className="muted small">Si no está, escribe el nombre y podrás crearlo.</span>}
            </div>
          ) : (
            <FormInsumo nombreInicial={buscar.trim()} onCreado={insumoCreado} onCancelar={() => setCreando(false)} />
          )}
        </Tarjeta>

        {activas.length > 0 && (
          <Tarjeta style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Costo estimado{hayExtras ? ' (sin extras)' : ''}</span>
            <strong>{fmtSoles(costoTotal)}</strong>
          </Tarjeta>
        )}

        {marcadas.length > 0 && (
          <BotonPrimario className="big" onClick={irAComprar}>
            Ya compré ({marcadas.length}) · registrar compra
          </BotonPrimario>
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
