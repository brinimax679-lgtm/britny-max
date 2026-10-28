<script setup>
import { computed } from 'vue'
import {
  House, Package, TriangleAlert, TrendingUp, TrendingDown, CalendarDays, ArrowRight,
  ShoppingCart, PackagePlus, ScanBarcode, Receipt, PackageCheck, History,
} from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import KpiCard from '@/components/KpiCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useAuthStore } from '@/stores/auth'
import { dinero, numero, fechaCorta, fechaLarga, hoyISO, diaDe, enRango, rangoPreset, MESES } from '@/lib/format'
import { estadoStock } from '@/lib/catalogos'

const tienda = useTiendaStore()
const auth = useAuthStore()

const hoy = hoyISO()
const mes = rangoPreset('mes')
const nombreMes = MESES[new Date().getMonth()]
const suma = (filas) => filas.reduce((s, f) => s + f.monto, 0)

const disponibles = computed(() => tienda.catalogo.filter((p) => p.cantidad > 0).length)
const agotados = computed(() => tienda.catalogo.filter((p) => p.cantidad <= 0).length)
const ingresosMes = computed(() => suma(tienda.ingresos.filter((i) => enRango(i.fecha, mes))))
const egresosMes = computed(() => suma(tienda.egresos.filter((e) => enRango(e.fecha, mes))))
const balance = computed(() => ingresosMes.value - egresosMes.value)

const ventasHoy = computed(() => tienda.ventas.filter((v) => v.estado !== 'anulada' && diaDe(v.fecha) === hoy))
const totalHoy = computed(() => ventasHoy.value.reduce((s, v) => s + v.total, 0))

const recientes = computed(() =>
  [
    ...tienda.ingresos.map((i) => ({ ...i, clase: 'ingreso' })),
    ...tienda.egresos.map((e) => ({ ...e, clase: 'egreso' })),
  ]
    .sort((a, b) => (b.fecha + (b.creado_en ?? '')).localeCompare(a.fecha + (a.creado_en ?? '')))
    .slice(0, 6),
)

// Cada acción rápida exige el mismo permiso que la pantalla a la que lleva.
const acciones = computed(() =>
  [
    { to: '/ventas', icono: ShoppingCart, texto: 'Nueva venta', clase: 'bg-blue-50 text-blue-600', permiso: 'ventas.registrar' },
    { to: '/productos/entrada', icono: PackagePlus, texto: 'Entrada de mercancía', clase: 'bg-emerald-50 text-emerald-600', permiso: 'inventario.entradas' },
    { to: '/productos/lectura', icono: ScanBarcode, texto: 'Leer código', clase: 'bg-pink-50 text-pink-600', permiso: 'inventario.ver' },
    { to: '/egresos', icono: Receipt, texto: 'Registrar gasto', clase: 'bg-amber-50 text-amber-600', permiso: 'finanzas.editar' },
    { to: '/ventas/historial', icono: History, texto: 'Historial de ventas', clase: 'bg-violet-50 text-violet-600', permiso: 'ventas.ver' },
  ]
    .filter((a) => auth.puede(a.permiso))
    .slice(0, 4),
)

const verFinanzas = computed(() => auth.puede('finanzas.ver'))
const ultimasVentas = computed(() => tienda.ventas.filter((v) => v.estado !== 'anulada').slice(0, 6))
</script>

