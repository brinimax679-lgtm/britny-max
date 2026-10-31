<script setup>
// RF11 – Registro de ingresos y egresos (consulta, registro, edición y eliminación).
import Paginador from '@/components/Paginador.vue'
import { usePaginacion } from '@/composables/usePaginacion'
import { computed, reactive, ref } from 'vue'
import { TrendingUp, TrendingDown, Plus, Pencil, Trash2, Search, Receipt, Wallet, Lock, FileSpreadsheet, LoaderCircle } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import PeriodFilter from '@/components/PeriodFilter.vue'
import KpiCard from '@/components/KpiCard.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import BaseModal from '@/components/BaseModal.vue'
import GraficoBarras from '@/components/GraficoBarras.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { dinero, numero, fechaCorta, hoyISO, enRango, periodoInicial, normalizarTexto, describirRango } from '@/lib/format'
import { TIPOS_INGRESO, TIPOS_EGRESO, etiquetaTipo } from '@/lib/catalogos'
import { exportarCSV } from '@/lib/archivos'
import { LIMITES, validarFinanza } from '@/lib/validaciones'
import { useValidacion } from '@/composables/useValidacion'

const props = defineProps({ clase: { type: String, required: true } })

const tienda = useTiendaStore()
const ui = useUiStore()
const puedeEditar = useAuthStore().puede('finanzas.editar')

const esIngreso = props.clase === 'ingreso'
const tipos = esIngreso ? TIPOS_INGRESO : TIPOS_EGRESO
const titulo = esIngreso ? 'Ingresos' : 'Egresos'
const singular = esIngreso ? 'ingreso' : 'egreso'

const periodo = ref(periodoInicial('mes'))
const tipo = ref('')
const busqueda = ref('')

