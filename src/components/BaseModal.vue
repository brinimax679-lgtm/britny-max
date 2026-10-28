<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  abierto: Boolean,
  titulo: { type: String, default: '' },
  subtitulo: { type: String, default: '' },
  ancho: { type: String, default: 'sm:max-w-lg' },
})
const emit = defineEmits(['cerrar'])

function tecla(e) {
  if (e.key === 'Escape' && props.abierto) emit('cerrar')
}
onMounted(() => window.addEventListener('keydown', tecla))
onBeforeUnmount(() => window.removeEventListener('keydown', tecla))
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-150" leave-active-class="pointer-events-none transition duration-150">
      <div
        v-if="abierto"
        class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
        @mousedown.self="emit('cerrar')"
      >
        <div role="dialog" aria-modal="true" :aria-label="titulo" :class="['flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', ancho]">
          <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">{{ titulo }}</h2>
              <p v-if="subtitulo" class="mt-0.5 text-sm text-slate-500">{{ subtitulo }}</p>
            </div>
            <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar" @click="emit('cerrar')">
              <X class="size-5" />
            </button>
          </div>
          <div class="overflow-y-auto px-6 py-5">
            <slot />
          </div>
          <div v-if="$slots.pie" class="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <slot name="pie" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
