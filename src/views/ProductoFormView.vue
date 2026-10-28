<script setup>
// RF02 – Registro de productos · RF04 – Edición de productos.
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Package, ScanBarcode, Plus, LoaderCircle, PackageX, PackagePlus, ClipboardCheck } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BarcodeCamera from '@/components/BarcodeCamera.vue'
import CategoriasModal from '@/components/CategoriasModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { useValidacion } from '@/composables/useValidacion'
import { dinero, numero } from '@/lib/format'
import { LIMITES, validarProducto } from '@/lib/validaciones'


const tienda = useTiendaStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

// El producto a editar (o el código leído) llega por history.state, nunca por la URL.
const estado = history.state ?? {}
const editando = route.name === 'producto-editar'
const productoId = editando && typeof estado.productoId === 'string' ? estado.productoId : ''
const original = productoId ? tienda.productoPorId[productoId] : null
const noEncontrado = editando && (!original || !original.activo)

const form = reactive({
  nombre: original?.nombre ?? '',
  codigo_barras: original?.codigo_barras ?? (typeof estado.codigo === 'string' ? estado.codigo : ''),
  categoria_id: original?.categoria_id ?? '',
  precio_compra: original?.precio_compra ?? '',
  precio_venta: original?.precio_venta ?? '',
  cantidad: original?.cantidad ?? 0,
  stock_minimo: original?.stock_minimo ?? 5,
})

const { errores, comprobar, desdeError } = useValidacion(form, () =>
  validarProducto({ id: productoId || undefined, ...form }, { productos: tienda.productos, categorias: tienda.categorias }),
)

const guardando = ref(false)
const camara = ref(false)
const verCategorias = ref(false)
const campoCategoria = ref(null)

const margen = computed(() => {
  const compra = Number(form.precio_compra)
  const venta = Number(form.precio_venta)
  return compra > 0 && venta > 0 ? ((venta - compra) / compra) * 100 : null
})

const ayudaId = (campo) => (errores.value[campo] ? `error-${campo}` : undefined)

function codigoLeido(codigo) {
  form.codigo_barras = codigo
  camara.value = false
  campoCategoria.value?.focus()
}

function categoriaCreada(c) {
  form.categoria_id = c.id
  verCategorias.value = false
}

