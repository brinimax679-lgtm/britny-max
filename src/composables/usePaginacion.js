import { computed, ref, watch } from 'vue'

/** Filas por página en todas las listas del sistema. */
export const POR_PAGINA = 10

// Al imprimir (reportes, historial) se muestran todas las filas, no solo la página actual.
const imprimiendo = ref(false)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => (imprimiendo.value = true))
  window.addEventListener('afterprint', () => (imprimiendo.value = false))
}

/**
 * Pagina una lista calculada.
 * - `fuente`: función que devuelve el arreglo completo (ya filtrado).
 * - `reiniciarCon`: función con los filtros; al cambiar, vuelve a la página 1.
 * Si la lista se acorta (por ejemplo, al eliminar), la página se ajusta sola.
 */
export function usePaginacion(fuente, { porPagina = POR_PAGINA, reiniciarCon } = {}) {
  const pagina = ref(1)
  const lista = computed(() => fuente() ?? [])
  const total = computed(() => lista.value.length)
  const paginas = computed(() => Math.max(1, Math.ceil(total.value / porPagina)))

  watch(paginas, (n) => {
    if (pagina.value > n) pagina.value = n
  })
  if (reiniciarCon) watch(reiniciarCon, () => (pagina.value = 1), { deep: true })

  const visibles = computed(() => {
    if (imprimiendo.value) return lista.value
    const inicio = (pagina.value - 1) * porPagina
    return lista.value.slice(inicio, inicio + porPagina)
  })

  return { pagina, paginas, total, visibles, porPagina }
}
