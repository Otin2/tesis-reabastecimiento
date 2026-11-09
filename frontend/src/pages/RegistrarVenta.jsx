import { useEffect, useMemo, useState } from 'react'
import { api, fmtSoles } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'
import { PAGOS } from './VentasHoy'

const CATEGORIAS = ['Todos', 'Menú', 'Carta', 'Bebidas']

export default function RegistrarVenta() {
  const [platos, setPlatos] = useState([])
  const [cant, setCant] = useState({})
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('Todos')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [ultima, setUltima] = useState(null) // última venta guardada, para poder deshacerla
  const [pago, setPago] = useState('efectivo')
  const [tipo, setTipo] = useState('mesa')
  const [mesa, setMesa] = useState('')

  useEffect(() => {
    api.platos().then(setPlatos).catch(() => setAviso('No se pudieron cargar los platos'))
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => { setAviso(''); setUltima(null) }, ultima ? 8000 : 2400)
    return () => clearTimeout(t)
  }, [aviso, ultima])

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
      const r = await api.guardarVenta({ items, metodo_pago: pago, tipo, mesa: tipo === 'mesa' ? mesa.trim() : '' })
      setUltima({ id: r.id, cant })
      setCant({})
      setPago('efectivo')
      setTipo('mesa')
      setMesa('')
      setAviso('Venta guardada ✓')
    } catch {
      setUltima(null)
      setAviso('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function deshacer() {
    const u = ultima
    setUltima(null)
    try {
      await api.anularVenta(u.id, 'Deshecha al momento')
      setCant(u.cant)
      setAviso('Venta deshecha: corrígela y vuelve a guardar')
    } catch {
      setAviso('No se pudo deshacer')
    }
  }

  return (
    <>
      {aviso && (
        <div className="toast" role="status">
          {aviso}
          {ultima && <button className="toast-btn" onClick={deshacer}>Deshacer</button>}
        </div>
      )}
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
        <Tarjeta className="cobro">
          <h2>Cobro</h2>
          <div className="segmentos" role="radiogroup" aria-label="Método de pago">
            {Object.entries(PAGOS).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={pago === k} className={pago === k ? 'on' : ''} onClick={() => setPago(k)}>{t}</button>
            ))}
          </div>
          <div className="segmentos dos" role="radiogroup" aria-label="Tipo de venta">
            <button type="button" role="radio" aria-checked={tipo === 'mesa'} className={tipo === 'mesa' ? 'on' : ''} onClick={() => setTipo('mesa')}>En mesa</button>
            <button type="button" role="radio" aria-checked={tipo === 'llevar'} className={tipo === 'llevar' ? 'on' : ''} onClick={() => setTipo('llevar')}>Para llevar</button>
          </div>
          {tipo === 'mesa' && (
            <input className="input" inputMode="numeric" placeholder="N.º de mesa (opcional)" aria-label="Número de mesa" value={mesa} onChange={(e) => setMesa(e.target.value)} />
          )}
        </Tarjeta>
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