const registros = computed(() => {
  const t = normalizarTexto(busqueda.value.trim())
  return (esIngreso ? tienda.ingresos : tienda.egresos).filter(
    (r) =>
      enRango(r.fecha, periodo.value) &&
      (!tipo.value || r.tipo === tipo.value) &&
      (!t || normalizarTexto(r.concepto).includes(t)),
  )
})
const total = computed(() => registros.value.reduce((s, r) => s + r.monto, 0))
// 10 registros por página; totales y gráfico usan el periodo completo.
const { pagina, total: totalRegistros, visibles: registrosPagina } = usePaginacion(() => registros.value, {
  reiniciarCon: () => [periodo.value, tipo.value, busqueda.value],
})
const porTipo = computed(() =>
  tipos
    .map((t) => ({ etiqueta: t.label, valor: registros.value.filter((r) => r.tipo === t.id).reduce((s, r) => s + r.monto, 0) }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor),
)

// Formulario
const modal = ref(false)
const guardando = ref(false)
const form = reactive({ id: null, fecha: hoyISO(), tipo: '', concepto: '', monto: '' })
const { errores, comprobar, desdeError, reiniciar } = useValidacion(form, () => validarFinanza(props.clase, form))

function nuevo() {
  Object.assign(form, { id: null, fecha: hoyISO(), tipo: esIngreso ? 'otro' : 'servicios_publicos', concepto: '', monto: '' })
  reiniciar()
  modal.value = true
}

function editar(r) {
  Object.assign(form, { id: r.id, fecha: r.fecha, tipo: r.tipo, concepto: r.concepto, monto: r.monto })
  reiniciar()
  modal.value = true
}

async function guardar() {
  if (!comprobar()) return
  guardando.value = true
  try {
    await tienda.guardarFinanza(props.clase, { ...form })
    ui.exito(form.id ? `${titulo.slice(0, -1)} actualizado` : `${titulo.slice(0, -1)} registrado`)
    modal.value = false
  } catch (e) {
    desdeError(e)
    ui.error(e)
  } finally {
    guardando.value = false
  }
}

async function eliminar(r) {
  const ok = await ui.confirmar({
    titulo: `Eliminar ${singular}`,
    mensaje: `¿Deseas eliminar "${r.concepto}" por ${dinero(r.monto)}?`,
    textoConfirmar: 'Eliminar',
    peligro: true,
  })
  if (!ok) return
  try {
    await tienda.eliminarFinanza(props.clase, r.id)
    ui.exito('Registro eliminado')
  } catch (e) {
    ui.error(e)
  }
}

function exportar() {
  exportarCSV(`${props.clase}s-${hoyISO()}.csv`, [
    { titulo: 'Fecha', valor: (r) => r.fecha },
    { titulo: 'Tipo', valor: (r) => etiquetaTipo(r.tipo) },
    { titulo: 'Concepto', valor: (r) => r.concepto },
    { titulo: 'Monto', valor: (r) => r.monto },
  ], registros.value)
}
</script>

<template>
  <div>
    <PageHeader
      miga="Finanzas"
      :icono="esIngreso ? TrendingUp : TrendingDown"
      :titulo="titulo"
      :subtitulo="esIngreso ? 'Dinero que entra al negocio: ventas, aportes y otros ingresos.' : 'Dinero que sale del negocio: compras de mercancía, servicios públicos y otros gastos.'"
    >
      <template #acciones>
        <button class="btn btn-outline btn-lg" @click="exportar"><FileSpreadsheet class="size-5" /> Exportar</button>
        <button v-if="puedeEditar" class="btn btn-primary btn-lg" @click="nuevo"><Plus class="size-5" /> Registrar {{ singular }}</button>
      </template>
    </PageHeader>

    <div class="mb-6 flex flex-wrap items-center gap-3">
      <PeriodFilter v-model="periodo" />
      <select v-model="tipo" class="input w-auto py-2" aria-label="Filtrar por tipo">
        <option value="">Todos los tipos</option>
        <option v-for="t in tipos" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>
    </div>

    <div class="mb-6 grid gap-6 lg:grid-cols-3">
      <div class="grid gap-4 sm:grid-cols-2 lg:col-span-2">
        <KpiCard
          :titulo="`Total de ${titulo.toLowerCase()}`"
          :valor="dinero(total)"
          :nota="describirRango(periodo)"
          :icono="esIngreso ? TrendingUp : TrendingDown"
          :color="esIngreso ? 'emerald' : 'amber'"
        />
        <KpiCard titulo="Registros" :valor="numero(registros.length)" nota="En el periodo seleccionado" :icono="Receipt" color="blue" />
      </div>
      <section class="card p-5">
        <h2 class="mb-4 font-semibold text-slate-900">Distribución por tipo</h2>
        <GraficoBarras v-if="porTipo.length" :filas="porTipo" :formato="dinero" />
        <p v-else class="text-sm text-slate-500">Sin datos en el periodo.</p>
      </section>
    </div>

    <section class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <h2 class="text-lg font-semibold text-slate-900">Registros</h2>
        <div class="relative w-full sm:w-72">
          <Search class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input v-model="busqueda" type="search" class="input py-2 pl-10" placeholder="Buscar concepto" aria-label="Buscar concepto" />
        </div>
      </div>
      <div class="overflow-x-auto">
        <table v-if="registros.length" class="tabla min-w-[640px]">
          <thead>
            <tr>
              <th class="pl-6">Fecha</th>
              <th>Tipo</th>
              <th>Concepto</th>
              <th class="text-right">Monto</th>
              <th class="pr-6 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in registrosPagina" :key="r.id">
              <td class="pl-6 whitespace-nowrap text-slate-500">{{ fechaCorta(r.fecha) }}</td>
              <td><StatusBadge :estado="clase" :texto="etiquetaTipo(r.tipo)" /></td>
              <td class="font-medium text-slate-800">{{ r.concepto }}</td>
              <td :class="['text-right font-semibold whitespace-nowrap tabular-nums', esIngreso ? 'text-emerald-600' : 'text-amber-600']">
                {{ esIngreso ? '+' : '-' }}{{ dinero(r.monto) }}
              </td>
              <td class="pr-6">
                <div v-if="r.venta_id" class="flex justify-end">
                  <RouterLink to="/ventas/historial" class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-blue-600" title="Generado por una venta: se gestiona desde el historial de ventas">
                    <Lock class="size-3.5" /> Venta
                  </RouterLink>
                </div>
                <div v-else-if="puedeEditar" class="flex justify-end gap-2">
                  <button class="btn-icon" title="Editar" @click="editar(r)"><Pencil class="size-4" /></button>
                  <button class="btn-icon hover:text-rose-600" title="Eliminar" @click="eliminar(r)"><Trash2 class="size-4" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else :icono="Wallet" :titulo="`No hay ${titulo.toLowerCase()} en este periodo`" texto="Cambia los filtros o registra un nuevo movimiento.">
          <button v-if="puedeEditar" class="btn btn-primary" @click="nuevo"><Plus class="size-4" /> Registrar {{ singular }}</button>
        </EmptyState>
      </div>
      <Paginador v-model="pagina" :total="totalRegistros" />
    </section>

    <BaseModal
      :abierto="modal"
      :titulo="form.id ? `Editar ${singular}` : `Registrar ${singular}`"
      :subtitulo="esIngreso ? 'Las ventas registradas en el módulo de ventas generan su ingreso automáticamente.' : 'Las compras registradas como entrada de mercancía generan su egreso automáticamente.'"
      @cerrar="modal = false"
    >
      <form id="form-finanza" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="guardar">
        <div>
          <label class="label" for="f-fecha">Fecha</label>
          <input id="f-fecha" v-model="form.fecha" type="date" class="input" :min="LIMITES.fechaMinima" :max="hoyISO()" :aria-invalid="Boolean(errores.fecha)" />
          <p v-if="errores.fecha" class="error-campo">{{ errores.fecha }}</p>
        </div>
        <div>
          <label class="label" for="f-tipo">Tipo</label>
          <select id="f-tipo" v-model="form.tipo" class="input" :aria-invalid="Boolean(errores.tipo)">
            <option v-for="t in tipos" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
          <p v-if="errores.tipo" class="error-campo">{{ errores.tipo }}</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="f-concepto">Concepto</label>
          <input
            id="f-concepto"
            v-model="form.concepto"
            class="input"
            :placeholder="esIngreso ? 'Ej.: Venta de mercancía al por mayor' : 'Ej.: Factura de energía de junio'"
            :maxlength="LIMITES.concepto[1]"
            :aria-invalid="Boolean(errores.concepto)"
          />
          <p v-if="errores.concepto" class="error-campo">{{ errores.concepto }}</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="f-monto">Monto</label>
          <div class="relative">
            <span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="f-monto"
              v-model="form.monto"
              type="number"
              min="1"
              step="any"
              inputmode="decimal"
              class="input pl-8 text-lg font-semibold"
              placeholder="0"
              :aria-invalid="Boolean(errores.monto)"
            />
          </div>
          <p v-if="errores.monto" class="error-campo">{{ errores.monto }}</p>
        </div>
      </form>
      <template #pie>
        <button class="btn btn-outline" @click="modal = false">Cancelar</button>
        <button type="submit" form="form-finanza" class="btn btn-primary" :disabled="guardando">
          <LoaderCircle v-if="guardando" class="size-4 animate-spin" />
          Guardar
        </button>
      </template>
    </BaseModal>
  </div>
</template>
