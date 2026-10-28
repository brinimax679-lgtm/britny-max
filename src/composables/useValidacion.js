import { nextTick, ref, watch } from 'vue'

/**
 * Muestra los errores junto a cada campo. Valida al enviar y, desde ese
 * momento, vuelve a validar mientras el usuario corrige los datos.
 * @param {object} origen  objeto reactivo del formulario
 * @param {() => Record<string, string>} validar
 */
export function useValidacion(origen, validar) {
  const errores = ref({})
  const intentado = ref(false)

  watch(origen, () => {
    if (intentado.value) errores.value = validar()
  }, { deep: true })

  function enfocarPrimero() {
    nextTick(() => document.querySelector('[aria-invalid="true"]')?.focus())
  }

  /** @returns {boolean} true si no hay errores */
  function comprobar() {
    intentado.value = true
    errores.value = validar()
    const valido = Object.keys(errores.value).length === 0
    if (!valido) enfocarPrimero()
    return valido
  }

  /** Muestra en los campos los errores devueltos por el store o el servidor. */
  function desdeError(error) {
    if (!error?.errores) return false
    intentado.value = true
    errores.value = error.errores
    enfocarPrimero()
    return true
  }

  function reiniciar() {
    intentado.value = false
    errores.value = {}
  }

  return { errores, comprobar, desdeError, reiniciar }
}
