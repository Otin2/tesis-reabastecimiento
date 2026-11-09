import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Burbuja, Icons } from '../components/ui'

const SUGERENCIAS = ['¿Qué plato sale más?', '¿Cuánto pollo queda?', '¿Qué insumos faltan?', '¿Cuál es el margen del lomo?']

export default function Asistente() {
  const [msgs, setMsgs] = useState([
    { rol: 'bot', texto: 'Hola, soy tu asistente. Pregúntame por el stock, las ventas, las ganancias o los márgenes.' },
  ])
  const [texto, setTexto] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const fin = useRef(null)

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, escribiendo])

  async function enviar(t) {
    const pregunta = (t ?? texto).trim()
    if (!pregunta || escribiendo) return
    setTexto('')
    setMsgs((m) => [...m, { rol: 'user', texto: pregunta }])
    setEscribiendo(true)
    try {
      const r = await api.chat(pregunta)
      setMsgs((m) => [...m, { rol: 'bot', texto: r.respuesta }])
    } catch {
      setMsgs((m) => [...m, { rol: 'bot', texto: 'Ahora no puedo responder. Intenta de nuevo en un momento.' }])
    } finally {
      setEscribiendo(false)
    }
  }

  return (
    <div className="screen fill">
      <h1>Asistente</h1>
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) => <Burbuja key={i} rol={m.rol}>{m.texto}</Burbuja>)}
        {escribiendo && (
          <Burbuja rol="bot"><span className="typing" aria-label="Escribiendo"><i /><i /><i /></span></Burbuja>
        )}
        <div ref={fin} />
      </div>
      <div className="suggestions">
        {SUGERENCIAS.map((s) => (
          <button key={s} className="pill chip" onClick={() => enviar(s)}>{s}</button>
        ))}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <input className="input" placeholder="Escribe tu pregunta…" aria-label="Pregunta" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="send" type="submit" aria-label="Enviar" disabled={!texto.trim() || escribiendo}>{Icons.enviar}</button>
      </form>
    </div>
  )
}
