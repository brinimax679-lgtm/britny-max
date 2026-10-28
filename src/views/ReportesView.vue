<script setup>
// RF15 – Generación de reportes: inventario, ventas, movimientos de mercancía,
// ingresos y egresos en un periodo, y discrepancias detectadas en conteos físicos.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChartColumn, Package, ShoppingCart, ArrowLeftRight, Wallet, TriangleAlert, FileSpreadsheet, Printer,
  TrendingUp, TrendingDown, Scale, Boxes, CircleDollarSign, Receipt, PackageCheck, ClipboardCheck,
} from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import PeriodFilter from '@/components/PeriodFilter.vue'
import KpiCard from '@/components/KpiCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import GraficoColumnas from '@/components/GraficoColumnas.vue'
import GraficoBarras from '@/components/GraficoBarras.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useAuthStore } from '@/stores/auth'
import {
  dinero, dineroCompacto, numero, fechaCorta, fechaHora, hoyISO, enRango, periodoInicial, describirRango,
  diaDe, sumarDias, parseFecha, isoLocal, MESES,
} from '@/lib/format'
import { estadoStock, etiquetaTipo, TIPOS_INGRESO, TIPOS_EGRESO } from '@/lib/catalogos'
import { exportarCSV } from '@/lib/archivos'

const tienda = useTiendaStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const COLOR_INGRESOS = '#2a78d6'
const COLOR_EGRESOS = '#eb6834'

const pestanas = [
  { id: 'inventario', label: 'Inventario', icono: Package },
  { id: 'ventas', label: 'Ventas', icono: ShoppingCart },
  { id: 'movimientos', label: 'Entradas y salidas', icono: ArrowLeftRight },
  { id: 'finanzas', label: 'Ingresos y egresos', icono: Wallet },
  { id: 'discrepancias', label: 'Discrepancias', icono: TriangleAlert },
]
const tab = computed({
  get: () => (pestanas.some((p) => p.id === route.query.tab) ? route.query.tab : 'inventario'),
  set: (v) => router.replace({ query: { ...route.query, tab: v } }),
})
const pestanaActual = computed(() => pestanas.find((p) => p.id === tab.value))

const periodo = ref(periodoInicial('30d'))
const enPeriodo = (f) => enRango(f, periodo.value)
const suma = (filas, fn) => filas.reduce((s, x) => s + fn(x), 0)

/** Agrupa por día (≤ 62 días) o por mes para los gráficos. */
function cubetas(fechas) {
  const desde = periodo.value.desde || fechas.map(diaDe).reduce((m, f) => (f < m ? f : m), hoyISO())
  const hasta = periodo.value.hasta || hoyISO()
  const dias = Math.round((parseFecha(hasta) - parseFecha(desde)) / 864e5) + 1
  if (dias <= 62) {
    const claves = []
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) claves.push(d)
    return {
      unidad: 'día',
      claves,
      clave: (f) => diaDe(f),
      etiqueta: (k) => fechaCorta(k).replace(/ \d{4}$/, ''),
      larga: (k) => fechaCorta(k),
    }
  }
  const claves = []
  const d = parseFecha(desde)
  d.setDate(1)
  for (const fin = parseFecha(hasta); d <= fin; d.setMonth(d.getMonth() + 1)) claves.push(isoLocal(d).slice(0, 7))
  const mes = (k) => MESES[Number(k.slice(5, 7)) - 1]
  return {
    unidad: 'mes',
    claves,
    clave: (f) => diaDe(f).slice(0, 7),
    etiqueta: (k) => `${mes(k).slice(0, 3)} ${k.slice(2, 4)}`,
    larga: (k) => `${mes(k)} ${k.slice(0, 4)}`,
  }
}

function serie(c, filas, fecha, valor) {
  const mapa = Object.fromEntries(c.claves.map((k) => [k, 0]))
  for (const f of filas) {
    const k = c.clave(fecha(f))
    if (k in mapa) mapa[k] += valor(f)
  }
  return c.claves.map((k) => mapa[k])
}

