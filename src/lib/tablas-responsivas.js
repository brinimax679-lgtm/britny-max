// Pone a cada celda de las tablas (.tabla) el nombre de su columna en data-label,
// tomado del encabezado. En celular, style.css muestra cada fila como tarjeta y
// usa ese rótulo junto al valor. Funciona con cualquier tabla, también al
// paginar o filtrar, porque observa los cambios del documento.

function rotular(tabla) {
  const titulos = [...tabla.querySelectorAll('thead th')].map((th) => th.textContent.trim())
  if (!titulos.length) return
  for (const fila of tabla.querySelectorAll('tbody tr')) {
    ;[...fila.children].forEach((celda, i) => {
      const titulo = titulos[i] ?? ''
      if (celda.dataset.label !== titulo) celda.dataset.label = titulo
    })
  }
}

let pendiente = false
function rotularTodo() {
  pendiente = false
  document.querySelectorAll('table.tabla').forEach(rotular)
}

export function iniciarTablasResponsivas() {
  if (typeof MutationObserver === 'undefined') return
  // Se agrupan los cambios: un render que agrega muchas filas rotula una sola vez.
  new MutationObserver(() => {
    if (pendiente) return
    pendiente = true
    queueMicrotask(rotularTodo)
  }).observe(document.body, { childList: true, subtree: true })
  rotularTodo()
}