async function guardar() {
  if (!comprobar()) return
  if (margen.value !== null && margen.value < 0) {
    const ok = await ui.confirmar({
      titulo: 'Precio de venta menor al de compra',
      mensaje: `Venderás a ${dinero(form.precio_venta)} un producto que compras a ${dinero(form.precio_compra)}. ¿Deseas guardarlo así?`,
      textoConfirmar: 'Guardar de todos modos',
    })
    if (!ok) return
  }
  guardando.value = true
  try {
    await tienda.guardarProducto({ id: productoId || undefined, ...form })
    ui.exito(productoId ? 'Producto actualizado' : `${form.nombre.trim()} registrado en el inventario`)
    router.push('/productos')
  } catch (e) {
    desdeError(e)
    ui.error(e)
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      miga="Inventario"
      :icono="Package"
      :titulo="productoId ? 'Editar producto' : 'Registrar producto'"
      :subtitulo="productoId ? 'Actualiza la información del producto.' : 'Ingresa la información del nuevo producto.'"
    />

    <section v-if="noEncontrado" class="card max-w-4xl">
      <EmptyState :icono="PackageX" titulo="Producto no encontrado" texto="Es posible que haya sido eliminado del catálogo.">
        <RouterLink to="/productos" class="btn btn-primary">Volver a productos</RouterLink>
      </EmptyState>
    </section>

    <form v-else class="card max-w-4xl" novalidate @submit.prevent="guardar">
      <div class="border-b border-slate-100 px-6 py-6 sm:px-8">
        <h2 class="text-lg font-semibold text-slate-900">Información del producto</h2>
        <p class="mt-1 text-sm text-slate-500">
          {{ productoId ? 'Los cambios se aplican de inmediato al catálogo.' : 'Completa los datos para agregarlo al inventario.' }}
        </p>
      </div>

      <div class="grid gap-x-6 gap-y-5 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <div>
          <label class="label" for="nombre">Nombre del producto</label>
          <input
            id="nombre"
            v-model="form.nombre"
            class="input py-3"
            placeholder="Ingrese el nombre"
            :maxlength="LIMITES.nombreProducto[1]"
            :aria-invalid="Boolean(errores.nombre)"
            :aria-describedby="ayudaId('nombre')"
          />
          <p v-if="errores.nombre" id="error-nombre" class="error-campo">{{ errores.nombre }}</p>
        </div>

        <div>
          <label class="label" for="codigo">Código de barras <span class="font-normal text-slate-400">(opcional)</span></label>
          <div class="flex gap-2">
            <input
              id="codigo"
              v-model.trim="form.codigo_barras"
              class="input py-3 font-mono"
              placeholder="Escanee o ingrese el código"
              inputmode="numeric"
              :maxlength="LIMITES.codigoBarras[1]"
              autocomplete="off"
              :aria-invalid="Boolean(errores.codigo_barras)"
              :aria-describedby="ayudaId('codigo_barras')"
              @keydown.enter.prevent="campoCategoria?.focus()"
            />
            <button type="button" class="btn btn-outline px-3.5" title="Leer con la cámara" @click="camara = !camara">
              <ScanBarcode class="size-5" />
            </button>
          </div>
          <p v-if="errores.codigo_barras" id="error-codigo_barras" class="error-campo">{{ errores.codigo_barras }}</p>
          <p v-else class="ayuda">Con el lector, ubica el cursor aquí y escanea el producto.</p>
        </div>

        <BarcodeCamera v-if="camara" class="sm:col-span-2" @detectado="codigoLeido" @cerrar="camara = false" />

        <div>
          <div class="flex items-center justify-between">
            <label class="label" for="categoria">Categoría</label>
            <button type="button" class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-pink-600 hover:text-pink-700" @click="verCategorias = true">
              <Plus class="size-3.5" /> Nueva categoría
            </button>
          </div>
          <select
            id="categoria"
            ref="campoCategoria"
            v-model="form.categoria_id"
            class="input py-3"
            :aria-invalid="Boolean(errores.categoria_id)"
            :aria-describedby="ayudaId('categoria_id')"
          >
            <option value="" disabled>Seleccione una categoría</option>
            <option v-for="c in tienda.categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <p v-if="errores.categoria_id" id="error-categoria_id" class="error-campo">{{ errores.categoria_id }}</p>
        </div>

        <div>
          <label class="label" for="stock-minimo">Stock mínimo</label>
          <input
            id="stock-minimo"
            v-model="form.stock_minimo"
            type="number"
            min="0"
            :max="LIMITES.stockMinimoMaximo"
            step="1"
            inputmode="numeric"
            class="input py-3"
            :aria-invalid="Boolean(errores.stock_minimo)"
            :aria-describedby="ayudaId('stock_minimo')"
          />
          <p v-if="errores.stock_minimo" id="error-stock_minimo" class="error-campo">{{ errores.stock_minimo }}</p>
          <p v-else class="ayuda">Se mostrará una alerta cuando las existencias lleguen a este nivel.</p>
        </div>

        <div>
          <label class="label" for="precio-compra">Precio de compra</label>
          <div class="relative">
            <span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="precio-compra"
              v-model="form.precio_compra"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              class="input py-3 pl-8"
              placeholder="0"
              :aria-invalid="Boolean(errores.precio_compra)"
              :aria-describedby="ayudaId('precio_compra')"
            />
          </div>
          <p v-if="errores.precio_compra" id="error-precio_compra" class="error-campo">{{ errores.precio_compra }}</p>
        </div>

        <div>
          <label class="label" for="precio-venta">Precio de venta</label>
          <div class="relative">
            <span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="precio-venta"
              v-model="form.precio_venta"
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              class="input py-3 pl-8"
              placeholder="0"
              :aria-invalid="Boolean(errores.precio_venta)"
              :aria-describedby="ayudaId('precio_venta')"
            />
          </div>
          <p v-if="errores.precio_venta" id="error-precio_venta" class="error-campo">{{ errores.precio_venta }}</p>
          <p v-else-if="margen !== null" :class="['mt-1.5 text-xs font-medium', margen < 0 ? 'text-amber-600' : 'text-emerald-600']">
            {{ margen < 0 ? 'Atención: el precio de venta es menor que el de compra' : `Margen de ganancia: ${numero(margen.toFixed(1))} %` }}
          </p>
        </div>

        <div class="sm:col-span-2">
          <label class="label" for="cantidad">{{ productoId ? 'Existencias actuales' : 'Cantidad inicial' }}</label>
          <input
            id="cantidad"
            v-model="form.cantidad"
            type="number"
            min="0"
            :max="LIMITES.cantidadMaxima"
            step="1"
            inputmode="numeric"
            class="input py-3 sm:max-w-xs"
            :disabled="Boolean(productoId)"
            :aria-invalid="Boolean(errores.cantidad)"
            :aria-describedby="ayudaId('cantidad')"
          />
          <p v-if="errores.cantidad" id="error-cantidad" class="error-campo">{{ errores.cantidad }}</p>
          <p v-if="productoId" class="ayuda flex flex-wrap items-center gap-x-3 gap-y-1">
            Para mantener el historial, las existencias se modifican con
            <RouterLink to="/productos/entrada" class="inline-flex items-center gap-1 font-semibold text-blue-600"><PackagePlus class="size-3.5" /> Entrada de mercancía</RouterLink>
            o
            <RouterLink to="/productos/conteo" class="inline-flex items-center gap-1 font-semibold text-blue-600"><ClipboardCheck class="size-3.5" /> Conteo físico</RouterLink>
          </p>
        </div>
      </div>

      <div class="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
        <RouterLink to="/productos" class="btn btn-outline btn-lg">Cancelar</RouterLink>
        <button type="submit" class="btn btn-primary btn-lg" :disabled="guardando">
          <LoaderCircle v-if="guardando" class="size-5 animate-spin" />
          {{ productoId ? 'Guardar cambios' : 'Guardar producto' }}
        </button>
      </div>
    </form>

    <CategoriasModal :abierto="verCategorias" @cerrar="verCategorias = false" @creada="categoriaCreada" />
  </div>
</template>
