import { createContext, useContext, useEffect, useState } from 'react'
import { DEMO, supabase } from './supabase'
import { mock } from './mock'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (DEMO) {
      setUser(JSON.parse(sessionStorage.getItem('demo-user') || 'null'))
      setCargando(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function login(email, password) {
    if (DEMO) {
      const u = await mock.login(email, password)
      sessionStorage.setItem('demo-user', JSON.stringify(u))
      setUser(u)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Correo o contraseña incorrectos')
  }

  async function logout() {
    if (DEMO) {
      sessionStorage.removeItem('demo-user')
      setUser(null)
    } else {
      await supabase.auth.signOut()
    }
  }

  return <AuthCtx.Provider value={{ user, cargando, login, logout, demo: DEMO }}>{children}</AuthCtx.Provider>
}
