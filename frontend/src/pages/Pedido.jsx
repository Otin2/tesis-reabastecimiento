import { useEffect, useState } from 'react'
import { api, fmtCantidad, fmtSoles } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'

export default function Pedido() {
  const [pedido, setPedido] = useState(null)
  const [aceptadas, setAceptadas] = useState({}) // insumo_id -> cantidad final
  const [editando, setEditando] = useState(null)
  const [valorEdit, setValorEdit] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    api.pedido().then(setPedido).catch(() => setError('No se pudo cargar el pedido.'))
  }, [])

  if (error) return <div className="screen"><h1>Pedido sugerido</h1><p className="error">{error}</p></div>
  if (!pedido) return <div className="screen"><h1>Pedido sugerido</h1><p className="muted">Calculando…</p></div>

  const { lineas, resumen } = pedido

  async function aceptar(ids) {
    const nuevas = {}
    lineas.filter((l) => ids.includes(l.insumo_id)).forEach((l) => {
      nuevas[l.insumo_id] = aceptadas[l.insumo_id] ?? l.cantidad
    })
    try {
      await api.aceptarPedido(
        lineas.filter((l) => nuevas[l.insumo_id] != null).map((l) => ({
          insumo_id: l.insumo_id,
          cantidad_sugerida: l.cantidad,
          cantidad_final: nuevas[l.insumo_id],
        })),
      )
      setAceptadas((a) => ({ ...a, ...nuevas }))
      setAviso('Pedido guardado ✓')
      setTimeout(() => setAviso(''), 2000)
    } catch {
      setAviso('No se pudo guardar')
    }
  }

  function empezarEdicion(l) {
    setEditando(l.insumo_id)
    const base = aceptadas[l.insumo_id] ?? l.cantidad
    setValorEdit(String(l.unidad === 'unid' ? base : base / 1000))
  }

  function confirmarEdicion(l) {
    const n = parseFloat(valorEdit.replace(',', '.'))
    if (!(n > 0)) return
    const base = l.unidad === 'unid' ? n : n * 1000
    setAceptadas((a) => ({ ...a, [l.insumo_id]: base }))
    setEditando(null)
  }

  const kgTotal = lineas.filter((l) => l.unidad !== 'unid').reduce((s, l) => s + l.cantidad, 0) / 1000
  const todoAceptado = lineas.length > 0 && lineas.every((l) => aceptadas[l.insumo_id] != null)

  return (
    <div className="screen">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <h1>Pedido sugerido</h1>

      <Tarjeta className="summary">
        <div><strong>{resumen.n_insumos}</strong><span className="muted small">insumos</span></div>
        <div><strong>{+kgTotal.toFixed(1)}</strong><span className="muted small">kg / L</span></div>
        <div><strong>{fmtSoles(resumen.costo_total)}</strong><span className="muted small">estimado</span></div>
      </Tarjeta>

      {lineas.length === 0 && <p className="empty">No hace falta comprar nada por ahora 🎉</p>}

      {lineas.map((l) => {
        const final = aceptadas[l.insumo_id]
        return (
          <Tarjeta key={l.insumo_id} className={`linea ${final != null ? 'aceptada' : ''}`}>
            <div className="linea-head">
              <div className="row-title">{l.nombre}</div>
              <div className="buy">Comprar {fmtCantidad(final ?? l.cantidad, l.unidad)}</div>
            </div>
            <div className="linea-meta small">
              <div><span className="muted">Stock</span><b>{fmtCantidad(l.stock, l.unidad)}</b></div>
              <div><span className="muted">Reorden</span><b>{fmtCantidad(l.punto_reorden, l.unidad)}</b></div>
              <div><span className="muted">Uso semanal</span><b>{fmtCantidad(l.uso_semanal, l.unidad)}</b></div>
            </div>
            {editando === l.insumo_id ? (
              <div className="edit-row">
                <input className="input" inputMode="decimal" aria-label={`Cantidad de ${l.nombre}`} value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} />
                <span className="muted">{l.unidad === 'unid' ? 'unid' : l.unidad === 'g' ? 'kg' : 'L'}</span>
                <BotonPrimario className="small" onClick={() => confirmarEdicion(l)}>OK</BotonPrimario>
              </div>
            ) : (
              <div className="actions">
                <BotonPrimario variante="ghost" className="small" onClick={() => empezarEdicion(l)}>Editar</BotonPrimario>
                <BotonPrimario className="small" onClick={() => aceptar([l.insumo_id])}>
                  {final != null ? 'Aceptado ✓' : 'Aceptar'}
                </BotonPrimario>
              </div>
            )}
          </Tarjeta>
        )
      })}

      {lineas.length > 0 && (
        <BotonPrimario className="big" disabled={todoAceptado} onClick={() => aceptar(lineas.map((l) => l.insumo_id))}>
          Aceptar todo el pedido
        </BotonPrimario>
      )}
    </div>
  )
}
