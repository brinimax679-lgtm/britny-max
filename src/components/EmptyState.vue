<script setup>
defineProps({
  icono: { type: [Object, Function], required: true },
  titulo: { type: String, required: true },
  texto: { type: String, default: '' },
})
</script>

<template>
  <div class="flex flex-col items-center px-6 py-12 text-center">
    <span class="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      <component :is="icono" class="size-7" />
    </span>
    <p class="mt-4 font-semibold text-slate-800">{{ titulo }}</p>
    <p v-if="texto" class="mt-1 max-w-sm text-sm text-slate-500">{{ texto }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>
