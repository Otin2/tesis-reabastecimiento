import { useState } from 'react'
import { api, num } from '../lib/api'
import { BotonPrimario } from './ui'

// Unidad elegida en pantalla -> [unidad base, factor]. Todo se guarda en unidad base.
const UNIDADES = { kg: ['g', 1000], L: ['ml', 1000], unid: ['unid', 1] }
const VACIO = { nombre: '', tipo: 'general', unidad: 'unid', precio: '', tam: '', stock: '', reorden: '', dura: '' }

// Formulario para crear un insumo nuevo. Lo usan la lista de compras y la pantalla Insumos.
export default function FormInsumo({ nombreInicial = '', tipoInicial = 'general', onCreado, onCancelar }) {
  const [form, setForm] = useState({ ...VACIO, nombre: nombreInicial, tipo: tipoInicial })
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const receta = form.tipo === 'receta'
  const u = form.unidad
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const valido =
    form.nombre.trim() && num(form.precio) > 0 && num(form.tam) > 0 &&
    (!receta || (form.stock !== '' && num(form.stock) >= 0 && num(form.reorden) > 0))

  async function enviar(e) {
    e.preventDefault()
    if (!valido) return
    const [unidad, factor] = UNIDADES[u]
    setOcupado(true)
    setError('')
    try {
      const creado = await api.crearInsumo({
        nombre: form.nombre.trim(),
        unidad,
        en_recetas: receta,
        costo_unitario: num(form.precio) / factor,
        presentacion_compra: num(form.tam) * factor,
        ...(receta ? { stock: num(form.stock) * factor, punto_reorden: num(form.reorden) * factor } : {}),
        ...(receta && num(form.dura) > 0 ? { vida_util_dias: Math.round(num(form.dura)) } : {}),
      })
      onCreado(creado)
    } catch {
      setError('No se pudo crear el insumo. Intenta de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form className="extra-form" onSubmit={enviar}>
      <div className="field">
        <label htmlFor="n-nombre">Nombre</label>
        <input id="n-nombre" className="input" value={form.nombre} onChange={set('nombre')} />
      </div>
      <div className="segmentos dos" role="radiogroup" aria-label="Tipo de insumo">
        <button type="button" role="radio" aria-checked={!receta} className={!receta ? 'on' : ''} onClick={() => setForm({ ...form, tipo: 'general' })}>Uso general</button>
        <button type="button" role="radio" aria-checked={receta} className={receta ? 'on' : ''} onClick={() => setForm({ ...form, tipo: 'receta' })}>Va en recetas</button>
      </div>
      <p className="nota small muted">
        {receta
          ? 'Se descuenta del stock al venderse un plato que lo lleva y avisa cuando esté por agotarse.'
          : 'Por ejemplo servilletas o bolsas. No descuenta stock ni genera alertas: solo aparece cuando lo agregas a la lista.'}
      </p>
      <div className="campo-par">
        <div className="field">
          <label htmlFor="n-unidad">Se mide en</label>
          <select id="n-unidad" className="input" value={u} onChange={set('unidad')}>
            <option value="unid">unidades</option>
            <option value="kg">kilos (kg)</option>
            <option value="L">litros (L)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="n-precio">Precio por {u === 'unid' ? 'unidad' : u} (S/)</label>
          <input id="n-precio" className="input" inputMode="decimal" value={form.precio} onChange={set('precio')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="n-tam">Cuánto compras normalmente ({u})</label>
        <input id="n-tam" className="input" inputMode="decimal" placeholder={u === 'unid' ? 'Ej. 100' : 'Ej. 5'} value={form.tam} onChange={set('tam')} />
      </div>
      {receta && (
        <>
          <div className="campo-par">
            <div className="field">
              <label htmlFor="n-stock">Stock actual ({u})</label>
              <input id="n-stock" className="input" inputMode="decimal" value={form.stock} onChange={set('stock')} />
            </div>
            <div className="field">
              <label htmlFor="n-reorden">Avisar cuando quede ({u})</label>
              <input id="n-reorden" className="input" inputMode="decimal" value={form.reorden} onChange={set('reorden')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="n-dura">¿Cuántos días dura? (opcional)</label>
            <input id="n-dura" className="input" inputMode="numeric" placeholder="Ej. 4 para el pollo" value={form.dura} onChange={set('dura')} />
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <BotonPrimario type="button" variante="ghost" className="small" onClick={onCancelar}>Cancelar</BotonPrimario>
        <BotonPrimario type="submit" className="small" disabled={!valido || ocupado}>Crear</BotonPrimario>
      </div>
    </form>
  )
}
