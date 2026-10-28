<script setup>
import { CircleCheck, CircleAlert, Info, X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const iconos = { exito: CircleCheck, error: CircleAlert, info: Info }
const colores = { exito: 'text-emerald-500', error: 'text-rose-500', info: 'text-blue-500' }
</script>

<template>
  <div class="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96 print:hidden" aria-live="polite">
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200"
      leave-active-class="pointer-events-none transition duration-150"
    >
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10"
        :role="t.tipo === 'error' ? 'alert' : 'status'"
      >
        <component :is="iconos[t.tipo]" :class="['mt-0.5 size-5 shrink-0', colores[t.tipo]]" />
        <p class="flex-1 text-sm text-slate-700">{{ t.mensaje }}</p>
        <button class="text-slate-400 hover:text-slate-700" aria-label="Cerrar" @click="ui.cerrarToast(t.id)">
          <X class="size-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
