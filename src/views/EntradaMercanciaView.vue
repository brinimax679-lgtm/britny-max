<script setup>
// Control de entradas de mercancía: suma existencias y, opcionalmente,
// registra el egreso por compra de mercancía (RF11).
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PackagePlus, Package, Trash2, LoaderCircle } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { dinero, hoyISO, parseFecha } from '@/lib/format'
import { LIMITES, reglaDinero, reglaEntero, reglaTexto } from '@/lib/validaciones'

const tienda = useTiendaStore()
const ui = useUiStore()
const router = useRouter()

const items = ref([])
const fecha = ref(hoyISO())
const concepto = ref('')
const registrarEgreso = ref(true)
const actualizarPrecio = ref(true)
const guardando = ref(false)

const total = computed(() => items.value.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.costo) || 0), 0))

const erroresItem = (it) => ({
  cantidad: reglaEntero(it.cantidad, `la cantidad de ${it.producto.nombre}`, { min: 1 }),
  costo: reglaDinero(it.costo === '' ? 0 : it.costo, `el costo de ${it.producto.nombre}`),
})
const primerError = computed(() => {
  for (const it of items.value) {
    const e = erroresItem(it)
    if (e.cantidad || e.costo) return e.cantidad || e.costo
  }
  return reglaTexto(concepto.value, 'el concepto', [0, LIMITES.conceptoEntrada], { requerido: false })
})

function agregar(p) {
  const existente = items.value.find((it) => it.producto.id === p.id)
  if (existente) existente.cantidad = (Number(existente.cantidad) || 0) + 1
  else items.value.push({ producto: p, cantidad: 1, costo: p.precio_compra })
}

onMounted(() => {
  // Producto preseleccionado desde la lectura de código (por history.state, no por URL).
  const p = tienda.productoPorId[history.state?.productoId]
  if (p?.activo) agregar(p)
})

function fechaEntrada() {
  if (fecha.value === hoyISO()) return new Date().toISOString()
  const d = parseFecha(fecha.value)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

async function guardar() {
  if (primerError.value) {
    document.querySelector('[aria-invalid="true"]')?.focus()
    return ui.error(primerError.value)
  }
  guardando.value = true
  try {
    await tienda.registrarEntrada({
      fecha: fechaEntrada(),
      concepto: concepto.value,
      registrarEgreso: registrarEgreso.value,
      actualizarPrecio: actualizarPrecio.value,
      items: items.value.map((it) => ({
        producto_id: it.producto.id,
        cantidad: Number(it.cantidad),
        costo_unitario: Number(it.costo) || 0,
      })),
    })
    ui.exito(registrarEgreso.value && total.value > 0 ? `Entrada registrada y egreso de ${dinero(total.value)} agregado` : 'Entrada de mercancía registrada')
    router.push('/productos')
  } catch (e) {
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
      :icono="PackagePlus"
      titulo="Entrada de mercancía"
      subtitulo="Registra los productos que llegan del proveedor para actualizar las existencias."
    />

    <section class="card overflow-visible">
      <div class="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_1fr_200px]">
        <div class="lg:col-span-3">
          <p class="label">Agregar producto</p>
          <ProductPicker @elegir="agregar" />
        </div>
        <div class="lg:col-span-2">
          <label class="label" for="concepto">Proveedor o concepto</label>
          <input id="concepto" v-model="concepto" class="input py-3" placeholder="Ej.: Compra semanal a Distribuidora El Llano" :maxlength="LIMITES.conceptoEntrada" />
        </div>
        <div>
          <label class="label" for="fecha-entrada">Fecha</label>
          <input id="fecha-entrada" v-model="fecha" type="date" class="input py-3" :min="LIMITES.fechaMinima" :max="hoyISO()" />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table v-if="items.length" class="tabla min-w-[720px]">
          <thead>
            <tr>
              <th class="pl-6">Producto</th>
              <th class="text-right">Existencias</th>
              <th class="text-center">Cantidad que entra</th>
              <th class="text-center">Costo unitario</th>
              <th class="text-right">Subtotal</th>
              <th class="w-12 pr-6"><span class="sr-only">Quitar</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in items" :key="it.producto.id">
              <td class="pl-6">
                <div class="flex items-center gap-3">
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Package class="size-5" /></span>
                  <div>
                    <p class="min-w-40 font-semibold text-slate-900">{{ it.producto.nombre }}</p>
                    <p class="text-xs text-slate-500">{{ tienda.nombreCategoria(it.producto.categoria_id) }}</p>
                  </div>
                </div>
              </td>
              <td class="text-right text-slate-500 tabular-nums">
                {{ it.producto.cantidad }} → <span class="font-semibold text-emerald-600">{{ it.producto.cantidad + (Number(it.cantidad) || 0) }}</span>
              </td>
              <td class="text-center">
                <input
                  v-model="it.cantidad"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  class="input mx-auto w-20 px-2 py-2 text-center font-semibold"
                  :aria-label="`Cantidad de ${it.producto.nombre}`"
                  :aria-invalid="Boolean(erroresItem(it).cantidad)"
                  :title="erroresItem(it).cantidad || undefined"
                />
              </td>
              <td class="text-center">
                <input
                  v-model="it.costo"
                  type="number"
                  min="0"
                  step="any"
                  inputmode="decimal"
                  class="input mx-auto w-28 px-3 py-2 text-right"
                  :aria-label="`Costo de ${it.producto.nombre}`"
                  :aria-invalid="Boolean(erroresItem(it).costo)"
                  :title="erroresItem(it).costo || undefined"
                />
              </td>
              <td class="text-right font-semibold tabular-nums">{{ dinero((Number(it.cantidad) || 0) * (Number(it.costo) || 0)) }}</td>
              <td class="pr-6">
                <button class="btn-icon border-0 hover:text-rose-600" :aria-label="`Quitar ${it.producto.nombre}`" @click="items = items.filter((x) => x !== it)">
                  <Trash2 class="size-4" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else :icono="PackagePlus" titulo="Sin productos" texto="Escanea o busca los productos que llegaron para agregarlos a la entrada." />
      </div>
      <p v-if="items.length && primerError" class="border-t border-rose-100 bg-rose-50 px-6 py-3 text-sm font-medium text-rose-600" role="alert">
        {{ primerError }}
      </p>

      <div v-if="items.length" class="flex flex-col gap-5 border-t border-slate-100 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-3 text-sm text-slate-700">
          <label class="flex cursor-pointer items-start gap-3">
            <input v-model="registrarEgreso" type="checkbox" class="mt-0.5 size-4 accent-blue-600" />
            <span>Registrar como egreso <strong>(compra de mercancía)</strong></span>
          </label>
          <label class="flex cursor-pointer items-start gap-3">
            <input v-model="actualizarPrecio" type="checkbox" class="mt-0.5 size-4 accent-blue-600" />
            <span>Actualizar el precio de compra de los productos con el nuevo costo</span>
          </label>
        </div>
        <div class="text-right">
          <p class="text-sm font-medium text-slate-600">Total de la compra</p>
          <p class="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{{ dinero(total) }}</p>
        </div>
      </div>
    </section>

    <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <RouterLink to="/productos" class="btn btn-outline btn-lg">Cancelar</RouterLink>
      <button class="btn btn-primary btn-lg" :disabled="!items.length || guardando" @click="guardar">
        <LoaderCircle v-if="guardando" class="size-5 animate-spin" />
        <PackagePlus v-else class="size-5" />
        Registrar entrada
      </button>
    </div>
  </div>
</template>
