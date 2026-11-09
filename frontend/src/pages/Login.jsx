import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { BotonPrimario, Icons } from '../components/ui'

export default function Login() {
  const { login, demo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="screen login" onSubmit={enviar}>
      <div className="logo">{Icons.logo}</div>
      <h1>Bienvenida</h1>
      <p className="muted">Ingresa para registrar ventas y ver qué insumos comprar.</p>
      {demo && <div className="demo-note">Modo demo: puedes entrar con cualquier correo y contraseña.</div>}
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <BotonPrimario type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</BotonPrimario>
    </form>
  )
}
