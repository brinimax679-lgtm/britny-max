<script setup>
// Administración de categorías (clase Categoria del diagrama de clases).
import { computed, reactive, ref } from 'vue'
import { Pencil, Trash2, Plus, Tags } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { useValidacion } from '@/composables/useValidacion'
import { LIMITES, validarCategoria } from '@/lib/validaciones'

defineProps({ abierto: Boolean })
const emit = defineEmits(['cerrar', 'creada'])

const tienda = useTiendaStore()
const ui = useUiStore()
const form = reactive({ id: null, nombre: '', descripcion: '' })
const guardando = ref(false)
const { errores, comprobar, desdeError, reiniciar } = useValidacion(form, () => validarCategoria(form, { categorias: tienda.categorias }))

const conteo = computed(() => {
  const m = {}
  for (const p of tienda.catalogo) m[p.categoria_id] = (m[p.categoria_id] ?? 0) + 1
  return m
})

function editar(c) {
  Object.assign(form, { id: c.id, nombre: c.nombre, descripcion: c.descripcion ?? '' })
  reiniciar()
}

function limpiar() {
  Object.assign(form, { id: null, nombre: '', descripcion: '' })
  reiniciar()
}

async function guardar() {
  if (!comprobar()) return
  guardando.value = true
  try {
    const nueva = !form.id
    const categoria = await tienda.guardarCategoria({ ...form })
    ui.exito(nueva ? 'Categoría registrada' : 'Categoría actualizada')
    if (nueva) emit('creada', categoria)
    limpiar()
  } catch (e) {
    desdeError(e)
    ui.error(e)
  } finally {
    guardando.value = false
  }
}

async function eliminar(c) {
  const ok = await ui.confirmar({
    titulo: 'Eliminar categoría',
    mensaje: `¿Deseas eliminar la categoría "${c.nombre}"?`,
    textoConfirmar: 'Eliminar',
    peligro: true,
  })
  if (!ok) return
  try {
    await tienda.eliminarCategoria(c.id)
    if (form.id === c.id) limpiar()
    ui.exito('Categoría eliminada')
  } catch (e) {
    ui.error(e)
  }
}
</script>

<template>
  <BaseModal :abierto="abierto" titulo="Categorías" subtitulo="Organiza los productos por tipo." ancho="sm:max-w-xl" @cerrar="emit('cerrar')">
    <form class="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start" novalidate @submit.prevent="guardar">
      <div>
        <label class="label" for="cat-nombre">Nombre</label>
        <input
          id="cat-nombre"
          v-model="form.nombre"
          class="input bg-white"
          placeholder="Ej.: Lácteos"
          :maxlength="LIMITES.nombreCategoria[1]"
          :aria-invalid="Boolean(errores.nombre)"
          :aria-describedby="errores.nombre ? 'error-cat-nombre' : undefined"
        />
        <p v-if="errores.nombre" id="error-cat-nombre" class="error-campo">{{ errores.nombre }}</p>
      </div>
      <div>
        <label class="label" for="cat-desc">Descripción</label>
        <input
          id="cat-desc"
          v-model="form.descripcion"
          class="input bg-white"
          placeholder="Opcional"
          :maxlength="LIMITES.descripcionCategoria"
          :aria-invalid="Boolean(errores.descripcion)"
        />
        <p v-if="errores.descripcion" class="error-campo">{{ errores.descripcion }}</p>
      </div>
      <div class="flex gap-2 sm:pt-7">
        <button v-if="form.id" type="button" class="btn btn-outline" @click="limpiar">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="guardando">
          <Plus v-if="!form.id" class="size-4" />
          {{ form.id ? 'Guardar' : 'Agregar' }}
        </button>
      </div>
    </form>

    <ul class="mt-4 divide-y divide-slate-100">
      <li v-for="c in tienda.categorias" :key="c.id" class="flex items-center gap-3 py-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-500">
          <Tags class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-800">{{ c.nombre }}</p>
          <p class="truncate text-xs text-slate-500">
            {{ conteo[c.id] ?? 0 }} producto(s){{ c.descripcion ? ` · ${c.descripcion}` : '' }}
          </p>
        </div>
        <button class="btn-icon" title="Editar" @click="editar(c)"><Pencil class="size-4" /></button>
        <button class="btn-icon hover:text-rose-600" title="Eliminar" @click="eliminar(c)"><Trash2 class="size-4" /></button>
      </li>
      <li v-if="!tienda.categorias.length" class="py-6 text-center text-sm text-slate-500">Aún no hay categorías.</li>
    </ul>
  </BaseModal>
</template>
