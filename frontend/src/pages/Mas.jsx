import { Link } from 'react-router-dom'
import { Icons } from '../components/ui'

const ENLACES = [
  ['/ventas', Icons.ventas, 'Ventas de hoy', 'Ver, anular y cierre de caja'],
  ['/menu', Icons.menu, 'Menú y recetas', 'Crear platos, editar recetas y activar los del día'],
  ['/insumos', Icons.insumos, 'Insumos y stock', 'Contar stock, mermas, uso propio e importar'],
  ['/ajustes', Icons.ajustes, 'Ajustes', 'Tema, cuenta y datos'],
]

export default function Mas() {
  return (
    <div className="screen">
      <h1>Más</h1>
      {ENLACES.map(([to, ic, titulo, sub]) => (
        <Link key={to} to={to} className="card enlace-fila">
          <span className="enlace-ic">{ic}</span>
          <span className="enlace-txt">
            <span className="row-title">{titulo}</span>
            <span className="muted small">{sub}</span>
          </span>
          <span className="muted" aria-hidden>›</span>
        </Link>
      ))}
    </div>
  )
}
