import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAjustes } from '../lib/ajustes'
import { Tarjeta, BotonPrimario } from '../components/ui'

const TEMAS = [['sistema', 'Sistema'], ['claro', 'Claro'], ['oscuro', 'Oscuro']]

export default function Ajustes() {
  const { user, logout, demo } = useAuth()
  const { ajustes, cambiar, borrarDatosLocales } = useAjustes()
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState('')

  function borrar() {
    borrarDatosLocales()
    setConfirmando(false)
    setAviso('Datos del dispositivo borrados')
    setTimeout(() => setAviso(''), 2200)
  }

  return (
    <div className="screen">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="header">
        <h1>Ajustes</h1>
        <Link to="/" className="link-btn">Volver</Link>
      </div>

      <section className="ajuste-grupo">
        <h2>Cuenta</h2>
        <Tarjeta>
          <div className="field">
            <label htmlFor="rest">Nombre del restaurante</label>
            <input id="rest" className="input" value={ajustes.restaurante} placeholder="Ej. Sabor de Lima" onChange={(e) => cambiar({ restaurante: e.target.value })} />
          </div>
          <div className="ajuste-fila">
            <span className="muted">Sesión</span>
            <span>{demo ? 'Modo demo' : user?.email}</span>
          </div>
          <BotonPrimario variante="ghost" onClick={logout}>Cerrar sesión</BotonPrimario>
        </Tarjeta>
      </section>

      <section className="ajuste-grupo">
        <h2>Apariencia</h2>
        <Tarjeta>
          <span className="small muted" id="tema-lbl">Tema</span>
          <div className="segmentos" role="radiogroup" aria-labelledby="tema-lbl">
            {TEMAS.map(([v, t]) => (
              <button key={v} role="radio" aria-checked={ajustes.tema === v} className={ajustes.tema === v ? 'on' : ''} onClick={() => cambiar({ tema: v })}>{t}</button>
            ))}
          </div>
        </Tarjeta>
      </section>

      <section className="ajuste-grupo">
        <h2>Preferencias</h2>
        <Tarjeta>
          <label className="ajuste-fila">
            <span>
              Alertas de stock en Inicio
              <span className="muted small" style={{ display: 'block' }}>Muestra los insumos que se están agotando</span>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={ajustes.alertas} onChange={(e) => cambiar({ alertas: e.target.checked })} />
          </label>
        </Tarjeta>
      </section>

      <section className="ajuste-grupo">
        <h2>Datos</h2>
        <Tarjeta>
          <p className="muted small">Borra las listas de compras marcadas y los ajustes guardados en este celular. No toca las ventas ni el inventario.</p>
          {confirmando ? (
            <div className="actions">
              <BotonPrimario variante="ghost" onClick={() => setConfirmando(false)}>Cancelar</BotonPrimario>
              <BotonPrimario style={{ background: 'var(--danger)' }} onClick={borrar}>Sí, borrar</BotonPrimario>
            </div>
          ) : (
            <BotonPrimario variante="ghost" onClick={() => setConfirmando(true)}>Borrar datos de este dispositivo</BotonPrimario>
          )}
        </Tarjeta>
      </section>

      <section className="ajuste-grupo">
        <h2>Acerca de</h2>
        <Tarjeta>
          <div className="ajuste-fila"><span className="muted">Versión</span><span>0.1.0</span></div>
          <div className="ajuste-fila"><span className="muted">Moneda</span><span>Soles (S/)</span></div>
          <div className="ajuste-fila"><span className="muted">Idioma</span><span>Español</span></div>
        </Tarjeta>
      </section>
    </div>
  )
}
