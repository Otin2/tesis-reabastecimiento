import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { BottomNav } from './components/ui'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import RegistrarVenta from './pages/RegistrarVenta'
import Asistente from './pages/Asistente'
import Ganancias from './pages/Ganancias'
import ListaCompras from './pages/ListaCompras'
import Ajustes from './pages/Ajustes'
import RegistrarCompra from './pages/RegistrarCompra'
import Mas from './pages/Mas'
import Menu from './pages/Menu'
import MenuEditor from './pages/MenuEditor'
import Insumos from './pages/Insumos'
import VentasHoy from './pages/VentasHoy'
import Gastos from './pages/Gastos'

export default function App() {
  const { user, cargando } = useAuth()
  if (cargando) return null

  if (!user) {
    return (
      <div className="app">
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </div>
    )
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/vender" element={<RegistrarVenta />} />
        <Route path="/asistente" element={<Asistente />} />
        <Route path="/ganancias" element={<Ganancias />} />
        <Route path="/lista" element={<ListaCompras />} />
        <Route path="/lista/comprar" element={<RegistrarCompra />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:id" element={<MenuEditor />} />
        <Route path="/insumos" element={<Insumos />} />
        <Route path="/ventas" element={<VentasHoy />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
