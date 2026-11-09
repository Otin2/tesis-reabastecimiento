import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtCantidad, fmtSoles } from '../lib/api'
import { compartir, descargar, generarPdf, nombreArchivo } from '../lib/lista'
import { Tarjeta, Pill, BotonPrimario } from '../components/ui'

const clave = (fecha) => `lista-compras-${fecha}`
const leer = (fecha) => {
  try { return JSON.parse(localStorage.getItem(clave(fecha)) || '[]') } catch { return [] }
}

export default function ListaCompras() {
  const [lista, setLista] = useState(null)
  const [marcados, setMarcados] = useState([])
  const [error, setError] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    api.listaCompras()
      .then((l) => {
        setLista(l)
        setMarcados(leer(l.fecha))
        api.registrarEvento('generada', { n_insumos: l.lineas.length, costo_total: l.costo_total })
      })
      .catch(() => setError(true))
  }, [])

  const avisar = (t) => {
    setAviso(t)
    setTimeout(() => setAviso(''), 2200)
  }

  function marcar(id) {
    const nuevos = marcados.includes(id) ? marcados.filter((m) => m !== id) : [...marcados, id]
    setMarcados(nuevos)
    try { localStorage.setItem(clave(lista.fecha), JSON.stringify(nuevos)) } catch { /* sin almacenamiento */ }
    if (!marcados.includes(id)) api.registrarEvento('marcada', { insumo_id: id })
  }

  async function pdf() {
    setOcupado(true)
    try {
      descargar(await generarPdf(lista), nombreArchivo(lista))
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
      if (await compartir(lista)) api.registrarEvento('compartida')
    } catch {
      avisar('No se pudo compartir')
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <div className="screen"><h1>Lista de compras</h1><p className="error">No se pudo cargar la lista. Intenta de nuevo.</p></div>
  if (!lista) return <div className="screen"><h1>Lista de compras</h1><p className="muted">Preparando…</p></div>

  const hechos = lista.lineas.filter((l) => marcados.includes(l.insumo_id)).length

  return (
    <>
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="screen" style={{ paddingBottom: 190 }}>
        <div className="header">
          <div>
            <h1>Lista de compras</h1>
            <p className="muted">{lista.lineas.length ? `${hechos} de ${lista.lineas.length} comprados` : 'Nada por comprar'}</p>
          </div>
          <Link to="/" className="link-btn">Volver</Link>
        </div>

        {lista.lineas.length === 0 && <p className="empty">Por ahora no hace falta comprar nada 🎉</p>}

        {lista.lineas.map((l) => {
          const ok = marcados.includes(l.insumo_id)
          return (
            <label key={l.insumo_id} className={`compra ${ok ? 'hecho' : ''}`}>
              <input type="checkbox" checked={ok} onChange={() => marcar(l.insumo_id)} />
              <span className="caja" aria-hidden />
              <span className="compra-txt">
                <span className="row-title">{l.nombre}</span>
                <span className="muted small">Quedan {fmtCantidad(l.stock, l.unidad)} · {fmtSoles(l.costo_estimado)}</span>
              </span>
              <span className="compra-cant">
                {fmtCantidad(l.cantidad, l.unidad)}
                <Pill nivel={l.nivel} />
              </span>
            </label>
          )
        })}

        {lista.lineas.length > 0 && (
          <Tarjeta style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Costo estimado</span>
            <strong>{fmtSoles(lista.costo_total)}</strong>
          </Tarjeta>
        )}
      </div>

      {lista.lineas.length > 0 && (
        <div className="savebar">
          <BotonPrimario variante="ghost" disabled={ocupado} onClick={pdf} style={{ flex: 1 }}>Descargar PDF</BotonPrimario>
          <BotonPrimario disabled={ocupado} onClick={enviar} style={{ flex: 1 }}>Compartir</BotonPrimario>
        </div>
      )}
    </>
  )
}
