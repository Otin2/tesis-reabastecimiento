// Importar insumos desde un CSV (por ejemplo exportado de Excel).
// Se escribe en unidades "de la vida real" (kg, L, unid) y aquí se pasa a unidad base.

const UNIDADES = { kg: ['g', 1000], l: ['ml', 1000], unid: ['unid', 1] }

export const PLANTILLA =
  'nombre,unidad,precio,compra_normal,stock,avisar_cuando_quede,dura_dias\n' +
  'Pollo,kg,12,1,3,8,4\n' +
  'Aceite,L,9,1,9,3,\n' +
  'Servilletas,unid,0.03,100,,,\n'

const n = (v) => parseFloat(String(v ?? '').replace(',', '.'))

export function parsearCsv(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lineas.length < 2) return { filas: [], errores: ['El archivo no tiene filas de datos.'] }

  const sep = lineas[0].includes(';') ? ';' : ','
  const cab = lineas[0].split(sep).map((c) => c.trim().toLowerCase())
  const col = (nombre) => cab.indexOf(nombre)
  const idx = { nombre: col('nombre'), unidad: col('unidad'), precio: col('precio'), compra: col('compra_normal'), stock: col('stock'), reorden: col('avisar_cuando_quede'), dura: col('dura_dias') }
  const faltan = ['nombre', 'unidad', 'precio', 'compra'].filter((k) => idx[k] < 0)
  if (faltan.length) return { filas: [], errores: ['Faltan columnas. Descarga la plantilla para ver el formato.'] }

  const filas = []
  const errores = []
  lineas.slice(1).forEach((linea, i) => {
    const c = linea.split(sep).map((x) => x.trim())
    const fila = i + 2
    const nombre = c[idx.nombre]
    const u = UNIDADES[(c[idx.unidad] ?? '').toLowerCase()]
    const precio = n(c[idx.precio])
    const compra = n(c[idx.compra])
    const stockTxt = idx.stock >= 0 ? c[idx.stock] : ''
    const reordenTxt = idx.reorden >= 0 ? c[idx.reorden] : ''
    const enRecetas = Boolean(stockTxt || reordenTxt) // sin stock ni aviso = uso general

    if (!nombre) return errores.push(`Fila ${fila}: falta el nombre.`)
    if (!u) return errores.push(`Fila ${fila} (${nombre}): la unidad debe ser kg, L o unid.`)
    if (!(precio > 0) || !(compra > 0)) return errores.push(`Fila ${fila} (${nombre}): revisa el precio y la compra normal.`)
    if (enRecetas && (!(n(stockTxt) >= 0) || !(n(reordenTxt) > 0))) {
      return errores.push(`Fila ${fila} (${nombre}): pon stock y "avisar cuando quede", o deja ambos vacíos si es de uso general.`)
    }

    const [unidad, factor] = u
    const dura = idx.dura >= 0 ? n(c[idx.dura]) : NaN
    filas.push({
      nombre,
      unidad,
      en_recetas: enRecetas,
      costo_unitario: precio / factor,
      presentacion_compra: compra * factor,
      ...(enRecetas ? { stock: n(stockTxt) * factor, punto_reorden: n(reordenTxt) * factor } : {}),
      ...(enRecetas && dura > 0 ? { vida_util_dias: dura } : {}),
    })
  })
  return { filas, errores }
}
