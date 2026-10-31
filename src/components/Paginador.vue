<script setup>
// Controles de paginación: «Mostrando 1–10 de 18» y botones de página.
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Number, required: true },
  total: { type: Number, required: true },
  porPagina: { type: Number, default: 10 },
})
const emit = defineEmits(['update:modelValue'])

const paginas = computed(() => Math.max(1, Math.ceil(props.total / props.porPagina)))
const desde = computed(() => (props.total ? (props.modelValue - 1) * props.porPagina + 1 : 0))
const hasta = computed(() => Math.min(props.total, props.modelValue * props.porPagina))

/** Números visibles: primera, última y las vecinas de la actual, con «…» en los saltos. */
const botones = computed(() => {
  const n = paginas.value
  const actual = props.modelValue
  const set = new Set([1, n, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= n))
  const lista = [...set].sort((a, b) => a - b)
  const salida = []
  lista.forEach((p, i) => {
    if (i && p - lista[i - 1] > 1) salida.push('…' + p)
    salida.push(p)
  })
  return salida
})

const ir = (p) => emit('update:modelValue', Math.min(Math.max(1, p), paginas.value))
</script>

<template>
  <nav
    v-if="total > porPagina"
    class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6 print:hidden"
    aria-label="Paginación"
  >
    <p class="text-sm text-slate-500">
      Mostrando <b class="text-slate-700">{{ desde }}–{{ hasta }}</b> de <b class="text-slate-700">{{ total }}</b>
    </p>
    <div class="flex items-center gap-1.5">
      <button class="btn-icon size-9" :disabled="modelValue <= 1" aria-label="Página anterior" @click="ir(modelValue - 1)">
        <ChevronLeft class="size-4" />
      </button>
      <template v-for="b in botones" :key="b">
        <span v-if="typeof b === 'string'" class="px-1.5 text-sm text-slate-400">…</span>
        <button
          v-else
          :class="[
            'min-w-9 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition',
            b === modelValue ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100',
          ]"
          :aria-current="b === modelValue ? 'page' : undefined"
          :aria-label="`Página ${b}`"
          @click="ir(b)"
        >
          {{ b }}
        </button>
      </template>
      <button class="btn-icon size-9" :disabled="modelValue >= paginas" aria-label="Página siguiente" @click="ir(modelValue + 1)">
        <ChevronRight class="size-4" />
      </button>
    </div>
  </nav>
</template>
