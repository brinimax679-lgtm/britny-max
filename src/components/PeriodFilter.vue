<script setup>
import { CalendarDays } from 'lucide-vue-next'
import { PRESETS, rangoPreset } from '@/lib/format'

/** { preset, desde, hasta } con fechas 'YYYY-MM-DD' */
const periodo = defineModel({ type: Object, required: true })

function cambiarPreset(preset) {
  periodo.value = preset === 'personalizado' ? { ...periodo.value, preset } : { preset, ...rangoPreset(preset) }
}

function cambiarFecha(campo, valor) {
  periodo.value = { ...periodo.value, preset: 'personalizado', [campo]: valor }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <CalendarDays class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
      <select class="input w-auto py-2 pr-9 pl-10" :value="periodo.preset" aria-label="Periodo" @change="cambiarPreset($event.target.value)">
        <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </div>
    <div class="flex items-center gap-2">
      <input
        type="date"
        class="input w-auto py-2"
        aria-label="Desde"
        :value="periodo.desde"
        :max="periodo.hasta || undefined"
        @change="cambiarFecha('desde', $event.target.value)"
      />
      <span class="text-slate-400">–</span>
      <input
        type="date"
        class="input w-auto py-2"
        aria-label="Hasta"
        :value="periodo.hasta"
        :min="periodo.desde || undefined"
        @change="cambiarFecha('hasta', $event.target.value)"
      />
    </div>
  </div>
</template>
