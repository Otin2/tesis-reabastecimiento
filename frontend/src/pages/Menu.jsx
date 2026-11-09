import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, fmtSoles } from '../lib/api'
import { Tarjeta, BotonPrimario } from '../components/ui'

const clase = (m) => (m >= 65 ? 'ok' : m >= 50 ? 'bajo' : 'critico')

// Lista de platos: activar o desactivar los del día y entrar a editar cada uno.
export default function Menu() {
  const { state } = useLocation()
  const [platos, setPlatos] = useState(null)
  const [error, setError] = useState(false)
  const [aviso, setAviso] = useState(state?.aviso ?? '')

  useEffect(() => {
    api.platosAdmin().then(setPlatos).catch(() => setError(true))
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2400)
    return () => clearTimeout(t)
  }, [aviso])

  async function alternar(p) {
    const antes = platos
    setPlatos((ps) => ps.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)))
    try {
      await api.guardarPlato({ ...p, activo: !p.activo })
    } catch {
      setPlatos(antes)
      setAviso('No se pudo cambiar')
    }
  }

  if (error) return <div className="screen"><h1>Menú</h1><p className="error">No se pudo cargar el menú.</p></div>
  if (!platos) return <div className="screen"><h1>Menú</h1><p className="muted">Cargando…</p></div>

  const activos = platos.filter((p) => p.activo).length

  return (
    <div className="screen">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="header">
        <div>
          <h1>Menú y recetas</h1>
          <p className="muted">{activos} de {platos.length} platos activos hoy</p>
        </div>
        <Link to="/mas" className="link-btn">Volver</Link>
      </div>

      <Link to="/menu/nuevo" style={{ textDecoration: 'none' }}>
        <BotonPrimario tabIndex={-1}>+ Nuevo plato</BotonPrimario>
      </Link>

      {platos.map((p) => (
        <Tarjeta key={p.id} className={`plato-fila ${p.activo ? '' : 'inactivo'}`}>
          <Link to={`/menu/${p.id}`} className="plato-info">
            <span className="row-title">{p.nombre}</span>
            <span className="muted small">{p.categoria} · {fmtSoles(p.precio)} · costo {fmtSoles(p.costo)}</span>
            <span className={`pill ${clase(p.margen_pct)}`} style={{ alignSelf: 'flex-start', marginTop: 4 }}>{p.margen_pct} % de margen</span>
          </Link>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={p.activo}
            aria-label={`${p.nombre} activo hoy`}
            onChange={() => alternar(p)}
          />
        </Tarjeta>
      ))}
      <p className="muted small">Los platos desactivados no aparecen en la pantalla de vender.</p>
    </div>
  )
}
