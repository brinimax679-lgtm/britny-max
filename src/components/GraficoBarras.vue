<script setup>
// Barras horizontales de una sola serie (ranking o distribución por tipo).
// Barra ≤ 16 px, extremo de datos redondeado, valor al final de la barra.
import { computed } from 'vue'

const props = defineProps({
  /** [{ etiqueta, valor, detalle? }] */
  filas: { type: Array, required: true },
  formato: { type: Function, default: (v) => String(v) },
  color: { type: String, default: '#2a78d6' },
})

const maximo = computed(() => Math.max(0, ...props.filas.map((f) => f.valor)) || 1)
</script>

<template>
  <ul class="space-y-3.5">
    <li v-for="f in filas" :key="f.etiqueta" class="group" :title="`${f.etiqueta}: ${formato(f.valor)}`">
      <div class="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span class="truncate font-medium text-slate-700">{{ f.etiqueta }}</span>
        <span v-if="f.detalle" class="shrink-0 text-xs text-slate-400">{{ f.detalle }}</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="h-3.5 flex-1">
          <div
            class="h-full rounded-r-[4px] transition-opacity group-hover:opacity-80"
            :style="{ width: `${Math.max((f.valor / maximo) * 100, f.valor > 0 ? 1 : 0)}%`, background: color }"
          />
        </div>
        <span class="w-24 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">{{ formato(f.valor) }}</span>
      </div>
    </li>
  </ul>
</template>
