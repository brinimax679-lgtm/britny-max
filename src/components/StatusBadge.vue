<script setup>
import { computed } from 'vue'

const props = defineProps({
  estado: { type: String, required: true },
  texto: { type: String, default: '' },
})

const estilos = {
  disponible: ['bg-emerald-50 text-emerald-600', 'Disponible'],
  bajo: ['bg-amber-50 text-amber-600', 'Stock bajo'],
  agotado: ['bg-rose-50 text-rose-600', 'Agotado'],
  ingreso: ['bg-emerald-50 text-emerald-600', 'Ingreso'],
  egreso: ['bg-amber-50 text-amber-600', 'Egreso'],
  registrada: ['bg-blue-50 text-blue-600', 'Registrada'],
  anulada: ['bg-slate-100 text-slate-500', 'Anulada'],
  entrada: ['bg-emerald-50 text-emerald-600', 'Entrada'],
  salida: ['bg-blue-50 text-blue-600', 'Salida'],
  ajuste: ['bg-violet-50 text-violet-600', 'Ajuste'],
}
const estilo = computed(() => estilos[props.estado] ?? ['bg-slate-100 text-slate-600', props.estado])
</script>

<template>
  <span :class="['badge', estilo[0]]">{{ texto || estilo[1] }}</span>
</template>
