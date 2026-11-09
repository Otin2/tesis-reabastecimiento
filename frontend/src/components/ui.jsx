import { NavLink, useLocation } from 'react-router-dom'

export const Tarjeta = ({ className = '', children, ...p }) => (
  <div className={`card ${className}`} {...p}>{children}</div>
)

// nivel: 'Crítico' | 'Bajo' | otro (verde). texto reemplaza lo que se muestra.
export const Pill = ({ nivel, texto }) => (
  <span className={`pill ${nivel === 'Crítico' ? 'critico' : nivel === 'Bajo' ? 'bajo' : 'ok'}`}>{texto ?? nivel}</span>
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
  ajustes: icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></>),
  mas: icon(<><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>),
  menu: icon(<><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" /></>),
  insumos: icon(<><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>),
  ventas: icon(<><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6" /><path d="M9 12h6" /></>),
  enviar: icon(<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>),
  logo: icon(<><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>),
}

// "Más" queda resaltada en todas las pantallas que cuelgan de ella.
const RUTAS_MAS = ['/mas', '/menu', '/insumos', '/ventas', '/ajustes']

export function BottomNav() {
  const { pathname } = useLocation()
  const items = [
    ['/', 'Inicio', Icons.inicio],
    ['/vender', 'Vender', Icons.vender],
    ['/asistente', 'Asistente', Icons.asistente],
    ['/ganancias', 'Ganancias', Icons.ganancias],
    ['/mas', 'Más', Icons.mas],
  ]
  return (
    <nav className="nav">
      {items.map(([to, label, ic]) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            (to === '/mas' ? RUTAS_MAS.some((r) => pathname.startsWith(r)) : isActive) ? 'active' : ''
          }
        >
          {ic}
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