<template>
  <div>
    <PageHeader
      miga="Inicio"
      :icono="House"
      :titulo="`Bienvenido, ${auth.usuario?.nombre ?? ''}`"
      subtitulo="Aquí tienes un vistazo rápido al estado de tu negocio."
    >
      <template #acciones>
        <span class="card flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-600 shadow-none">
          <CalendarDays class="size-4 text-blue-600" />
          {{ fechaLarga(hoy) }}
        </span>
      </template>
    </PageHeader>

    <div class="mb-4 flex items-end justify-between">
      <h2 class="text-xl font-semibold text-slate-900">Resumen del negocio</h2>
      <p class="text-xs text-slate-500">Movimientos de {{ nombreMes }}</p>
    </div>

    <div :class="['grid gap-4 sm:grid-cols-2', verFinanzas && 'xl:grid-cols-4']">
      <KpiCard titulo="Productos disponibles" :valor="numero(disponibles)" nota="Con existencias en el catálogo" :icono="Package" color="blue" />
      <KpiCard titulo="Productos agotados" :valor="numero(agotados)" nota="Requieren reabastecimiento" :icono="TriangleAlert" color="rose" />
      <template v-if="verFinanzas">
        <KpiCard titulo="Ingresos" :valor="dinero(ingresosMes)" nota="Registro del mes actual" :icono="TrendingUp" color="emerald" />
        <KpiCard titulo="Egresos" :valor="dinero(egresosMes)" nota="Registro del mes actual" :icono="TrendingDown" color="amber" />
      </template>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <section v-if="verFinanzas" class="card overflow-hidden lg:col-span-2">
        <div class="flex items-center justify-between gap-4 p-6">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Movimientos recientes</h2>
            <p class="text-sm text-slate-500">Últimos ingresos y egresos registrados</p>
          </div>
          <RouterLink v-if="auth.puede('reportes.ver')" :to="{ name: 'reportes', query: { tab: 'finanzas' } }" class="btn bg-blue-50 text-blue-700 hover:bg-blue-100">
            Ver todos <ArrowRight class="size-4" />
          </RouterLink>
        </div>
        <div class="overflow-x-auto">
          <table v-if="recientes.length" class="tabla min-w-[560px]">
            <thead>
              <tr>
                <th class="pl-6">Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th class="pr-6 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in recientes" :key="m.clase + m.id">
                <td class="pl-6 whitespace-nowrap text-slate-500">{{ fechaCorta(m.fecha) }}</td>
                <td><StatusBadge :estado="m.clase" /></td>
                <td class="font-medium text-slate-800">{{ m.concepto }}</td>
                <td :class="['pr-6 text-right font-semibold whitespace-nowrap tabular-nums', m.clase === 'ingreso' ? 'text-emerald-600' : 'text-amber-600']">
                  {{ m.clase === 'ingreso' ? '+' : '-' }}{{ dinero(m.monto) }}
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-else :icono="Receipt" titulo="Sin movimientos" texto="Registra una venta o un gasto para verlo aquí." />
        </div>
      </section>

      <!-- Niveles sin acceso a finanzas (cajero): ven sus últimas ventas -->
      <section v-else class="card overflow-hidden lg:col-span-2">
        <div class="flex items-center justify-between gap-4 p-6">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Últimas ventas</h2>
            <p class="text-sm text-slate-500">Ventas registradas recientemente</p>
          </div>
          <RouterLink v-if="auth.puede('ventas.ver')" to="/ventas/historial" class="btn bg-blue-50 text-blue-700 hover:bg-blue-100">
            Ver historial <ArrowRight class="size-4" />
          </RouterLink>
        </div>
        <div class="overflow-x-auto">
          <table v-if="ultimasVentas.length" class="tabla min-w-[480px]">
            <thead>
              <tr>
                <th class="pl-6">Fecha</th>
                <th>Productos</th>
                <th class="pr-6 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in ultimasVentas" :key="v.id">
                <td class="pl-6 whitespace-nowrap text-slate-500">{{ fechaCorta(v.fecha) }}</td>
                <td class="text-slate-700">{{ v.detalles.length }} producto(s)</td>
                <td class="pr-6 text-right font-semibold tabular-nums">{{ dinero(v.total) }}</td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-else :icono="ShoppingCart" titulo="Sin ventas" texto="Las ventas que registres aparecerán aquí." />
        </div>
      </section>

      <div class="space-y-6">
        <section class="card bg-gradient-to-br from-navy-900 to-indigo-800 p-6 text-white">
          <p class="text-sm text-blue-200">Ventas de hoy</p>
          <p class="mt-1 text-3xl font-bold tabular-nums">{{ dinero(totalHoy) }}</p>
          <p class="mt-1 text-sm text-blue-200">{{ ventasHoy.length }} venta(s) registradas</p>
          <div v-if="verFinanzas" class="mt-5 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3 text-sm">
            <span class="text-blue-100">Balance del mes</span>
            <span :class="['font-semibold tabular-nums', balance >= 0 ? 'text-emerald-300' : 'text-rose-300']">{{ dinero(balance) }}</span>
          </div>
        </section>

        <section class="card p-6">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">Alertas de inventario</h2>
            <span class="badge bg-rose-50 text-rose-600">{{ tienda.alertas.length }}</span>
          </div>
          <ul v-if="tienda.alertas.length" class="space-y-3">
            <li v-for="p in tienda.alertas.slice(0, 5)" :key="p.id" class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-slate-800">{{ p.nombre }}</p>
                <p class="text-xs text-slate-500">Quedan {{ p.cantidad }} · mínimo {{ p.stock_minimo }}</p>
              </div>
              <StatusBadge :estado="estadoStock(p)" />
            </li>
          </ul>
          <p v-else class="flex items-center gap-2 text-sm text-slate-500">
            <PackageCheck class="size-4 text-emerald-500" /> Todo el inventario está en niveles adecuados.
          </p>
          <RouterLink v-if="tienda.alertas.length && auth.puede('inventario.entradas')" to="/productos/entrada" class="btn btn-outline mt-5 w-full">
            <PackagePlus class="size-4" /> Registrar entrada de mercancía
          </RouterLink>
        </section>

        <section v-if="acciones.length" class="card p-6">
          <h2 class="mb-4 font-semibold text-slate-900">Acciones rápidas</h2>
          <div class="grid grid-cols-2 gap-3">
            <RouterLink
              v-for="a in acciones"
              :key="a.to"
              :to="a.to"
              class="flex flex-col items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/40"
            >
              <span :class="['flex size-9 items-center justify-center rounded-lg', a.clase]">
                <component :is="a.icono" class="size-4" />
              </span>
              {{ a.texto }}
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
