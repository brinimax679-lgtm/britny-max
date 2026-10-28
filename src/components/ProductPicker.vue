<script setup>
// Buscador de productos por nombre, categoría o código de barras (RF03 / RF05).
// Un lector de código de barras escribe el código y envía Enter: si coincide
// exactamente con un producto, se agrega de inmediato.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Search, ScanBarcode, Package } from 'lucide-vue-next'
import BarcodeCamera from './BarcodeCamera.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { dinero, normalizarTexto } from '@/lib/format'

const props = defineProps({
  placeholder: { type: String, default: 'Buscar producto o ingresar código' },
  /** Impide elegir productos sin existencias (ventas). */
  soloConStock: Boolean,
  autoenfocar: { type: Boolean, default: true },
})
const emit = defineEmits(['elegir'])

const tienda = useTiendaStore()
const ui = useUiStore()
const texto = ref('')
const abierto = ref(false)
const resaltado = ref(0)
const camara = ref(false)
const entrada = ref(null)

const resultados = computed(() => {
  const t = normalizarTexto(texto.value.trim())
  if (!t) return []
  return tienda.catalogo
    .filter(
      (p) =>
        normalizarTexto(p.nombre).includes(t) ||
        p.codigo_barras?.includes(t) ||
        normalizarTexto(tienda.nombreCategoria(p.categoria_id)).includes(t),
    )
    .slice(0, 8)
})

watch(texto, () => {
  resaltado.value = 0
  abierto.value = true
})

onMounted(() => {
  if (props.autoenfocar && window.matchMedia('(pointer: fine)').matches) entrada.value?.focus()
})

function elegir(p) {
  if (props.soloConStock && p.cantidad <= 0) {
    ui.error(`${p.nombre} está agotado`)
    return
  }
  emit('elegir', p)
  texto.value = ''
  abierto.value = false
  nextTick(() => entrada.value?.focus())
}

function alPresionarEnter() {
  const t = texto.value.trim()
  if (!t) return
  const exacto = tienda.buscarPorCodigo(t)
  if (exacto) return elegir(exacto)
  if (resultados.value.length) return elegir(resultados.value[resaltado.value])
  ui.error(`No se encontró ningún producto con "${t}"`)
}

function mover(paso) {
  const n = resultados.value.length
  if (n) resaltado.value = (resaltado.value + paso + n) % n
}

function alDetectar(codigo) {
  const p = tienda.buscarPorCodigo(codigo)
  if (!p) return ui.error(`El código ${codigo} no está registrado`)
  elegir(p)
  ui.exito(`${p.nombre} agregado`)
}

defineExpose({ enfocar: () => entrada.value?.focus() })
</script>

<template>
  <div>
    <div class="flex gap-2">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
        <input
          ref="entrada"
          v-model="texto"
          type="search"
          class="input py-3 pl-12"
          :placeholder="placeholder"
          autocomplete="off"
          enterkeyhint="search"
          aria-label="Buscar producto"
          @keydown.enter.prevent="alPresionarEnter"
          @keydown.down.prevent="mover(1)"
          @keydown.up.prevent="mover(-1)"
          @keydown.esc="abierto = false"
          @focus="abierto = true"
          @blur="abierto = false"
        />
        <ul
          v-if="abierto && resultados.length"
          class="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          <li v-for="(p, i) in resultados" :key="p.id">
            <button
              type="button"
              :class="['flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === resaltado ? 'bg-blue-50' : 'hover:bg-slate-50']"
              @mousedown.prevent="elegir(p)"
              @mousemove="resaltado = i"
            >
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Package class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-slate-800">{{ p.nombre }}</span>
                <span class="block truncate text-xs text-slate-500">
                  {{ tienda.nombreCategoria(p.categoria_id) }} · {{ p.codigo_barras || 'sin código' }}
                </span>
              </span>
              <span class="text-right">
                <span class="block text-sm font-semibold text-slate-800">{{ dinero(p.precio_venta) }}</span>
                <span :class="['block text-xs', p.cantidad > 0 ? 'text-slate-500' : 'font-semibold text-rose-500']">
                  {{ p.cantidad > 0 ? `${p.cantidad} disp.` : 'Agotado' }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <button
        type="button"
        :class="['btn btn-outline px-3.5', camara && 'border-blue-300 bg-blue-50 text-blue-700']"
        title="Leer código con la cámara"
        @click="camara = !camara"
      >
        <ScanBarcode class="size-5" />
        <span class="hidden sm:inline">Cámara</span>
      </button>
    </div>
    <BarcodeCamera v-if="camara" class="mt-3" @detectado="alDetectar" @cerrar="camara = false" />
  </div>
</template>
