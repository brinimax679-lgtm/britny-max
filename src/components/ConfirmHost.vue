<script setup>
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const c = computed(() => ui.confirmacion ?? {})
</script>

<template>
  <BaseModal :abierto="Boolean(ui.confirmacion)" :titulo="c.titulo" ancho="sm:max-w-md" @cerrar="ui.responder(false)">
    <p class="text-slate-600">{{ c.mensaje }}</p>
    <template #pie>
      <button class="btn btn-outline" @click="ui.responder(false)">Cancelar</button>
      <button :class="['btn', c.peligro ? 'btn-danger' : 'btn-primary']" @click="ui.responder(true)">
        {{ c.textoConfirmar }}
      </button>
    </template>
  </BaseModal>
</template>
