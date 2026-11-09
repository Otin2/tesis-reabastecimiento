import { fmtCantidad, fmtSoles } from './api'

const fechaLarga = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })

// Texto plano: sirve para WhatsApp y como respaldo si el celular no puede compartir archivos.
export function textoLista(lista) {
  const filas = lista.lineas.map((l) => `• ${l.nombre}: ${fmtCantidad(l.cantidad, l.unidad)}`)
  return [`Lista de compras – ${fechaLarga(lista.fecha)}`, '', ...filas, '', `Costo estimado${lista.hayExtras ? ' (sin extras)' : ''}: ${fmtSoles(lista.costo_total)}`].join('\n')
}

// PDF con casillas vacías para tachar a mano. jsPDF se carga solo al pedirlo.
export async function generarPdf(lista) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 22

  doc.setFont('helvetica', 'bold').setFontSize(20).text('Lista de compras', 20, y)
  y += 8
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(107, 115, 128).text(fechaLarga(lista.fecha), 20, y)
  doc.setTextColor(25, 29, 38)
  y += 12

  lista.lineas.forEach((l) => {
    if (y > 270) {
      doc.addPage()
      y = 22
    }
    doc.setDrawColor(107, 115, 128).rect(20, y - 5, 6, 6)
    doc.setFont('helvetica', 'bold').setFontSize(13).text(l.nombre, 32, y)
    doc.setFont('helvetica', 'normal').text(fmtCantidad(l.cantidad, l.unidad), 100, y)
    doc.setTextColor(107, 115, 128).text(l.costo_estimado == null ? '-' : fmtSoles(l.costo_estimado), 190, y, { align: 'right' })
    doc.setTextColor(25, 29, 38)
    doc.setDrawColor(227, 230, 235).line(20, y + 4, 190, y + 4)
    y += 12
  })

  y += 4
  doc.setFont('helvetica', 'bold').setFontSize(13).text(lista.hayExtras ? 'Costo estimado (sin extras)' : 'Costo estimado', 20, y)
  doc.text(fmtSoles(lista.costo_total), 190, y, { align: 'right' })

  return doc.output('blob')
}

export const nombreArchivo = (lista) => `lista-de-compras-${lista.fecha}.pdf`

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Abre el menú de compartir del celular (WhatsApp, etc.). Devuelve false si el usuario cancela.
export async function compartir(lista) {
  const texto = textoLista(lista)
  try {
    const blob = await generarPdf(lista)
    const archivo = new File([blob], nombreArchivo(lista), { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Lista de compras', text: texto })
      return true
    }
    if (navigator.share) {
      await navigator.share({ title: 'Lista de compras', text: texto })
      return true
    }
  } catch (e) {
    if (e?.name === 'AbortError') return false
  }
  // Escritorio: abre WhatsApp Web con el texto listo para enviar.
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  return true
}