// ── Inventario (estado actual) ────────────────────────────────────────────
const filtroEstado = ref('')
const inventario = computed(() => {
  const p = tienda.catalogo
  return {
    unidades: suma(p, (x) => x.cantidad),
    costo: suma(p, (x) => x.cantidad * x.precio_compra),
    venta: suma(p, (x) => x.cantidad * x.precio_venta),
    disponibles: p.filter((x) => x.cantidad > 0).length,
    bajos: p.filter((x) => estadoStock(x) === 'bajo').length,
    agotados: p.filter((x) => x.cantidad <= 0).length,
  }
})
const filasInventario = computed(() =>
  tienda.catalogo.filter((p) => {
    if (filtroEstado.value === 'disponible') return p.cantidad > 0
    return !filtroEstado.value || estadoStock(p) === filtroEstado.value
  }),
)
const inventarioPorCategoria = computed(() =>
  tienda.categorias
    .map((c) => {
      const productos = tienda.catalogo.filter((p) => p.categoria_id === c.id)
      return { etiqueta: c.nombre, valor: suma(productos, (p) => p.cantidad * p.precio_compra), detalle: `${suma(productos, (p) => p.cantidad)} und.` }
    })
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor),
)

// ── Ventas ────────────────────────────────────────────────────────────────
const ventasPeriodo = computed(() => tienda.ventas.filter((v) => v.estado !== 'anulada' && enPeriodo(v.fecha)))
const detallesPeriodo = computed(() => ventasPeriodo.value.flatMap((v) => v.detalles))
const resumenVentas = computed(() => {
  const total = suma(ventasPeriodo.value, (v) => v.total)
  const costo = suma(detallesPeriodo.value, (d) => d.cantidad * (tienda.productoPorId[d.producto_id]?.precio_compra ?? 0))
  return { total, numero: ventasPeriodo.value.length, unidades: suma(detallesPeriodo.value, (d) => d.cantidad), ganancia: total - costo }
})
const masVendidos = computed(() => {
  const mapa = new Map()
  for (const d of detallesPeriodo.value) {
    const clave = d.producto_id ?? d.nombre_producto
    const fila = mapa.get(clave) ?? { nombre: d.nombre_producto, unidades: 0, total: 0 }
    fila.unidades += d.cantidad
    fila.total += d.subtotal
    mapa.set(clave, fila)
  }
  return [...mapa.values()].sort((a, b) => b.unidades - a.unidades || b.total - a.total)
})
const graficoVentas = computed(() => {
  const c = cubetas(ventasPeriodo.value.map((v) => v.fecha))
  return {
    unidad: c.unidad,
    etiquetas: c.claves.map(c.etiqueta),
    largas: c.claves.map(c.larga),
    series: [{ nombre: 'Ventas', color: COLOR_INGRESOS, valores: serie(c, ventasPeriodo.value, (v) => v.fecha, (v) => v.total) }],
  }
})

// ── Entradas y salidas de mercancía ───────────────────────────────────────
const filtroMovimiento = ref('')
const movimientosPeriodo = computed(() => tienda.movimientos.filter((m) => enPeriodo(m.fecha)))
const filasMovimientos = computed(() => movimientosPeriodo.value.filter((m) => !filtroMovimiento.value || m.tipo === filtroMovimiento.value))
const resumenMovimientos = computed(() => {
  const m = movimientosPeriodo.value
  return {
    entradas: suma(m.filter((x) => x.tipo === 'entrada'), (x) => x.cantidad),
    salidas: suma(m.filter((x) => x.tipo === 'salida'), (x) => -x.cantidad),
    ajustes: suma(m.filter((x) => x.tipo === 'ajuste'), (x) => x.cantidad),
  }
})

