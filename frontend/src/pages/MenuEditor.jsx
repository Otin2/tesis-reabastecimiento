import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtSoles, num } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'

const CATEGORIAS = ['Menú', 'Carta', 'Bebidas']

// Crear o editar un plato con su receta (cuánto lleva de cada insumo).
export default function MenuEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const nuevo = id === 'nuevo'

  const [catalogo, setCatalogo] = useState(null)
  const [cargado, setCargado] = useState(nuevo)
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('Carta')
  const [precio, setPrecio] = useState('')
  const [activo, setActivo] = useState(true)
  const [receta, setReceta] = useState([]) // [{ insumo_id, cantidad: '120' }]
  const [elegido, setElegido] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.insumos().then((l) => setCatalogo(l.filter((i) => i.en_recetas))).catch(() => setError('No se pudieron cargar los insumos.'))
    if (!nuevo) {
      api.platosAdmin()
        .then((ps) => {
          const p = ps.find((x) => String(x.id) === id)
          if (!p) return setError('No se encontró el plato.')
          setNombre(p.nombre)
          setCategoria(p.categoria)
          setPrecio(String(p.precio))
          setActivo(p.activo)
          setReceta(p.receta.map((r) => ({ insumo_id: r.insumo_id, cantidad: String(r.cantidad) })))
          setCargado(true)
        })
        .catch(() => setError('No se pudo cargar el plato.'))
    }
  }, [id, nuevo])

  const porId = useMemo(() => Object.fromEntries((catalogo ?? []).map((i) => [i.id, i])), [catalogo])
  const disponibles = (catalogo ?? []).filter((i) => !receta.some((r) => r.insumo_id === i.id))

  // Vista previa mientras se edita; al guardar, el costo oficial lo calcula el sistema.
  const costo = receta.reduce((s, r) => s + (num(r.cantidad) || 0) * (porId[r.insumo_id]?.costo_unitario ?? 0), 0)
  const p = num(precio) || 0
  const ganancia = p - costo
  const margen = p > 0 ? (ganancia / p) * 100 : 0

  const valido = nombre.trim() && p > 0 && receta.every((r) => num(r.cantidad) > 0)

  function agregar() {
    if (!elegido) return
    setReceta((r) => [...r, { insumo_id: Number(elegido), cantidad: '' }])
    setElegido('')
  }

  async function guardar() {
    setOcupado(true)
    setError('')
    try {
      await api.guardarPlato({
        id: nuevo ? undefined : Number(id),
        nombre: nombre.trim(),
        categoria,
        precio: p,
        activo,
        receta: receta.map((r) => ({ insumo_id: r.insumo_id, cantidad: num(r.cantidad) })),
      })
      navigate('/menu', { state: { aviso: nuevo ? 'Plato creado ✓' : 'Cambios guardados ✓' } })
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
      setOcupado(false)
    }
  }

  if (!cargado || !catalogo) {
    return <div className="screen"><h1>{nuevo ? 'Nuevo plato' : 'Editar plato'}</h1>{error ? <p className="error">{error}</p> : <p className="muted">Cargando…</p>}</div>
  }

  return (
    <>
      <div className="screen" style={{ paddingBottom: 190 }}>
        <div className="header">
          <h1>{nuevo ? 'Nuevo plato' : 'Editar plato'}</h1>
          <Link to="/menu" className="link-btn">Volver</Link>
        </div>

        <Tarjeta style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label htmlFor="p-nombre">Nombre</label>
            <input id="p-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="segmentos" role="radiogroup" aria-label="Categoría">
            {CATEGORIAS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={categoria === c} className={categoria === c ? 'on' : ''} onClick={() => setCategoria(c)}>{c}</button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="p-precio">Precio de venta (S/)</label>
            <input id="p-precio" className="input" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </div>
          <label className="ajuste-fila">
            <span>Activo hoy<span className="muted small" style={{ display: 'block' }}>Si lo apagas, no sale al vender</span></span>
            <input type="checkbox" role="switch" className="switch" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          </label>
        </Tarjeta>

        <h2>Receta</h2>
        <p className="muted small" style={{ marginTop: -6 }}>Cuánto lleva UN plato de cada insumo. Con esto se descuenta el stock al vender.</p>

        {receta.map((r) => {
          const i = porId[r.insumo_id]
          return (
            <Tarjeta key={r.insumo_id} className="receta-fila">
              <span className="row-title">{i?.nombre}</span>
              <input className="input" inputMode="decimal" aria-label={`Cantidad de ${i?.nombre}`} value={r.cantidad} placeholder="0"
                onChange={(e) => setReceta((rs) => rs.map((x) => (x.insumo_id === r.insumo_id ? { ...x, cantidad: e.target.value } : x)))} />
              <span className="muted">{i?.unidad}</span>
              <button type="button" className="quitar" aria-label={`Quitar ${i?.nombre}`} onClick={() => setReceta((rs) => rs.filter((x) => x.insumo_id !== r.insumo_id))}>✕</button>
            </Tarjeta>
          )
        })}
        {receta.length === 0 && <p className="muted small">Este plato aún no lleva insumos: no descontará stock.</p>}

        <Tarjeta>
          <div className="extra-fila">
            <select className="input" aria-label="Agregar insumo a la receta" value={elegido} onChange={(e) => setElegido(e.target.value)} style={{ flex: 1, width: 'auto' }}>
              <option value="">Elegir insumo…</option>
              {disponibles.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
            <BotonPrimario variante="secondary" className="small" disabled={!elegido} onClick={agregar}>Agregar</BotonPrimario>
          </div>
          {catalogo.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>Primero crea insumos en Más → Insumos.</p>}
        </Tarjeta>

        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="savebar">
        <div className="total">
          <span className="muted small">Costo {fmtSoles(costo)} · ganas {fmtSoles(ganancia)}</span>
          <strong>{margen.toFixed(1)} % de margen</strong>
        </div>
        <BotonPrimario disabled={!valido || ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</BotonPrimario>
      </div>
    </>
  )
}
