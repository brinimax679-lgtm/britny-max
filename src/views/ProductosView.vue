<script setup>
// RF03 – Consulta y búsqueda de productos · RF04 – Edición y eliminación.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Package, Search, Plus, Barcode, Pencil, Trash2, PackagePlus, ClipboardCheck, Tags, FileSpreadsheet, SearchX,
} from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import CategoriasModal from '@/components/CategoriasModal.vue'
import Paginador from '@/components/Paginador.vue'
import { usePaginacion, POR_PAGINA } from '@/composables/usePaginacion'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { dinero, normalizarTexto, hoyISO } from '@/lib/format'
import { estadoStock } from '@/lib/catalogos'
import { exportarCSV } from '@/lib/archivos'

const tienda = useTiendaStore()
const ui = useUiStore()
const auth = useAuthStore()
const router = useRouter()
const puedeEditar = auth.puede('inventario.editar')

/** El producto viaja en el estado del historial: su id nunca aparece en la URL. */
const rutaEditar = (p) => ({ name: 'producto-editar', state: { productoId: p.id } })

const busqueda = ref('')
const categoria = ref('')
const estado = ref('')
const verCategorias = ref(false)

const filtrados = computed(() => {
  const t = normalizarTexto(busqueda.value.trim())
  return tienda.catalogo.filter((p) => {
    if (categoria.value && p.categoria_id !== categoria.value) return false
    if (estado.value && estadoStock(p) !== estado.value) return false
    if (!t) return true
    return (
      normalizarTexto(p.nombre).includes(t) ||
      p.codigo_barras?.includes(t) ||
      normalizarTexto(tienda.nombreCategoria(p.categoria_id)).includes(t)
    )
  })
})

// Paginación de 10 en 10; vuelve a la primera página al cambiar la búsqueda o los filtros.
const { pagina, total, visibles } = usePaginacion(() => filtrados.value, {
  reiniciarCon: () => [busqueda.value, categoria.value, estado.value],
})

function alPresionarEnter() {
  const p = tienda.buscarPorCodigo(busqueda.value)
  if (p && puedeEditar) router.push(rutaEditar(p))
}

async function eliminar(p) {
  const ok = await ui.confirmar({
    titulo: 'Eliminar producto',
    mensaje: `¿Deseas retirar "${p.nombre}" del catálogo? Su historial de ventas y movimientos se conserva.`,
    textoConfirmar: 'Eliminar',
    peligro: true,
  })
  if (!ok) return
  try {
    await tienda.eliminarProducto(p.id)
    ui.exito('Producto eliminado del catálogo')
  } catch (e) {
    ui.error(e)
  }
}

function exportar() {
  exportarCSV(`productos-${hoyISO()}.csv`, [
    { titulo: 'Código de barras', valor: (p) => p.codigo_barras ?? '' },
    { titulo: 'Producto', valor: (p) => p.nombre },
    { titulo: 'Categoría', valor: (p) => tienda.nombreCategoria(p.categoria_id) },
    { titulo: 'Precio de compra', valor: (p) => p.precio_compra },
    { titulo: 'Precio de venta', valor: (p) => p.precio_venta },
    { titulo: 'Cantidad', valor: (p) => p.cantidad },
    { titulo: 'Stock mínimo', valor: (p) => p.stock_minimo },
    { titulo: 'Estado', valor: (p) => ({ disponible: 'Disponible', bajo: 'Stock bajo', agotado: 'Agotado' })[estadoStock(p)] },
  ], filtrados.value)
}
</script>

