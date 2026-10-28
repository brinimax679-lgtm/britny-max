<script setup>
// RF05 – Lectura de código de barras con la cámara del celular o computador.
// Los lectores USB/Bluetooth funcionan como teclado y no necesitan este componente.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'

const emit = defineEmits(['detectado', 'cerrar'])
const video = ref(null)
const error = ref('')
const iniciando = ref(true)

let controles = null
let montado = true
let ultimo = { codigo: '', t: 0 }

function mensajeError(e) {
  if (e?.name === 'NotAllowedError') return 'Permiso de cámara denegado. Habilítalo en el navegador para leer códigos.'
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No se encontró una cámara en este dispositivo.'
  if (e?.name === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación.'
  return 'No fue posible iniciar la cámara.'
}

onMounted(async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'Este navegador no permite usar la cámara aquí. Abre la aplicación con https o usa un lector de código de barras.'
    iniciando.value = false
    return
  }
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const lector = new BrowserMultiFormatReader()
    const c = await lector.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      video.value,
      (resultado) => {
        if (!resultado) return
        const codigo = resultado.getText()
        const t = Date.now()
        if (codigo === ultimo.codigo && t - ultimo.t < 2500) return
        ultimo = { codigo, t }
        navigator.vibrate?.(60)
        emit('detectado', codigo)
      },
    )
    if (montado) controles = c
    else c.stop()
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    iniciando.value = false
  }
})

onBeforeUnmount(() => {
  montado = false
  controles?.stop()
})
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl bg-slate-900">
    <video ref="video" class="aspect-[4/3] w-full object-cover sm:aspect-video" muted playsinline />
    <div v-if="!error" class="pointer-events-none absolute inset-x-[12%] top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]">
      <span class="absolute inset-x-3 top-1/2 h-0.5 bg-pink-500/90" />
    </div>
    <p v-if="iniciando" class="absolute inset-0 flex items-center justify-center text-sm text-white/80">Iniciando cámara…</p>
    <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-6 text-center text-sm text-white">
      {{ error }}
    </div>
    <p v-else class="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/90">Ubica el código dentro del recuadro</p>
    <button class="absolute top-3 right-3 rounded-full bg-black/40 p-2 text-white hover:bg-black/60" aria-label="Cerrar cámara" @click="emit('cerrar')">
      <X class="size-4" />
    </button>
  </div>
</template>
