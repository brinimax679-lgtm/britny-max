<script setup>
// RF05 – Lectura de código de barras para identificar productos.
import { computed, nextTick, onMounted, ref } from 'vue'
import { Barcode, ScanBarcode, RefreshCw, Pencil, PackagePlus, Plus, PackageSearch } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BarcodeCamera from '@/components/BarcodeCamera.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useAuthStore } from '@/stores/auth'
import { dinero } from '@/lib/format'
import { estadoStock } from '@/lib/catalogos'

const tienda = useTiendaStore()
const auth = useAuthStore()
const codigo = ref('')
const escrito = ref('')
const camara = ref(false)
const entrada = ref(null)

const producto = computed(() => (codigo.value ? tienda.buscarPorCodigo(codigo.value) : null))

const enfocar = () => nextTick(() => entrada.value?.focus())
onMounted(enfocar)

function leer(valor) {
  const c = String(valor ?? '').trim()
  if (!c) return
  codigo.value = c
  escrito.value = ''
  camara.value = false
  enfocar()
}

function nuevaLectura() {
  codigo.value = ''
  enfocar()
}
</script>

<template>
  <div>
    <PageHeader
      miga="Inventario"
      :icono="Barcode"
      titulo="Lectura de código de barras"
      subtitulo="Utiliza el lector de código de barras para identificar el producto."
    />

    <section class="card mx-auto max-w-3xl overflow-hidden">
      <div class="p-5 sm:p-8">
        <div class="flex gap-2">
          <input
            ref="entrada"
            v-model="escrito"
            class="input py-3 font-mono"
            placeholder="Escanea o escribe el código y presiona Enter"
            inputmode="numeric"
            autocomplete="off"
            enterkeyhint="search"
            aria-label="Código de barras"
            @keydown.enter.prevent="leer(escrito)"
          />
          <button :class="['btn btn-outline px-3.5', camara && 'border-blue-300 bg-blue-50 text-blue-700']" title="Usar la cámara" @click="camara = !camara">
            <ScanBarcode class="size-5" /> <span class="hidden sm:inline">Cámara</span>
          </button>
        </div>

        <BarcodeCamera v-if="camara" class="mt-4" @detectado="leer" @cerrar="camara = false" />

        <button
          v-if="!codigo && !camara"
          type="button"
          class="mt-5 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-blue-200 px-6 py-12 transition hover:bg-blue-50/40"
          @click="enfocar"
        >
          <span class="flex size-24 items-center justify-center rounded-3xl bg-blue-50 ring-8 ring-blue-50/50">
            <Barcode class="size-12 text-blue-600" />
          </span>
          <span class="mt-6 text-xl font-semibold text-slate-900">Esperando lectura…</span>
          <span class="relative mt-4 h-1.5 w-24 overflow-hidden rounded-full bg-blue-100">
            <span class="absolute inset-y-0 left-0 w-10 animate-lectura rounded-full bg-pink-500" />
          </span>
          <span class="mt-5 text-sm text-slate-500">Apunta el lector al código del producto. El campo de arriba debe estar activo.</span>
        </button>
      </div>

      <div v-if="codigo" class="border-t border-slate-100 p-5 sm:p-8">
        <p class="text-center text-sm font-semibold text-slate-500">Código leído</p>
        <p class="mt-1 text-center font-mono text-3xl font-bold tracking-[0.15em] break-all text-slate-900">{{ codigo }}</p>

        <div v-if="producto" class="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-3">
          <div>
            <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Producto</p>
            <p class="mt-1 text-lg font-semibold text-slate-900">{{ producto.nombre }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Categoría</p>
            <p class="mt-1 text-lg font-semibold text-slate-900">{{ tienda.nombreCategoria(producto.categoria_id) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Existencias</p>
            <p class="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
              {{ producto.cantidad }} <StatusBadge :estado="estadoStock(producto)" />
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Precio de compra</p>
            <p class="mt-1 text-lg font-semibold text-slate-900">{{ dinero(producto.precio_compra) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Precio de venta</p>
            <p class="mt-1 text-lg font-semibold text-blue-700">{{ dinero(producto.precio_venta) }}</p>
          </div>
        </div>

        <div v-else class="mt-6 flex flex-col items-center rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <PackageSearch class="size-8 text-amber-500" />
          <p class="mt-3 font-semibold text-slate-900">Este código no está registrado</p>
          <p v-if="auth.puede('inventario.editar')" class="mt-1 text-sm text-slate-600">Puedes registrarlo ahora como un producto nuevo.</p>
          <p v-else class="mt-1 text-sm text-slate-600">Pide a un supervisor que lo registre.</p>
          <RouterLink v-if="auth.puede('inventario.editar')" :to="{ name: 'producto-nuevo', state: { codigo } }" class="btn btn-primary mt-4">
            <Plus class="size-4" /> Registrar producto con este código
          </RouterLink>
        </div>

        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <template v-if="producto">
            <RouterLink v-if="auth.puede('inventario.editar')" :to="{ name: 'producto-editar', state: { productoId: producto.id } }" class="btn btn-outline">
              <Pencil class="size-4" /> Editar
            </RouterLink>
            <RouterLink v-if="auth.puede('inventario.entradas')" :to="{ name: 'entrada', state: { productoId: producto.id } }" class="btn btn-outline">
              <PackagePlus class="size-4" /> Registrar entrada
            </RouterLink>
          </template>
          <button class="btn btn-primary" @click="nuevaLectura"><RefreshCw class="size-4" /> Nueva lectura</button>
        </div>
      </div>
    </section>
  </div>
</template>
