import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { LIMITE_MS, SEGUNDOS_AVISO, registrarActividad, sesionVencida, tiempoRestante } from '@/lib/inactividad'

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll']

/**
 * Vigila la actividad del usuario y llama a `alVencer` tras el tiempo límite.
 * Una actividad después del vencimiento no revive la sesión: la cierra.
 */
export function useInactividad(alVencer) {
  const restante = ref(LIMITE_MS)
  let intervalo = null
  let ultimaEscritura = 0
  let vencida = false

  function revisar() {
    if (vencida) return
    const r = tiempoRestante()
    restante.value = r ?? 0
    if (r === null || r <= 0) {
      vencida = true
      detener()
      alVencer()
    }
  }

  function actividad() {
    if (vencida) return
    if (sesionVencida()) return revisar()
    const t = Date.now()
    // Escribe como máximo cada 2 s para no saturar el almacenamiento con mousemove.
    if (t - ultimaEscritura > 2000) {
      ultimaEscritura = t
      registrarActividad(t)
      restante.value = LIMITE_MS
    }
  }

  function seguirConectado() {
    ultimaEscritura = 0
    actividad()
    revisar()
  }

  function detener() {
    for (const e of EVENTOS) window.removeEventListener(e, actividad, { capture: true })
    document.removeEventListener('visibilitychange', revisar)
    clearInterval(intervalo)
  }

  onMounted(() => {
    revisar()
    for (const e of EVENTOS) window.addEventListener(e, actividad, { capture: true, passive: true })
    document.addEventListener('visibilitychange', revisar)
    intervalo = setInterval(revisar, 1000)
  })
  onBeforeUnmount(detener)

  const enAviso = computed(() => restante.value > 0 && restante.value <= SEGUNDOS_AVISO * 1000)
  const segundosRestantes = computed(() => Math.max(0, Math.ceil(restante.value / 1000)))

  return { enAviso, segundosRestantes, seguirConectado }
}
