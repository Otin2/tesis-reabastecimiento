import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtSoles, num } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'

const CATEGORIAS = [
  ['alquiler', 'Alquiler'],
  ['servicios', 'Servicios'],
  ['sueldos', 'Sueldos'],
  ['otros', 'Otros'],
]

// Fila con el monto editable: se guarda al salir del campo.
function FilaGasto({ g, onGuardar, onQuitar }) {
  const [valor, setValor] = useState(String(g.monto))
  const cambio = num(valor) > 0 && num(valor) !== g.monto

  return (
    <div className="gasto-fila">
      <span className="costo-nombre">
        {g.nombre}
        {!g.fijo && <span className="pill chip" style={{ marginLeft: 8, padding: '2px 8px' }}>Solo esta vez</span>}
      </span>
      <span className="muted">S/</span>
      <input
        className="input"
        inputMode="decimal"
        aria-label={`Monto de ${g.nombre}`}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => (cambio ? onGuardar({ ...g, monto: num(valor) }) : setValor(String(g.monto)))}
      />
      <button type="button" className="quitar" aria-label={`Quitar ${g.nombre}`} onClick={() => onQuitar(g)}>✕</button>
    </div>
  )
}

// Gastos del negocio: servicios, sueldos, alquiler... Alimentan la ganancia neta.
export default function Gastos() {
  const [gastos, setGastos] = useState(null)
  const [error, setError] = useState(false)
  const [aviso, setAviso] = useState('')
  const [form, setForm] = useState({ nombre: '', categoria: 'servicios', monto: '', fijo: true })
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => api.gastos().then(setGastos).catch(() => setError(true)), [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2200)
    return () => clearTimeout(t)
  }, [aviso])

  async function guardar(g) {
    try {
      await api.actualizarGasto(g)
      await cargar()
      setAviso('Guardado ✓')
    } catch {
      setAviso('No se pudo guardar')
    }
  }

  async function quitar(g) {
    try {
      await api.quitarGasto(g.id)
      await cargar()
      setAviso(`${g.nombre} quitado`)
    } catch {
      setAviso('No se pudo quitar')
    }
  }

  async function agregar(e) {
    e.preventDefault()
    if (!form.nombre.trim() || !(num(form.monto) > 0)) return
    setOcupado(true)
    try {
      await api.crearGasto({ nombre: form.nombre.trim(), categoria: form.categoria, monto: num(form.monto), fijo: form.fijo })
      setForm({ ...form, nombre: '', monto: '' })
      await cargar()
      setAviso('Gasto agregado ✓')
    } catch {
      setAviso('No se pudo agregar')
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <div className="screen"><h1>Gastos</h1><p className="error">No se pudieron cargar los gastos.</p></div>
  if (!gastos) return <div className="screen"><h1>Gastos</h1><p className="muted">Cargando…</p></div>

  const fijos = gastos.filter((g) => g.fijo)
  const totalMes = fijos.reduce((s, g) => s + g.monto, 0)

  return (
    <div className="screen">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="header">
        <div>
          <h1>Gastos</h1>
          <p className="muted">Lo que pagas además de los insumos</p>
        </div>
        <Link to="/mas" className="link-btn">Volver</Link>
      </div>

      <Tarjeta style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="muted small">Gastos fijos al mes</span>
          <div className="stat-num">{fmtSoles(totalMes)}</div>
        </div>
        <span className="muted small" style={{ textAlign: 'right' }}>Se reparten por día<br />en las ganancias</span>
      </Tarjeta>

      {CATEGORIAS.map(([k, titulo]) => {
        const items = gastos.filter((g) => g.categoria === k)
        if (!items.length) return null
        return (
          <Tarjeta key={k} className="costos">
            <div className="costo-titulo small muted">{titulo}</div>
            {items.map((g) => (
              <FilaGasto key={`${g.id}-${g.monto}`} g={g} onGuardar={guardar} onQuitar={quitar} />
            ))}
          </Tarjeta>
        )
      })}
      {gastos.length === 0 && <p className="empty">Todavía no registras gastos.</p>}

      <Tarjeta>
        <h2 style={{ marginBottom: 10 }}>Agregar gasto</h2>
        <form className="extra-form" onSubmit={agregar}>
          <input className="input" placeholder="Ej. Sueldo ayudante" aria-label="Nombre del gasto" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <div className="segmentos cuatro" role="radiogroup" aria-label="Categoría">
            {CATEGORIAS.map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={form.categoria === k} className={form.categoria === k ? 'on' : ''} onClick={() => setForm({ ...form, categoria: k })}>{t}</button>
            ))}
          </div>
          <div className="segmentos dos" role="radiogroup" aria-label="Frecuencia">
            <button type="button" role="radio" aria-checked={form.fijo} className={form.fijo ? 'on' : ''} onClick={() => setForm({ ...form, fijo: true })}>Cada mes</button>
            <button type="button" role="radio" aria-checked={!form.fijo} className={!form.fijo ? 'on' : ''} onClick={() => setForm({ ...form, fijo: false })}>Solo esta vez</button>
          </div>
          <div className="extra-fila">
            <input className="input" inputMode="decimal" placeholder="Monto en S/" aria-label="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} style={{ flex: 1, width: 'auto' }} />
            <BotonPrimario type="submit" className="small" disabled={!form.nombre.trim() || !(num(form.monto) > 0) || ocupado}>Agregar</BotonPrimario>
          </div>
        </form>
      </Tarjeta>
    </div>
  )
}
