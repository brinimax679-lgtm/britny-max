<script setup>
// Consulta de ventas registradas y anulación (devuelve las existencias y retira el ingreso).
import { computed, ref } from 'vue'
import { History, ShoppingCart, ChevronDown, Ban, Receipt } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import PeriodFilter from '@/components/PeriodFilter.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import KpiCard from '@/components/KpiCard.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { dinero, numero, fechaCorta, hora, enRango, periodoInicial } from '@/lib/format'

const tienda = useTiendaStore()
const ui = useUiStore()
const auth = useAuthStore()
const periodo = ref(periodoInicial('7d'))
const abierta = ref(null)

const ventas = computed(() => tienda.ventas.filter((v) => enRango(v.fecha, periodo.value)))
const validas = computed(() => ventas.value.filter((v) => v.estado !== 'anulada'))
const total = computed(() => validas.value.reduce((s, v) => s + v.total, 0))
const promedio = computed(() => (validas.value.length ? total.value / validas.value.length : 0))

const unidades = (v) => v.detalles.reduce((s, d) => s + d.cantidad, 0)

async function anular(v) {
  const ok = await ui.confirmar({
    titulo: 'Anular venta',
    mensaje: `Se devolverán ${unidades(v)} unidad(es) al inventario y se retirará el ingreso de ${dinero(v.total)}. ¿Deseas continuar?`,
    textoConfirmar: 'Anular venta',
    peligro: true,
  })
  if (!ok) return
  try {
    await tienda.anularVenta(v.id)
    ui.exito('Venta anulada y existencias restablecidas')
  } catch (e) {
    ui.error(e)
  }
}
</script>

<template>
  <div>
    <PageHeader miga="Ventas" :icono="History" titulo="Historial de ventas" subtitulo="Consulta las ventas registradas y su detalle.">
      <template #acciones>
        <RouterLink v-if="auth.puede('ventas.registrar')" to="/ventas" class="btn btn-primary btn-lg"><ShoppingCart class="size-5" /> Nueva venta</RouterLink>
      </template>
    </PageHeader>

    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <KpiCard titulo="Total vendido" :valor="dinero(total)" :icono="ShoppingCart" color="blue" />
      <KpiCard titulo="Ventas registradas" :valor="numero(validas.length)" :icono="Receipt" color="emerald" />
      <KpiCard titulo="Venta promedio" :valor="dinero(promedio)" :icono="History" color="violet" />
    </div>

    <section class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <h2 class="text-lg font-semibold text-slate-900">Ventas del periodo</h2>
        <PeriodFilter v-model="periodo" />
      </div>

      <ul v-if="ventas.length" class="divide-y divide-slate-100 border-t border-slate-100">
        <li v-for="v in ventas" :key="v.id">
          <button
            class="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 text-left transition hover:bg-slate-50/70"
            :aria-expanded="abierta === v.id"
            @click="abierta = abierta === v.id ? null : v.id"
          >
            <div class="min-w-36">
              <p class="font-semibold text-slate-900">{{ fechaCorta(v.fecha) }}</p>
              <p class="text-xs text-slate-500">{{ hora(v.fecha) }}</p>
            </div>
            <p class="flex-1 text-sm text-slate-500">{{ v.detalles.length }} producto(s) · {{ unidades(v) }} unidad(es)</p>
            <StatusBadge :estado="v.estado" />
            <p :class="['w-28 text-right font-semibold tabular-nums', v.estado === 'anulada' ? 'text-slate-400 line-through' : 'text-slate-900']">
              {{ dinero(v.total) }}
            </p>
            <ChevronDown :class="['size-5 text-slate-400 transition', abierta === v.id && 'rotate-180']" />
          </button>
          <div v-if="abierta === v.id" class="bg-slate-50/70 px-6 pt-2 pb-5">
            <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table class="tabla min-w-[480px]">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="text-right">Cantidad</th>
                    <th class="text-right">Precio unitario</th>
                    <th class="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in v.detalles" :key="d.id">
                    <td class="font-medium text-slate-800">{{ d.nombre_producto }}</td>
                    <td class="text-right tabular-nums">{{ d.cantidad }}</td>
                    <td class="text-right tabular-nums">{{ dinero(d.precio_unitario) }}</td>
                    <td class="text-right font-semibold tabular-nums">{{ dinero(d.subtotal) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="v.estado !== 'anulada' && auth.puede('ventas.anular')" class="mt-4 flex justify-end">
              <button class="btn btn-outline text-rose-600 hover:bg-rose-50" @click="anular(v)"><Ban class="size-4" /> Anular venta</button>
            </div>
          </div>
        </li>
      </ul>
      <EmptyState v-else :icono="Receipt" titulo="No hay ventas en este periodo" texto="Cambia el rango de fechas o registra una nueva venta." />
    </section>
  </div>
</template>
