<script setup>
defineProps({
  miga: { type: String, required: true },
  icono: { type: [Object, Function], default: null },
  titulo: { type: String, required: true },
  subtitulo: { type: String, default: '' },
})
</script>

<template>
  <div class="mb-6 flex flex-col gap-5 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
    <div class="min-w-0">
      <p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-blue-600">
        <component :is="icono" v-if="icono" class="size-4" />
        {{ miga }}
      </p>
      <h1 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{{ titulo }}</h1>
      <p v-if="subtitulo" class="mt-2 text-slate-500">{{ subtitulo }}</p>
    </div>
    <div v-if="$slots.acciones" class="flex flex-wrap gap-3 print:hidden">
      <slot name="acciones" />
    </div>
  </div>
</template>
