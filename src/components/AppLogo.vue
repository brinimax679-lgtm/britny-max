<script setup>
defineProps({
  /** 'menu' para la barra lateral, 'login' para la pantalla de acceso */
  variante: { type: String, default: 'menu' },
})
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="grid size-11 shrink-0 grid-cols-2 gap-1 rounded-xl bg-white/12 p-2.5 ring-1 ring-white/15">
      <span class="rounded-[4px] bg-pink-400" />
      <span class="rounded-[4px] bg-white" />
      <span class="rounded-[4px] bg-white" />
      <span class="rounded-[4px] bg-pink-400" />
    </div>
    <p v-if="variante === 'login'" class="text-2xl font-medium tracking-tight text-white">
      Britny <span class="text-pink-300">Máx</span>
    </p>
    <div v-else class="leading-tight">
      <p class="text-lg font-bold tracking-[0.12em] whitespace-nowrap text-white">BRITNY MAX</p>
      <p class="text-sm font-medium text-blue-300">Gestión de inventario</p>
    </div>
  </div>
</template>
