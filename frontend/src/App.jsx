import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { BottomNav } from './components/ui'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import RegistrarVenta from './pages/RegistrarVenta'
import Asistente from './pages/Asistente'
import Pedido from './pages/Pedido'

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
        <Route path="/pedido" element={<Pedido />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
