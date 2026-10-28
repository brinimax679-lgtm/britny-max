<script setup>
// Gráfico de columnas (agrupadas si hay varias series) en SVG.
// Columnas ≤ 24 px con extremo redondeado de 4 px, separación de 2 px,
// cuadrícula tenue y tooltip por grupo al pasar el cursor o enfocar.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  etiquetas: { type: Array, required: true },
  /** [{ nombre, color, valores: number[] }] */
  series: { type: Array, required: true },
  formato: { type: Function, default: (v) => String(v) },
  formatoEje: { type: Function, default: (v) => String(v) },
  alto: { type: Number, default: 260 },
  /** Texto largo para el tooltip (por defecto, la etiqueta del eje) */
  etiquetasLargas: { type: Array, default: null },
})

const contenedor = ref(null)
const ancho = ref(640)
const activo = ref(null)
let observador

onMounted(() => {
  observador = new ResizeObserver(([e]) => (ancho.value = Math.max(e.contentRect.width, 280)))
  observador.observe(contenedor.value)
})
onBeforeUnmount(() => observador?.disconnect())

const M = { arriba: 12, derecha: 8, abajo: 30, izquierda: 64 }
const GAP = 2

function escala(maximo, n = 4) {
  if (maximo <= 0) return { tope: 1, paso: 0.25 }
  const crudo = maximo / n
  const mag = 10 ** Math.floor(Math.log10(crudo))
  const r = crudo / mag
  const paso = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag
  return { tope: paso * Math.ceil(maximo / paso), paso }
}

const geo = computed(() => {
  const n = props.etiquetas.length
  const k = props.series.length
  const plotW = ancho.value - M.izquierda - M.derecha
  const plotH = props.alto - M.arriba - M.abajo
  const base = M.arriba + plotH
  const maximo = Math.max(0, ...props.series.flatMap((s) => s.valores))
  const { tope, paso } = escala(maximo)
  const banda = plotW / Math.max(n, 1)
  const barra = Math.max(2, Math.min(24, (banda * 0.72 - GAP * (k - 1)) / k))
  const grupo = k * barra + (k - 1) * GAP

  const ticks = []
  for (let v = 0; v <= tope + paso / 2; v += paso) ticks.push({ v, y: base - (v / tope) * plotH })

  const pasoEtiqueta = Math.max(1, Math.ceil((n * 56) / plotW))
  const grupos = props.etiquetas.map((etiqueta, i) => {
    const centro = M.izquierda + banda * (i + 0.5)
    const barras = props.series.map((s, j) => {
      const v = s.valores[i] ?? 0
      const h = (v / tope) * plotH
      const x = centro - grupo / 2 + j * (barra + GAP)
      const y = base - h
      const r = Math.min(4, h, barra / 2)
      const d = h <= 0 ? '' : `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + barra - r} Q${x + barra},${y} ${x + barra},${y + r} V${base} Z`
      return { d, color: s.color }
    })
    return { etiqueta, centro, barras, x: M.izquierda + banda * i, mostrarEtiqueta: i % pasoEtiqueta === 0 }
  })
  return { plotW, plotH, base, banda, ticks, grupos }
})

const tooltip = computed(() => {
  if (activo.value === null) return null
  const g = geo.value.grupos[activo.value]
  if (!g) return null
  // Se ubica al costado de la columna activa para no tapar las vecinas.
  const derecha = g.centro < ancho.value / 2
  const izquierda = derecha ? g.x + geo.value.banda + 6 : g.x - 6
  return {
    derecha,
    titulo: props.etiquetasLargas?.[activo.value] ?? g.etiqueta,
    filas: props.series.map((s) => ({ nombre: s.nombre, color: s.color, valor: props.formato(s.valores[activo.value] ?? 0) })),
    izquierda,
  }
})
</script>

<template>
  <div>
    <ul v-if="series.length > 1" class="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
      <li v-for="s in series" :key="s.nombre" class="flex items-center gap-2">
        <span class="size-3 rounded-[3px]" :style="{ background: s.color }" />
        {{ s.nombre }}
      </li>
    </ul>
    <div ref="contenedor" class="relative" @pointerleave="activo = null">
      <svg :width="ancho" :height="alto" class="block" role="img" :aria-label="`Gráfico de ${series.map((s) => s.nombre).join(' y ')}`">
        <g>
          <template v-for="t in geo.ticks" :key="t.v">
            <line :x1="M.izquierda" :x2="ancho - M.derecha" :y1="t.y" :y2="t.y" :stroke="t.v === 0 ? '#cbd5e1' : '#eef2f6'" stroke-width="1" />
            <text :x="M.izquierda - 10" :y="t.y" text-anchor="end" dominant-baseline="middle" class="fill-slate-400 text-[11px] tabular-nums">
              {{ formatoEje(t.v) }}
            </text>
          </template>
        </g>
        <g v-for="(g, i) in geo.grupos" :key="i">
          <rect v-if="activo === i" :x="g.x + 2" :y="M.arriba" :width="geo.banda - 4" :height="geo.plotH" rx="6" fill="#f1f5f9" />
          <path v-for="(b, j) in g.barras" :key="j" :d="b.d" :fill="b.color" />
          <text v-if="g.mostrarEtiqueta" :x="g.centro" :y="geo.base + 18" text-anchor="middle" class="fill-slate-500 text-[11px]">{{ g.etiqueta }}</text>
          <rect
            :x="g.x"
            :y="M.arriba"
            :width="geo.banda"
            :height="geo.plotH"
            fill="transparent"
            tabindex="0"
            class="cursor-crosshair outline-none"
            :aria-label="`${etiquetasLargas?.[i] ?? g.etiqueta}: ${series.map((s) => `${s.nombre} ${formato(s.valores[i] ?? 0)}`).join(', ')}`"
            @pointerenter="activo = i"
            @focus="activo = i"
            @blur="activo = null"
          />
        </g>
      </svg>
      <div
        v-if="tooltip"
        :class="[
          'pointer-events-none absolute top-1 z-10 min-w-40 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-lg',
          !tooltip.derecha && '-translate-x-full',
        ]"
        :style="{ left: `${tooltip.izquierda}px` }"
      >
        <p class="mb-1.5 text-xs text-slate-500">{{ tooltip.titulo }}</p>
        <p v-for="f in tooltip.filas" :key="f.nombre" class="flex items-center gap-2">
          <span class="h-0.5 w-3 rounded-full" :style="{ background: f.color }" />
          <span class="font-semibold text-slate-900 tabular-nums">{{ f.valor }}</span>
          <span class="text-slate-500">{{ f.nombre }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
