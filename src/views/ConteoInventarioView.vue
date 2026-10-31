<script setup>
// Conteo físico: compara el inventario real con el registrado, muestra las
// discrepancias y ajusta las existencias dejando el registro del ajuste.
import Paginador from '@/components/Paginador.vue'
import { usePaginacion } from '@/composables/usePaginacion'
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ClipboardCheck, Search, LoaderCircle, TriangleAlert } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import KpiCard from '@/components/KpiCard.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useUiStore } from '@/stores/ui'
import { dinero, numero, normalizarTexto } from '@/lib/format'
import { LIMITES, reglaEntero, reglaTexto } from '@/lib/validaciones'

const tienda = useTiendaStore()
const ui = useUiStore()
const router = useRouter()

const conteos = reactive({})
const busqueda = ref('')
const categoria = ref('')
const motivo = ref('Conteo físico')
const guardando = ref(false)

const contado = (p) => conteos[p.id] !== undefined && conteos[p.id] !== ''
const errorConteo = (p) => (contado(p) ? reglaEntero(conteos[p.id], `el conteo de ${p.nombre}`, { f: false }) : null)
const diferencia = (p) => (contado(p) && !errorConteo(p) ? Number(conteos[p.id]) - p.cantidad : 0)
const errorMotivo = computed(() => reglaTexto(motivo.value, 'el motivo', LIMITES.motivo))
const primerError = computed(() => tienda.catalogo.map(errorConteo).find(Boolean) ?? null)

const visibles = computed(() => {
  const t = normalizarTexto(busqueda.value.trim())
  return tienda.catalogo.filter(
    (p) =>
      (!categoria.value || p.categoria_id === categoria.value) &&
      (!t || normalizarTexto(p.nombre).includes(t) || p.codigo_barras?.includes(t)),
  )
})

// 10 productos por página; el resumen y el guardado siguen usando todos los conteos.
const { pagina, total, visibles: enPagina } = usePaginacion(() => visibles.value, {
  reiniciarCon: () => [busqueda.value, categoria.value],
})

const resumen = computed(() => {
  const contados = tienda.catalogo.filter(contado)
  const conDiferencia = contados.filter((p) => diferencia(p) !== 0)
  const valor = conDiferencia.reduce((s, p) => s + diferencia(p) * p.precio_compra, 0)
  return { contados: contados.length, conDiferencia, valor }
})

function alEscanear() {
  const p = tienda.buscarPorCodigo(busqueda.value)
  if (!p) return
  conteos[p.id] = (Number(conteos[p.id]) || 0) + 1
  busqueda.value = ''
  ui.info(`${p.nombre}: ${conteos[p.id]} contado(s)`)
}

async function guardar() {
  if (primerError.value || errorMotivo.value) {
    document.querySelector('[aria-invalid="true"]')?.focus()
    return ui.error(primerError.value || errorMotivo.value)
  }
  const items = resumen.value.conDiferencia.map((p) => ({ producto_id: p.id, cantidad_fisica: Number(conteos[p.id]) }))
  const ok = await ui.confirmar({
    titulo: 'Aplicar ajustes de inventario',
    mensaje: `Se ajustarán ${items.length} producto(s) a la cantidad contada. La diferencia valorizada es ${dinero(resumen.value.valor)}.`,
    textoConfirmar: 'Aplicar ajustes',
  })
  if (!ok) return
  guardando.value = true
  try {
    await tienda.ajustarInventario({ motivo: motivo.value, items })
    ui.exito(`Inventario ajustado: ${items.length} producto(s)`)
    router.push('/reportes?tab=discrepancias')
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
      :icono="ClipboardCheck"
      titulo="Conteo físico"
      subtitulo="Cuenta los productos en estantería y compara con lo registrado para detectar diferencias."
    />

    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <KpiCard titulo="Productos contados" :valor="`${resumen.contados} / ${tienda.catalogo.length}`" :icono="ClipboardCheck" color="blue" />
      <KpiCard titulo="Con diferencia" :valor="numero(resumen.conDiferencia.length)" :icono="TriangleAlert" color="amber" />
      <KpiCard
        titulo="Diferencia valorizada"
        :valor="dinero(resumen.valor)"
        :nota="resumen.valor < 0 ? 'Faltante a precio de compra' : 'A precio de compra'"
        :icono="TriangleAlert"
        :color="resumen.valor < 0 ? 'rose' : 'emerald'"
      />
    </div>

    <section class="card overflow-hidden">
      <div class="flex flex-col gap-3 p-5 sm:p-6 lg:flex-row">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
          <input
            v-model="busqueda"
            type="search"
            class="input py-3 pl-12"
            placeholder="Buscar o escanear (cada lectura suma 1 al conteo)"
            aria-label="Buscar producto"
            @keydown.enter.prevent="alEscanear"
          />
        </div>
        <select v-model="categoria" class="input py-3 lg:w-56" aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          <option v-for="c in tienda.categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>

      <div class="overflow-x-auto">
        <table class="tabla min-w-[760px]">
          <thead>
            <tr>
              <th class="pl-6">Producto</th>
              <th>Categoría</th>
              <th class="text-right">En sistema</th>
              <th class="text-center">Conteo físico</th>
              <th class="text-right">Diferencia</th>
              <th class="pr-6 text-right">Valor diferencia</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in enPagina" :key="p.id" :class="diferencia(p) !== 0 && 'bg-amber-50/50'">
              <td class="pl-6">
                <p class="font-semibold text-slate-900">{{ p.nombre }}</p>
                <p class="font-mono text-xs text-slate-400">{{ p.codigo_barras || 'sin código' }}</p>
              </td>
              <td class="text-slate-500">{{ tienda.nombreCategoria(p.categoria_id) }}</td>
              <td class="text-right font-semibold tabular-nums">{{ p.cantidad }}</td>
              <td class="text-center">
                <input
                  v-model="conteos[p.id]"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  class="input mx-auto w-24 py-2 text-center font-semibold"
                  placeholder="—"
                  :aria-label="`Conteo de ${p.nombre}`"
                  :aria-invalid="Boolean(errorConteo(p))"
                  :title="errorConteo(p) || undefined"
                />
              </td>
              <td :class="['text-right font-semibold tabular-nums', diferencia(p) < 0 ? 'text-rose-600' : diferencia(p) > 0 ? 'text-emerald-600' : 'text-slate-400']">
                {{ contado(p) ? (diferencia(p) > 0 ? '+' : '') + diferencia(p) : '—' }}
              </td>
              <td class="pr-6 text-right tabular-nums text-slate-600">{{ diferencia(p) ? dinero(diferencia(p) * p.precio_compra) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Paginador v-model="pagina" :total="total" />

      <div class="flex flex-col gap-4 border-t border-slate-100 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="w-full sm:max-w-sm">
          <label class="label" for="motivo">Motivo del ajuste</label>
          <input id="motivo" v-model="motivo" class="input" :maxlength="LIMITES.motivo[1]" :aria-invalid="Boolean(errorMotivo)" />
          <p v-if="errorMotivo" class="error-campo">{{ errorMotivo }}</p>
          <p v-else-if="primerError" class="error-campo">{{ primerError }}</p>
        </div>
        <div class="flex flex-col-reverse gap-3 sm:flex-row">
          <RouterLink to="/productos" class="btn btn-outline btn-lg">Cancelar</RouterLink>
          <button class="btn btn-primary btn-lg" :disabled="!resumen.conDiferencia.length || guardando" @click="guardar">
            <LoaderCircle v-if="guardando" class="size-5 animate-spin" />
            Aplicar {{ resumen.conDiferencia.length || '' }} ajuste(s)
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
