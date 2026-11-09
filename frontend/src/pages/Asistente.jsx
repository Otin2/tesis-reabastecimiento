import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Burbuja, BotonPrimario, Icons } from '../components/ui'

const SUGERENCIAS = [
  'Vendí 2 lomos y 1 ceviche',
  '¿Cuánto pollo queda?',
  '¿Por qué me sugieres comprar pollo?',
  '¿Qué plato sale más?',
  'Se malogró 1 kilo de pescado',
  'El sábado hay un cumpleaños de 40 personas',
]

const ESTADOS = { confirmada: 'Guardado ✓', cancelada: 'Cancelado' }

export default function Asistente() {
  const [msgs, setMsgs] = useState([
    { rol: 'bot', texto: 'Hola, soy tu asistente. Pregúntame por el stock, las ventas o las ganancias. También puedes escribirme lo que pasó, como "vendí 3 lomos", y yo te pido confirmar antes de guardar.' },
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
      setMsgs((m) => [...m, { rol: 'bot', texto: r.respuesta, accion: r.accion, estado: r.accion ? 'pendiente' : undefined }])
    } catch {
      setMsgs((m) => [...m, { rol: 'bot', texto: 'Ahora no puedo responder. Intenta de nuevo en un momento.' }])
    } finally {
      setEscribiendo(false)
    }
  }

  // Confirmar o cancelar lo que el agente propuso. Solo al confirmar se guarda algo.
  async function resolver(indice, confirmar) {
    const accion = msgs[indice].accion
    setMsgs((m) => m.map((x, i) => (i === indice ? { ...x, estado: 'procesando' } : x)))
    try {
      const r = confirmar ? await api.confirmarAccion(accion.id) : await api.cancelarAccion(accion.id)
      setMsgs((m) => [
        ...m.map((x, i) => (i === indice ? { ...x, estado: confirmar && r.ok ? 'confirmada' : 'cancelada' } : x)),
        { rol: 'bot', texto: confirmar ? r.mensaje : 'Listo, no guardé nada.' },
      ])
    } catch {
      setMsgs((m) => [
        ...m.map((x, i) => (i === indice ? { ...x, estado: 'pendiente' } : x)),
        { rol: 'bot', texto: 'No pude guardarlo. Intenta de nuevo.' },
      ])
    }
  }

  return (
    <div className="screen fill">
      <h1>Asistente</h1>
      <div className="chat" aria-live="polite">
        {msgs.map((m, i) => (
          <Burbuja key={i} rol={m.rol}>
            {m.texto}
            {m.accion && (
              <div className="accion">
                <div className="accion-resumen">{m.accion.resumen}</div>
                {m.estado === 'pendiente' || m.estado === 'procesando' ? (
                  <div className="actions" style={{ marginTop: 10 }}>
                    <BotonPrimario variante="ghost" className="small" disabled={m.estado === 'procesando'} onClick={() => resolver(i, false)}>Cancelar</BotonPrimario>
                    <BotonPrimario className="small" disabled={m.estado === 'procesando'} onClick={() => resolver(i, true)}>Confirmar</BotonPrimario>
                  </div>
                ) : (
                  <span className={`pill ${m.estado === 'confirmada' ? 'ok' : 'chip'}`} style={{ marginTop: 10 }}>{ESTADOS[m.estado]}</span>
                )}
              </div>
            )}
          </Burbuja>
        ))}
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
