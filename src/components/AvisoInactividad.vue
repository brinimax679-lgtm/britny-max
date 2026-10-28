<script setup>
import { TimerReset } from 'lucide-vue-next'
import { MINUTOS_INACTIVIDAD } from '@/lib/inactividad'

defineProps({
  abierto: Boolean,
  segundos: { type: Number, default: 0 },
})
const emit = defineEmits(['seguir', 'salir'])
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-150" leave-active-class="pointer-events-none transition duration-150">
      <div v-if="abierto" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm print:hidden">
        <div role="alertdialog" aria-modal="true" aria-labelledby="titulo-inactividad" aria-describedby="texto-inactividad" class="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
          <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <TimerReset class="size-7" />
          </span>
          <h2 id="titulo-inactividad" class="mt-4 text-lg font-semibold text-slate-900">¿Sigues ahí?</h2>
          <p id="texto-inactividad" class="mt-2 text-sm text-slate-600">
            Por seguridad, la sesión se cierra tras {{ MINUTOS_INACTIVIDAD }} minutos sin actividad.
          </p>
          <p class="mt-4 text-4xl font-bold text-slate-900 tabular-nums" aria-live="polite">{{ segundos }} s</p>
          <div class="mt-6 grid gap-3 sm:grid-cols-2">
            <button class="btn btn-outline" @click="emit('salir')">Cerrar sesión</button>
            <button class="btn btn-primary" autofocus @click="emit('seguir')">Seguir conectado</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
