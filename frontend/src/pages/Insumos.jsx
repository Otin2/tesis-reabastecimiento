import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, fmtCantidad, fmtDias, fmtSoles, num, vistaUnidad } from '../lib/api'
import { PLANTILLA, parsearCsv } from '../lib/csv'
import { descargar } from '../lib/lista'
import { Tarjeta, Pill, BotonPrimario } from '../components/ui'
import FormInsumo from '../components/FormInsumo'

const MODOS = [
  ['ajuste', 'Contar'],
  ['merma', 'Merma'],
  ['consumo_propio', 'Uso propio'],
]
const orden = { Crítico: 0, Bajo: 1 }

export default function Insumos() {
  const { state } = useLocation()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [modo, setModo] = useState('ajuste')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [panel, setPanel] = useState(null) // 'nuevo' | 'importar'
  const [csv, setCsv] = useState(null) // { nombre, filas, errores }
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(() => api.insumos().then(setLista).catch(() => setError(true)), [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 2600)
    return () => clearTimeout(t)
  }, [aviso])

  // Si venimos de una alerta ("por vencer"), abre ese insumo directamente.
  useEffect(() => {
    if (!lista || !state?.abrir) return
    const i = lista.find((x) => x.id === state.abrir)
    if (i) {
      abrir(i, 'merma')
      setTimeout(() => document.getElementById(`insumo-${i.id}`)?.scrollIntoView({ block: 'center' }), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista === null])

  function abrir(i, m = 'ajuste') {
    setAbierto(i.id)
    setModo(m)
    setValor(m === 'ajuste' && i.stock != null ? String(+(i.stock / vistaUnidad(i.unidad).factor).toFixed(3)) : '')
    setMotivo('')
  }

  function elegirModo(i, m) {
    setModo(m)
    setValor(m === 'ajuste' ? String(+(i.stock / vistaUnidad(i.unidad).factor).toFixed(3)) : '')
  }

  async function guardarAjuste(i) {
    const cantidad = num(valor) * vistaUnidad(i.unidad).factor
    setOcupado(true)
    try {
      await api.ajustarStock({ insumo_id: i.id, tipo: modo, cantidad, motivo: motivo.trim() || undefined })
      await cargar()
      setAbierto(null)
      setAviso(modo === 'ajuste' ? 'Stock corregido ✓' : 'Registrado ✓ El stock bajó')
    } catch {
      setAviso('No se pudo guardar')
    } finally {
      setOcupado(false)
    }
  }

  async function leerCsv(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setCsv({ nombre: archivo.name, ...parsearCsv(await archivo.text()) })
  }

  async function importar() {
    setOcupado(true)
    try {
      const r = await api.importarInsumos(csv.filas)
      await cargar()
      setPanel(null)
      setCsv(null)
      setAviso(`${r.creados} insumos importados${r.omitidos ? `, ${r.omitidos} ya existían` : ''} ✓`)
    } catch {
      setAviso('No se pudo importar')
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <div className="screen"><h1>Insumos</h1><p className="error">No se pudieron cargar los insumos.</p></div>
  if (!lista) return <div className="screen"><h1>Insumos</h1><p className="muted">Cargando…</p></div>

  const q = buscar.trim().toLowerCase()
  const visibles = lista
    .filter((i) => i.nombre.toLowerCase().includes(q))
    .sort((a, b) => (orden[a.nivel] ?? 2) - (orden[b.nivel] ?? 2) || Number(!a.en_recetas) - Number(!b.en_recetas) || a.nombre.localeCompare(b.nombre))

  return (
    <div className="screen">
      {aviso && <div className="toast" role="status">{aviso}</div>}
      <div className="header">
        <h1>Insumos</h1>
        <Link to="/mas" className="link-btn">Volver</Link>
      </div>

      <div className="actions" style={{ marginTop: 0 }}>
        <BotonPrimario className="small" onClick={() => setPanel(panel === 'nuevo' ? null : 'nuevo')}>+ Nuevo insumo</BotonPrimario>
        <BotonPrimario variante="ghost" className="small" onClick={() => setPanel(panel === 'importar' ? null : 'importar')}>Importar CSV</BotonPrimario>
      </div>

      {panel === 'nuevo' && (
        <Tarjeta>
          <h2 style={{ marginBottom: 10 }}>Nuevo insumo</h2>
          <FormInsumo
            tipoInicial="receta"
            onCancelar={() => setPanel(null)}
            onCreado={() => { cargar(); setPanel(null); setAviso('Insumo creado ✓') }}
          />
        </Tarjeta>
      )}

      {panel === 'importar' && (
        <Tarjeta>
          <h2 style={{ marginBottom: 6 }}>Importar desde CSV</h2>
          <p className="muted small">Útil para cargar muchos insumos de una vez desde Excel. Usa kg, L o unid. Si dejas vacío el stock y el aviso, queda como insumo de uso general.</p>
          <div className="actions">
            <BotonPrimario variante="ghost" className="small" onClick={() => descargar(new Blob(['﻿' + PLANTILLA], { type: 'text/csv' }), 'plantilla-insumos.csv')}>Descargar plantilla</BotonPrimario>
          </div>
          <input type="file" accept=".csv,text/csv" onChange={leerCsv} aria-label="Archivo CSV" style={{ marginTop: 12 }} />
          {csv && (
            <div style={{ marginTop: 12 }}>
              <p><strong>{csv.filas.length}</strong> insumos listos{csv.errores.length ? ` · ${csv.errores.length} con problemas` : ''}</p>
              {csv.errores.length > 0 && (
                <ul className="muted small" style={{ paddingLeft: 18, margin: '6px 0' }}>
                  {csv.errores.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
                  {csv.errores.length > 6 && <li>…y {csv.errores.length - 6} más</li>}
                </ul>
              )}
              <BotonPrimario style={{ marginTop: 8 }} disabled={!csv.filas.length || ocupado} onClick={importar}>
                Importar {csv.filas.length} insumos
              </BotonPrimario>
            </div>
          )}
        </Tarjeta>
      )}

      <input className="input" type="search" placeholder="Buscar insumo…" aria-label="Buscar insumo" value={buscar} onChange={(e) => setBuscar(e.target.value)} />

      {visibles.map((i) => {
        const v = vistaUnidad(i.unidad)
        const abiertoAhora = abierto === i.id
        return (
          <div key={i.id} id={`insumo-${i.id}`} className={`item ${abiertoAhora ? 'open' : ''}`}>
            <button className="item-head" aria-expanded={abiertoAhora} onClick={() => (abiertoAhora ? setAbierto(null) : abrir(i))}>
              <div>
                <div className="row-title">{i.nombre}</div>
                <div className="muted small">
                  {i.en_recetas
                    ? `Quedan ${fmtCantidad(i.stock, i.unidad)}${i.dias_restantes != null ? ` · alcanza ${fmtDias(i.dias_restantes)}` : ''}`
                    : 'No lleva stock'}
                </div>
              </div>
              {i.nivel ? <Pill nivel={i.nivel} /> : !i.en_recetas ? <span className="pill chip">Uso general</span> : null}
            </button>

            {abiertoAhora && (
              <div className="item-panel">
                <div className="pg-nums small">
                  <div><span className="muted">Precio</span><b>{fmtSoles(i.costo_unitario * v.factor)}/{v.sufijo}</b></div>
                  <div><span className="muted">Avisa en</span><b>{i.punto_reorden != null ? fmtCantidad(i.punto_reorden, i.unidad) : '–'}</b></div>
                  <div><span className="muted">Dura</span><b>{i.vida_util_dias ? `${i.vida_util_dias} días` : '–'}</b></div>
                </div>

                {i.en_recetas ? (
                  <>
                    <div className="segmentos" role="radiogroup" aria-label="Tipo de ajuste">
                      {MODOS.map(([m, t]) => (
                        <button key={m} role="radio" aria-checked={modo === m} className={modo === m ? 'on' : ''} onClick={() => elegirModo(i, m)}>{t}</button>
                      ))}
                    </div>
                    <p className="muted small">
                      {modo === 'ajuste' && 'Cuenta lo que realmente queda y se corrige el stock.'}
                      {modo === 'merma' && 'Lo que se malogró, se cayó o se botó. Cuenta como pérdida.'}
                      {modo === 'consumo_propio' && 'Lo que se usó para el personal o para la casa.'}
                    </p>
                    <div className="field">
                      <label htmlFor={`aj-${i.id}`}>{modo === 'ajuste' ? 'Queda en total' : modo === 'merma' ? 'Se perdió' : 'Se usó'} ({v.sufijo})</label>
                      <input id={`aj-${i.id}`} className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                    </div>
                    {modo !== 'ajuste' && (
                      <div className="field">
                        <label htmlFor={`mo-${i.id}`}>Motivo (opcional)</label>
                        <input id={`mo-${i.id}`} className="input" placeholder={modo === 'merma' ? 'Ej. se malogró' : 'Ej. almuerzo del personal'} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                      </div>
                    )}
                    <BotonPrimario disabled={ocupado || !(num(valor) >= 0) || valor === '' || (modo !== 'ajuste' && !(num(valor) > 0))} onClick={() => guardarAjuste(i)}>
                      Guardar
                    </BotonPrimario>
                  </>
                ) : (
                  <p className="muted small">Es de uso general: no descuenta stock. Aparece en la lista de compras cuando lo agregas.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
      {visibles.length === 0 && <p className="empty">No hay insumos con ese nombre.</p>}
    </div>
  )
}
