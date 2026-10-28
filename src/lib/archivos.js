// Descarga de archivos generados en el navegador (CSV para Excel y JSON de respaldo).

export function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Exporta filas a CSV separado por ";" (formato que Excel en español abre directamente).
 * @param {string} nombre
 * @param {{titulo: string, valor: (fila) => any}[]} columnas
 * @param {object[]} filas
 */
export function exportarCSV(nombre, columnas, filas) {
  const celda = (v) => {
    const s = v == null ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const lineas = [
    columnas.map((c) => celda(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(';')),
  ]
  descargar(nombre, '﻿' + lineas.join('\r\n'), 'text/csv;charset=utf-8')
}

export function leerArchivoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(lector.result)
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsText(archivo)
  })
}