// ── Ingresos y egresos ────────────────────────────────────────────────────
const ingresosPeriodo = computed(() => tienda.ingresos.filter((i) => enPeriodo(i.fecha)))
const egresosPeriodo = computed(() => tienda.egresos.filter((e) => enPeriodo(e.fecha)))
const resumenFinanzas = computed(() => {
  const ingresos = suma(ingresosPeriodo.value, (i) => i.monto)
  const egresos = suma(egresosPeriodo.value, (e) => e.monto)
  return { ingresos, egresos, balance: ingresos - egresos }
})
const graficoFinanzas = computed(() => {
  const c = cubetas([...ingresosPeriodo.value, ...egresosPeriodo.value].map((x) => x.fecha))
  return {
    etiquetas: c.claves.map(c.etiqueta),
    largas: c.claves.map(c.larga),
    series: [
      { nombre: 'Ingresos', color: COLOR_INGRESOS, valores: serie(c, ingresosPeriodo.value, (x) => x.fecha, (x) => x.monto) },
      { nombre: 'Egresos', color: COLOR_EGRESOS, valores: serie(c, egresosPeriodo.value, (x) => x.fecha, (x) => x.monto) },
    ],
  }
})
const distribucion = (filas, tipos) =>
  tipos
    .map((t) => ({ etiqueta: t.label, valor: suma(filas.filter((f) => f.tipo === t.id), (f) => f.monto) }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor)
const egresosPorTipo = computed(() => distribucion(egresosPeriodo.value, TIPOS_EGRESO))
const ingresosPorTipo = computed(() => distribucion(ingresosPeriodo.value, TIPOS_INGRESO))
const filasFinanzas = computed(() =>
  [
    ...ingresosPeriodo.value.map((i) => ({ ...i, clase: 'ingreso' })),
    ...egresosPeriodo.value.map((e) => ({ ...e, clase: 'egreso' })),
  ].sort((a, b) => (b.fecha + (b.creado_en ?? '')).localeCompare(a.fecha + (a.creado_en ?? ''))),
)

// ── Discrepancias (ajustes por conteo físico) ─────────────────────────────
const ajustes = computed(() => movimientosPeriodo.value.filter((m) => m.tipo === 'ajuste'))
const valorAjuste = (m) => m.cantidad * (tienda.productoPorId[m.producto_id]?.precio_compra ?? 0)
const resumenDiscrepancias = computed(() => ({
  faltantes: suma(ajustes.value.filter((m) => m.cantidad < 0), (m) => -m.cantidad),
  sobrantes: suma(ajustes.value.filter((m) => m.cantidad > 0), (m) => m.cantidad),
  valor: suma(ajustes.value, valorAjuste),
}))

// ── Exportar e imprimir ───────────────────────────────────────────────────
function exportar() {
  const sufijo = `${tab.value}-${hoyISO()}.csv`
  const exportadores = {
    inventario: () =>
      exportarCSV(`reporte-${sufijo}`, [
        { titulo: 'Producto', valor: (p) => p.nombre },
        { titulo: 'Código', valor: (p) => p.codigo_barras ?? '' },
        { titulo: 'Categoría', valor: (p) => tienda.nombreCategoria(p.categoria_id) },
        { titulo: 'Cantidad', valor: (p) => p.cantidad },
        { titulo: 'Stock mínimo', valor: (p) => p.stock_minimo },
        { titulo: 'Valor a costo', valor: (p) => p.cantidad * p.precio_compra },
        { titulo: 'Valor a precio de venta', valor: (p) => p.cantidad * p.precio_venta },
        { titulo: 'Estado', valor: (p) => estadoStock(p) },
      ], filasInventario.value),
    ventas: () =>
      exportarCSV(`reporte-${sufijo}`, [
        { titulo: 'Producto', valor: (f) => f.nombre },
        { titulo: 'Unidades vendidas', valor: (f) => f.unidades },
        { titulo: 'Total vendido', valor: (f) => f.total },
      ], masVendidos.value),
    movimientos: () =>
      exportarCSV(`reporte-${sufijo}`, [
        { titulo: 'Fecha', valor: (m) => fechaHora(m.fecha) },
        { titulo: 'Producto', valor: (m) => m.nombre_producto },
        { titulo: 'Tipo', valor: (m) => etiquetaTipo(m.tipo) },
        { titulo: 'Cantidad', valor: (m) => m.cantidad },
        { titulo: 'Existencias resultantes', valor: (m) => m.stock_resultante },
        { titulo: 'Motivo', valor: (m) => m.motivo },
      ], filasMovimientos.value),
    finanzas: () =>
      exportarCSV(`reporte-${sufijo}`, [
        { titulo: 'Fecha', valor: (r) => r.fecha },
        { titulo: 'Clase', valor: (r) => (r.clase === 'ingreso' ? 'Ingreso' : 'Egreso') },
        { titulo: 'Tipo', valor: (r) => etiquetaTipo(r.tipo) },
        { titulo: 'Concepto', valor: (r) => r.concepto },
        { titulo: 'Monto', valor: (r) => (r.clase === 'ingreso' ? r.monto : -r.monto) },
      ], filasFinanzas.value),
    discrepancias: () =>
      exportarCSV(`reporte-${sufijo}`, [
        { titulo: 'Fecha', valor: (m) => fechaHora(m.fecha) },
        { titulo: 'Producto', valor: (m) => m.nombre_producto },
        { titulo: 'Diferencia', valor: (m) => m.cantidad },
        { titulo: 'Valor a costo', valor: valorAjuste },
        { titulo: 'Motivo', valor: (m) => m.motivo },
      ], ajustes.value),
  }
  exportadores[tab.value]()
}

const imprimir = () => window.print()
</script>

<template>
  <div>
    <PageHeader miga="Reportes" :icono="ChartColumn" titulo="Reportes" subtitulo="Consulta cómo está funcionando el negocio en el periodo que necesites.">
      <template #acciones>
        <button class="btn btn-outline btn-lg" @click="imprimir"><Printer class="size-5" /> Imprimir</button>
        <button class="btn btn-primary btn-lg" @click="exportar"><FileSpreadsheet class="size-5" /> Exportar a Excel</button>
      </template>
    </PageHeader>

    <p class="mb-4 hidden text-sm text-slate-600 print:block">
      Britny Max · Reporte de {{ pestanaActual.label.toLowerCase() }} ·
      {{ tab === 'inventario' ? `Estado al ${fechaCorta(hoyISO())}` : describirRango(periodo) }}
    </p>

    <div class="mb-5 print:hidden">
      <div class="flex w-fit flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist">
        <button
          v-for="p in pestanas"
          :key="p.id"
          role="tab"
          :aria-selected="tab === p.id"
          :class="[
            'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition',
            tab === p.id ? 'bg-navy-900 text-white shadow' : 'text-slate-600 hover:bg-slate-100',
          ]"
          @click="tab = p.id"
        >
          <component :is="p.icono" class="size-4" />
          {{ p.label }}
        </button>
      </div>
    </div>

    <div class="mb-6 flex min-h-11 flex-wrap items-center gap-3 print:hidden">
      <template v-if="tab === 'inventario'">
        <p class="text-sm text-slate-500">El inventario muestra las existencias actuales.</p>
        <select v-model="filtroEstado" class="input w-auto py-2" aria-label="Filtrar por estado">
          <option value="">Todos los productos</option>
          <option value="disponible">Disponibles</option>
          <option value="bajo">Stock bajo</option>
          <option value="agotado">Agotados</option>
        </select>
      </template>
      <template v-else>
        <PeriodFilter v-model="periodo" />
        <select v-if="tab === 'movimientos'" v-model="filtroMovimiento" class="input w-auto py-2" aria-label="Filtrar por tipo de movimiento">
          <option value="">Entradas, salidas y ajustes</option>
          <option value="entrada">Solo entradas</option>
          <option value="salida">Solo salidas</option>
          <option value="ajuste">Solo ajustes</option>
        </select>
      </template>
    </div>

    <!-- INVENTARIO -->
    <div v-if="tab === 'inventario'" class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard titulo="Productos disponibles" :valor="numero(inventario.disponibles)" :nota="`${inventario.bajos} con stock bajo`" :icono="PackageCheck" color="blue" />
        <KpiCard titulo="Productos agotados" :valor="numero(inventario.agotados)" nota="Sin existencias" :icono="TriangleAlert" color="rose" />
        <KpiCard titulo="Valor del inventario" :valor="dinero(inventario.costo)" :nota="`${numero(inventario.unidades)} unidades a precio de compra`" :icono="Boxes" color="violet" />
        <KpiCard titulo="Valor a precio de venta" :valor="dinero(inventario.venta)" :nota="`Ganancia potencial ${dinero(inventario.venta - inventario.costo)}`" :icono="CircleDollarSign" color="emerald" />
      </div>
      <div class="grid gap-6 lg:grid-cols-3">
        <section class="card p-6">
          <h2 class="font-semibold text-slate-900">Valor del inventario por categoría</h2>
          <p class="mb-5 text-sm text-slate-500">A precio de compra</p>
          <GraficoBarras v-if="inventarioPorCategoria.length" :filas="inventarioPorCategoria" :formato="dinero" />
          <p v-else class="text-sm text-slate-500">Sin existencias registradas.</p>
        </section>
        <section class="card overflow-hidden lg:col-span-2">
          <div class="overflow-x-auto">
            <table v-if="filasInventario.length" class="tabla min-w-[640px]">
              <thead>
                <tr>
                  <th class="pl-6">Producto</th>
                  <th>Categoría</th>
                  <th class="text-right">Cantidad</th>
                  <th class="text-right">Valor a costo</th>
                  <th class="pr-6">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in filasInventario" :key="p.id">
                  <td class="pl-6 font-semibold text-slate-900">{{ p.nombre }}</td>
                  <td class="text-slate-500">{{ tienda.nombreCategoria(p.categoria_id) }}</td>
                  <td class="text-right tabular-nums">{{ p.cantidad }} <span class="text-xs text-slate-400">/ mín. {{ p.stock_minimo }}</span></td>
                  <td class="text-right tabular-nums">{{ dinero(p.cantidad * p.precio_compra) }}</td>
                  <td class="pr-6"><StatusBadge :estado="estadoStock(p)" /></td>
                </tr>
              </tbody>
            </table>
            <EmptyState v-else :icono="Package" titulo="No hay productos con ese estado" />
          </div>
        </section>
      </div>
    </div>

    <!-- VENTAS -->
    <div v-else-if="tab === 'ventas'" class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard titulo="Total vendido" :valor="dinero(resumenVentas.total)" :nota="describirRango(periodo)" :icono="ShoppingCart" color="blue" />
        <KpiCard titulo="Ventas registradas" :valor="numero(resumenVentas.numero)" :nota="`Promedio ${dinero(resumenVentas.numero ? resumenVentas.total / resumenVentas.numero : 0)}`" :icono="Receipt" color="violet" />
        <KpiCard titulo="Unidades vendidas" :valor="numero(resumenVentas.unidades)" :nota="`${masVendidos.length} productos distintos`" :icono="Package" color="pink" />
        <KpiCard titulo="Ganancia bruta estimada" :valor="dinero(resumenVentas.ganancia)" nota="Ventas menos costo de lo vendido" :icono="CircleDollarSign" color="emerald" />
      </div>
      <section class="card p-6">
        <h2 class="font-semibold text-slate-900">Ventas en el periodo</h2>
        <p class="mb-5 text-sm text-slate-500">Total vendido por {{ graficoVentas.unidad }}</p>
        <GraficoColumnas
          v-if="resumenVentas.numero"
          :etiquetas="graficoVentas.etiquetas"
          :etiquetas-largas="graficoVentas.largas"
          :series="graficoVentas.series"
          :formato="dinero"
          :formato-eje="dineroCompacto"
        />
        <EmptyState v-else :icono="ShoppingCart" titulo="No hay ventas en este periodo" />
      </section>
      <section v-if="masVendidos.length" class="card overflow-hidden">
        <div class="p-6 pb-2">
          <h2 class="font-semibold text-slate-900">Productos más vendidos</h2>
          <p class="text-sm text-slate-500">Identifica los artículos de mayor rotación</p>
        </div>
        <div class="grid gap-6 p-6 xl:grid-cols-2">
          <GraficoBarras :filas="masVendidos.slice(0, 8).map((f) => ({ etiqueta: f.nombre, valor: f.unidades, detalle: dinero(f.total) }))" :formato="(v) => `${numero(v)} und.`" />
          <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="tabla min-w-[420px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th class="text-right">Unidades</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(f, i) in masVendidos" :key="f.nombre">
                  <td class="text-slate-400 tabular-nums">{{ i + 1 }}</td>
                  <td class="font-medium text-slate-800">{{ f.nombre }}</td>
                  <td class="text-right tabular-nums">{{ f.unidades }}</td>
                  <td class="text-right font-semibold tabular-nums">{{ dinero(f.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <!-- ENTRADAS Y SALIDAS -->
    <div v-else-if="tab === 'movimientos'" class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-3">
        <KpiCard titulo="Unidades que entraron" :valor="numero(resumenMovimientos.entradas)" nota="Compras, inventario inicial y devoluciones" :icono="TrendingUp" color="emerald" />
        <KpiCard titulo="Unidades que salieron" :valor="numero(resumenMovimientos.salidas)" nota="Por ventas" :icono="TrendingDown" color="blue" />
        <KpiCard titulo="Ajustes por conteo" :valor="(resumenMovimientos.ajustes > 0 ? '+' : '') + numero(resumenMovimientos.ajustes)" nota="Diferencia neta en unidades" :icono="Scale" color="violet" />
      </div>
      <section class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table v-if="filasMovimientos.length" class="tabla min-w-[760px]">
            <thead>
              <tr>
                <th class="pl-6">Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th class="text-right">Cantidad</th>
                <th class="text-right">Existencias</th>
                <th class="pr-6">Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in filasMovimientos" :key="m.id">
                <td class="pl-6 whitespace-nowrap text-slate-500">{{ fechaHora(m.fecha) }}</td>
                <td class="font-medium text-slate-800">{{ m.nombre_producto }}</td>
                <td><StatusBadge :estado="m.tipo" /></td>
                <td :class="['text-right font-semibold tabular-nums', m.cantidad < 0 ? 'text-slate-700' : 'text-emerald-600']">
                  {{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}
                </td>
                <td class="text-right tabular-nums text-slate-500">{{ m.stock_resultante }}</td>
                <td class="pr-6 text-slate-500">{{ m.motivo }}</td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-else :icono="ArrowLeftRight" titulo="Sin movimientos de mercancía en este periodo" />
        </div>
      </section>
    </div>

    <!-- INGRESOS Y EGRESOS -->
    <div v-else-if="tab === 'finanzas'" class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-3">
        <KpiCard titulo="Ingresos" :valor="dinero(resumenFinanzas.ingresos)" :nota="`${ingresosPeriodo.length} registros`" :icono="TrendingUp" color="emerald" />
        <KpiCard titulo="Egresos" :valor="dinero(resumenFinanzas.egresos)" :nota="`${egresosPeriodo.length} registros`" :icono="TrendingDown" color="amber" />
        <KpiCard
          titulo="Balance"
          :valor="dinero(resumenFinanzas.balance)"
          :nota="resumenFinanzas.balance >= 0 ? 'El negocio generó ganancia' : 'Los egresos superan los ingresos'"
          :icono="Scale"
          :color="resumenFinanzas.balance >= 0 ? 'blue' : 'rose'"
        />
      </div>
      <section class="card p-6">
        <h2 class="font-semibold text-slate-900">Ingresos y egresos</h2>
        <p class="mb-5 text-sm text-slate-500">{{ describirRango(periodo) }}</p>
        <GraficoColumnas
          v-if="filasFinanzas.length"
          :etiquetas="graficoFinanzas.etiquetas"
          :etiquetas-largas="graficoFinanzas.largas"
          :series="graficoFinanzas.series"
          :formato="dinero"
          :formato-eje="dineroCompacto"
        />
        <EmptyState v-else :icono="Wallet" titulo="Sin ingresos ni egresos en este periodo" />
        <details v-if="filasFinanzas.length" class="mt-4 text-sm print:hidden">
          <summary class="cursor-pointer font-medium text-blue-600">Ver datos del gráfico en tabla</summary>
          <div class="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table class="tabla">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th class="text-right">Ingresos</th>
                  <th class="text-right">Egresos</th>
                  <th class="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(etiqueta, i) in graficoFinanzas.largas" :key="etiqueta">
                  <td>{{ etiqueta }}</td>
                  <td class="text-right tabular-nums">{{ dinero(graficoFinanzas.series[0].valores[i]) }}</td>
                  <td class="text-right tabular-nums">{{ dinero(graficoFinanzas.series[1].valores[i]) }}</td>
                  <td class="text-right font-semibold tabular-nums">{{ dinero(graficoFinanzas.series[0].valores[i] - graficoFinanzas.series[1].valores[i]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div class="grid gap-6 lg:grid-cols-2">
        <section class="card p-6">
          <h2 class="mb-5 font-semibold text-slate-900">Ingresos por tipo</h2>
          <GraficoBarras v-if="ingresosPorTipo.length" :filas="ingresosPorTipo" :formato="dinero" />
          <p v-else class="text-sm text-slate-500">Sin ingresos en el periodo.</p>
        </section>
        <section class="card p-6">
          <h2 class="mb-5 font-semibold text-slate-900">Egresos por tipo</h2>
          <GraficoBarras v-if="egresosPorTipo.length" :filas="egresosPorTipo" :formato="dinero" />
          <p v-else class="text-sm text-slate-500">Sin egresos en el periodo.</p>
        </section>
      </div>
      <section v-if="filasFinanzas.length" class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="tabla min-w-[640px]">
            <thead>
              <tr>
                <th class="pl-6">Fecha</th>
                <th>Clase</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th class="pr-6 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filasFinanzas" :key="r.clase + r.id">
                <td class="pl-6 whitespace-nowrap text-slate-500">{{ fechaCorta(r.fecha) }}</td>
                <td><StatusBadge :estado="r.clase" /></td>
                <td class="text-slate-500">{{ etiquetaTipo(r.tipo) }}</td>
                <td class="font-medium text-slate-800">{{ r.concepto }}</td>
                <td :class="['pr-6 text-right font-semibold whitespace-nowrap tabular-nums', r.clase === 'ingreso' ? 'text-emerald-600' : 'text-amber-600']">
                  {{ r.clase === 'ingreso' ? '+' : '-' }}{{ dinero(r.monto) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- DISCREPANCIAS -->
    <div v-else class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-3">
        <KpiCard titulo="Unidades faltantes" :valor="numero(resumenDiscrepancias.faltantes)" nota="Menos de lo registrado (pérdida, vencimiento, hurto)" :icono="TrendingDown" color="rose" />
        <KpiCard titulo="Unidades sobrantes" :valor="numero(resumenDiscrepancias.sobrantes)" nota="Más de lo registrado (ventas o entradas sin registrar)" :icono="TrendingUp" color="emerald" />
        <KpiCard titulo="Valor de la diferencia" :valor="dinero(resumenDiscrepancias.valor)" nota="A precio de compra actual" :icono="Scale" :color="resumenDiscrepancias.valor < 0 ? 'rose' : 'violet'" />
      </div>
      <section class="card overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <h2 class="font-semibold text-slate-900">Ajustes por conteo físico</h2>
            <p class="text-sm text-slate-500">Diferencias entre el inventario físico y el registrado en el sistema.</p>
          </div>
          <RouterLink v-if="auth.puede('inventario.conteo')" to="/productos/conteo" class="btn btn-outline print:hidden"><ClipboardCheck class="size-4" /> Hacer conteo físico</RouterLink>
        </div>
        <div class="overflow-x-auto">
          <table v-if="ajustes.length" class="tabla min-w-[640px]">
            <thead>
              <tr>
                <th class="pl-6">Fecha</th>
                <th>Producto</th>
                <th class="text-right">Diferencia</th>
                <th class="text-right">Valor</th>
                <th class="pr-6">Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in ajustes" :key="m.id">
                <td class="pl-6 whitespace-nowrap text-slate-500">{{ fechaHora(m.fecha) }}</td>
                <td class="font-medium text-slate-800">{{ m.nombre_producto }}</td>
                <td :class="['text-right font-semibold tabular-nums', m.cantidad < 0 ? 'text-rose-600' : 'text-emerald-600']">
                  {{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad }}
                </td>
                <td class="text-right tabular-nums">{{ dinero(valorAjuste(m)) }}</td>
                <td class="pr-6 text-slate-500">{{ m.motivo }}</td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-else :icono="PackageCheck" titulo="Sin discrepancias en este periodo" texto="Realiza un conteo físico para comparar el inventario real con el registrado." />
        </div>
      </section>
    </div>
  </div>
</template>
