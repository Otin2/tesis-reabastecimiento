import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'ajustes'
const POR_DEFECTO = { tema: 'sistema', alertas: true, restaurante: '' }

const AjustesCtx = createContext(null)
export const useAjustes = () => useContext(AjustesCtx)

function leer() {
  try {
    return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return POR_DEFECTO
  }
}

export function AjustesProvider({ children }) {
  const [ajustes, setAjustes] = useState(leer)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(ajustes)) } catch { /* sin almacenamiento */ }
    const raiz = document.documentElement
    if (ajustes.tema === 'sistema') raiz.removeAttribute('data-theme')
    else raiz.dataset.theme = ajustes.tema === 'oscuro' ? 'dark' : 'light'
  }, [ajustes])

  const cambiar = (cambios) => setAjustes((a) => ({ ...a, ...cambios }))

  // Borra lo guardado en este dispositivo: ajustes y listas de compras.
  function borrarDatosLocales() {
    try {
      Object.keys(localStorage).filter((k) => k === KEY || k.startsWith('lista-compras-')).forEach((k) => localStorage.removeItem(k))
    } catch { /* sin almacenamiento */ }
    setAjustes(POR_DEFECTO)
  }

  return <AjustesCtx.Provider value={{ ajustes, cambiar, borrarDatosLocales }}>{children}</AjustesCtx.Provider>
}
