<script setup>
// RF07 – Registro de salidas por venta (actualiza existencias y genera el ingreso).
import { computed, ref } from 'vue'
import { ShoppingCart, Package, Minus, Plus, Trash2, History, LoaderCircle } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { dinero, hoyISO, parseFecha } from '@/lib/format'

const tienda = useTiendaStore()
const ui = useUiStore()

const items = ref([])
const fecha = ref(hoyISO())
const pagaCon = ref('')
const guardando = ref(false)
const buscador = ref(null)

const total = computed(() => items.value.reduce((s, it) => s + it.cantidad * it.precio, 0))
const unidades = computed(() => items.value.reduce((s, it) => s + it.cantidad, 0))
const cambio = computed(() => (Number(pagaCon.value) > 0 ? Number(pagaCon.value) - total.value : null))

function agregar(p) {
  const existente = items.value.find((it) => it.producto.id === p.id)
  if (existente) return cambiarCantidad(existente, existente.cantidad + 1)
  items.value.push({ producto: p, cantidad: 1, precio: p.precio_venta })
}

function cambiarCantidad(it, valor) {
  const n = Math.floor(Number(valor) || 0)
  if (n > it.producto.cantidad) {
    ui.error(`Solo hay ${it.producto.cantidad} unidad(es) de ${it.producto.nombre}`)
    it.cantidad = it.producto.cantidad
    return
  }
  it.cantidad = Math.max(n, 1)
}

function quitar(it) {
  items.value = items.value.filter((x) => x !== it)
}

function cancelar() {
  items.value = []
  pagaCon.value = ''
  fecha.value = hoyISO()
  buscador.value?.enfocar()
}

/** Ventas de hoy usan la hora actual; ventas atrasadas se registran al mediodía del día elegido. */
function fechaVenta() {
  if (fecha.value === hoyISO()) return new Date().toISOString()
  const d = parseFecha(fecha.value)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

async function registrar() {
  guardando.value = true
  try {
    const t = total.value
    await tienda.registrarVenta({
      fecha: fechaVenta(),
      items: items.value.map((it) => ({ producto_id: it.producto.id, cantidad: it.cantidad, precio_unitario: it.precio })),
    })
    ui.exito(`Venta registrada por ${dinero(t)}`)
    cancelar()
  } catch (e) {
    ui.error(e)
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader miga="Ventas" :icono="ShoppingCart" titulo="Registrar salida por venta" subtitulo="Registra los productos correspondientes a una venta.">
      <template #acciones>
        <RouterLink to="/ventas/historial" class="btn btn-outline btn-lg"><History class="size-5" /> Historial de ventas</RouterLink>
      </template>
    </PageHeader>

    <section class="card overflow-visible">
      <div class="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_200px] lg:items-end">
        <div>
          <p class="label">Agregar producto</p>
          <ProductPicker ref="buscador" solo-con-stock @elegir="agregar" />
        </div>
        <div>
          <label class="label" for="fecha-venta">Fecha de la venta</label>
          <input id="fecha-venta" v-model="fecha" type="date" class="input py-3" :max="hoyISO()" />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table v-if="items.length" class="tabla min-w-[640px]">
          <thead>
            <tr>
              <th class="pl-6">Producto</th>
              <th class="text-center">Cantidad</th>
              <th class="text-right">Precio</th>
              <th class="text-right">Subtotal</th>
              <th class="w-12 pr-6"><span class="sr-only">Quitar</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in items" :key="it.producto.id">
              <td class="pl-6">
                <div class="flex items-center gap-3">
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Package class="size-5" /></span>
                  <div>
                    <p class="min-w-40 font-semibold text-slate-900">{{ it.producto.nombre }}</p>
                    <p class="text-xs text-slate-500">{{ tienda.nombreCategoria(it.producto.categoria_id) }} · {{ it.producto.cantidad }} disponibles</p>
                  </div>
                </div>
              </td>
              <td>
                <div class="flex items-center justify-center gap-1.5">
                  <button class="btn-icon size-8" aria-label="Restar" :disabled="it.cantidad <= 1" @click="cambiarCantidad(it, it.cantidad - 1)"><Minus class="size-4" /></button>
                  <input
                    :value="it.cantidad"
                    type="number"
                    min="1"
                    :max="it.producto.cantidad"
                    inputmode="numeric"
                    class="input w-16 px-2 py-1.5 text-center font-semibold"
                    :aria-label="`Cantidad de ${it.producto.nombre}`"
                    @change="cambiarCantidad(it, $event.target.value); $event.target.value = it.cantidad"
                  />
                  <button class="btn-icon size-8" aria-label="Sumar" @click="cambiarCantidad(it, it.cantidad + 1)"><Plus class="size-4" /></button>
                </div>
              </td>
              <td class="text-right tabular-nums">{{ dinero(it.precio) }}</td>
              <td class="text-right font-semibold text-slate-900 tabular-nums">{{ dinero(it.cantidad * it.precio) }}</td>
              <td class="pr-6">
                <button class="btn-icon border-0 hover:text-rose-600" :aria-label="`Quitar ${it.producto.nombre}`" @click="quitar(it)"><Trash2 class="size-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState
          v-else
          :icono="ShoppingCart"
          titulo="La venta está vacía"
          texto="Escanea un código de barras o busca el producto por nombre para agregarlo."
        />
      </div>

      <div v-if="items.length" class="flex flex-col gap-5 border-t border-slate-100 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <label class="label" for="paga-con">Paga con</label>
            <div class="relative">
              <span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input id="paga-con" v-model="pagaCon" type="number" min="0" inputmode="numeric" class="input w-40 pl-8" placeholder="Opcional" />
            </div>
          </div>
          <p v-if="cambio !== null" :class="['pb-2.5 text-sm font-semibold', cambio < 0 ? 'text-rose-600' : 'text-emerald-600']">
            {{ cambio < 0 ? `Faltan ${dinero(-cambio)}` : `Cambio: ${dinero(cambio)}` }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-sm font-medium text-slate-600">Total</p>
          <p class="text-xs text-slate-500">{{ unidades }} unidades · {{ items.length }} productos</p>
          <p class="mt-1 text-4xl font-bold tracking-tight text-slate-900 tabular-nums">{{ dinero(total) }}</p>
        </div>
      </div>
    </section>

    <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button class="btn btn-outline btn-lg" :disabled="!items.length || guardando" @click="cancelar">Cancelar</button>
      <button class="btn btn-primary btn-lg" :disabled="!items.length || guardando" @click="registrar">
        <LoaderCircle v-if="guardando" class="size-5 animate-spin" />
        <ShoppingCart v-else class="size-5" />
        Registrar venta
      </button>
    </div>
  </div>
</template>
