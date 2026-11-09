import { useEffect, useMemo, useState } from 'react'
import { api, fmtSoles } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'

const CATEGORIAS = ['Todos', 'Menú', 'Carta', 'Bebidas']

export default function RegistrarVenta() {
  const [platos, setPlatos] = useState([])
  const [cant, setCant] = useState({})
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('Todos')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    api.platos().then(setPlatos).catch(() => setAviso('No se pudieron cargar los platos'))
  }, [])

  const visibles = useMemo(
    () =>
      platos.filter(
        (p) =>
          (cat === 'Todos' || p.categoria === cat) &&
          p.nombre.toLowerCase().includes(busca.toLowerCase()),
      ),
    [platos, cat, busca],
  )

  const cambiar = (id, d) =>
    setCant((c) => {
      const n = Math.max(0, (c[id] || 0) + d)
      const { [id]: _, ...resto } = c
      return n ? { ...resto, [id]: n } : resto
    })

  const unidades = Object.values(cant).reduce((s, n) => s + n, 0)
  const total = platos.reduce((s, p) => s + (cant[p.id] || 0) * p.precio, 0)

  async function guardar() {
    setGuardando(true)
    try {
      const items = Object.entries(cant).map(([id, cantidad]) => ({ plato_id: Number(id), cantidad }))
      await api.guardarVenta({ items })
      setCant({})
      setAviso('Venta guardada ✓')
    } catch {
      setAviso('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setGuardando(false)
      setTimeout(() => setAviso(''), 2200)
    }
  }

  return (
    <>
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="screen" style={{ paddingBottom: 180 }}>
        <h1>Registrar venta</h1>
        <input className="input" type="search" placeholder="Buscar plato…" aria-label="Buscar plato" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="filters">
          {CATEGORIAS.map((c) => (
            <button key={c} className={`pill chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <div className="grid">
          {visibles.map((p) => (
            <Tarjeta key={p.id} className={`plato ${cant[p.id] ? 'sel' : ''}`}>
              <div>
                <div className="plato-name">{p.nombre}</div>
                <div className="plato-price">{fmtSoles(p.precio)}</div>
              </div>
              <div className="stepper">
                <button aria-label={`Quitar ${p.nombre}`} onClick={() => cambiar(p.id, -1)}>−</button>
                <span>{cant[p.id] || 0}</span>
                <button className="plus" aria-label={`Agregar ${p.nombre}`} onClick={() => cambiar(p.id, 1)}>+</button>
              </div>
            </Tarjeta>
          ))}
        </div>
        {visibles.length === 0 && platos.length > 0 && <p className="empty">No hay platos con ese nombre.</p>}
      </div>

      <div className="savebar">
        <div className="total">
          <span className="muted small">{unidades} {unidades === 1 ? 'plato' : 'platos'}</span>
          <strong>{fmtSoles(total)}</strong>
        </div>
        <BotonPrimario disabled={!unidades || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar venta'}
        </BotonPrimario>
      </div>
    </>
  )
}
