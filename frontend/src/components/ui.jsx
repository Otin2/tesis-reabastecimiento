import { NavLink } from 'react-router-dom'

export const Tarjeta = ({ className = '', children, ...p }) => (
  <div className={`card ${className}`} {...p}>{children}</div>
)

export const Pill = ({ nivel }) => (
  <span className={`pill ${nivel === 'Crítico' ? 'critico' : nivel === 'Bajo' ? 'bajo' : 'ok'}`}>{nivel}</span>
)

export const BotonPrimario = ({ variante = '', className = '', children, ...p }) => (
  <button className={`btn ${variante} ${className}`} {...p}>{children}</button>
)

export const Burbuja = ({ rol, children }) => <div className={`bubble ${rol}`}>{children}</div>

const icon = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
export const Icons = {
  inicio: icon(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>),
  vender: icon(<><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M2 3h3l2.7 12.4a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 7H6" /></>),
  asistente: icon(<path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z" />),
  ganancias: icon(<><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>),
  enviar: icon(<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>),
  logo: icon(<><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>),
}

export function BottomNav() {
  const items = [
    ['/', 'Inicio', Icons.inicio],
    ['/vender', 'Vender', Icons.vender],
    ['/asistente', 'Asistente', Icons.asistente],
    ['/ganancias', 'Ganancias', Icons.ganancias],
  ]
  return (
    <nav className="nav">
      {items.map(([to, label, ic]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          {ic}
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