<template>
  <div>
    <PageHeader miga="Inventario" :icono="Package" titulo="Productos" subtitulo="Consulta y administra los productos registrados.">
      <template #acciones>
        <RouterLink to="/productos/lectura" class="btn btn-outline btn-lg">
          <Barcode class="size-5" /> Leer código de barras
        </RouterLink>
        <RouterLink v-if="puedeEditar" to="/productos/nuevo" class="btn btn-primary btn-lg">
          <Plus class="size-5" /> Registrar producto
        </RouterLink>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap gap-2 print:hidden">
      <RouterLink v-if="auth.puede('inventario.entradas')" to="/productos/entrada" class="btn btn-outline"><PackagePlus class="size-4 text-emerald-600" /> Entrada de mercancía</RouterLink>
      <RouterLink v-if="auth.puede('inventario.conteo')" to="/productos/conteo" class="btn btn-outline"><ClipboardCheck class="size-4 text-violet-600" /> Conteo físico</RouterLink>
      <button v-if="puedeEditar" class="btn btn-outline" @click="verCategorias = true"><Tags class="size-4 text-pink-500" /> Categorías</button>
      <button class="btn btn-outline" @click="exportar"><FileSpreadsheet class="size-4 text-blue-600" /> Exportar a Excel</button>
    </div>

    <section class="card overflow-hidden">
      <div class="flex flex-col gap-3 p-5 sm:p-6 lg:flex-row">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="busqueda"
            type="search"
            class="input py-3 pl-12"
            placeholder="Buscar por nombre, categoría o código"
            aria-label="Buscar productos"
            @keydown.enter="alPresionarEnter"
          />
        </div>
        <div class="grid grid-cols-2 gap-3 lg:flex">
          <select v-model="categoria" class="input py-3 lg:w-48" aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            <option v-for="c in tienda.categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <select v-model="estado" class="input py-3 lg:w-44" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="disponible">Disponible</option>
            <option value="bajo">Stock bajo</option>
            <option value="agotado">Agotado</option>
          </select>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table v-if="filtrados.length" class="tabla min-w-[900px]">
          <thead>
            <tr>
              <th class="pl-6">Código</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th class="text-right">Precio de compra</th>
              <th class="text-right">Precio de venta</th>
              <th class="text-right">Cantidad</th>
              <th>Estado</th>
              <th v-if="puedeEditar" class="pr-6 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in visibles" :key="p.id">
              <td class="pl-6"><span class="codigo">{{ p.codigo_barras || '—' }}</span></td>
              <td class="font-semibold text-slate-900">{{ p.nombre }}</td>
              <td class="text-slate-500">{{ tienda.nombreCategoria(p.categoria_id) }}</td>
              <td class="text-right tabular-nums">{{ dinero(p.precio_compra) }}</td>
              <td class="text-right font-semibold text-slate-900 tabular-nums">{{ dinero(p.precio_venta) }}</td>
              <td class="text-right font-semibold tabular-nums">{{ p.cantidad }}</td>
              <td><StatusBadge :estado="estadoStock(p)" /></td>
              <td v-if="puedeEditar" class="pr-6">
                <div class="flex justify-end gap-2">
                  <RouterLink :to="rutaEditar(p)" class="btn-icon" title="Editar" :aria-label="`Editar ${p.nombre}`">
                    <Pencil class="size-4" />
                  </RouterLink>
                  <button class="btn-icon hover:text-rose-600" title="Eliminar" :aria-label="`Eliminar ${p.nombre}`" @click="eliminar(p)">
                    <Trash2 class="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState
          v-else-if="tienda.catalogo.length"
          :icono="SearchX"
          titulo="Sin resultados"
          texto="No hay productos que coincidan con la búsqueda o los filtros."
        />
        <EmptyState v-else :icono="Package" titulo="Aún no hay productos" texto="Registra el primer producto para empezar a controlar el inventario.">
          <RouterLink v-if="puedeEditar" to="/productos/nuevo" class="btn btn-primary"><Plus class="size-4" /> Registrar producto</RouterLink>
        </EmptyState>
      </div>

      <Paginador v-model="pagina" :total="total" />
      <div v-if="total <= POR_PAGINA" class="flex justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
        <span>Mostrando {{ filtrados.length }} producto(s)</span>
        <span>{{ tienda.catalogo.length }} registros en total</span>
      </div>
    </section>

    <CategoriasModal :abierto="verCategorias" @cerrar="verCategorias = false" />
  </div>
</template>
