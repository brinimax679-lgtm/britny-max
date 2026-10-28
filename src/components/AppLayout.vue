<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  House, Package, ShoppingCart, TrendingUp, TrendingDown, ChartColumn, DatabaseBackup, UsersRound,
  LogOut, Menu, X, HardDrive, Cloud, RotateCw, CircleAlert, ShieldCheck,
} from 'lucide-vue-next'
import AppLogo from './AppLogo.vue'
import AvisoInactividad from './AvisoInactividad.vue'
import { useAuthStore } from '@/stores/auth'
import { useTiendaStore } from '@/stores/tienda'
import { useInactividad } from '@/composables/useInactividad'
import { iniciales } from '@/lib/format'
import { datosRol } from '@/lib/permisos'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const tienda = useTiendaStore()

// Cada opción declara el permiso que exige; el menú solo muestra las permitidas.
const opciones = [
  { to: '/', label: 'Inicio', icono: House },
  { to: '/productos', label: 'Productos', icono: Package, permiso: 'inventario.ver' },
  { to: '/ventas', label: 'Ventas', icono: ShoppingCart, permiso: 'ventas.registrar', alterno: { to: '/ventas/historial', permiso: 'ventas.ver' } },
  { to: '/ingresos', label: 'Ingresos', icono: TrendingUp, permiso: 'finanzas.ver' },
  { to: '/egresos', label: 'Egresos', icono: TrendingDown, permiso: 'finanzas.ver' },
  { to: '/reportes', label: 'Reportes', icono: ChartColumn, permiso: 'reportes.ver' },
]
const opcionesSistema = [
  { to: '/usuarios', label: 'Usuarios y niveles', icono: UsersRound, permiso: 'usuarios.gestionar' },
  { to: '/configuracion', label: 'Respaldo y cuenta', icono: DatabaseBackup },
]

/** Si el nivel no puede registrar ventas pero sí verlas, el menú lleva al historial. */
function visibles(lista) {
  return lista
    .map((o) => {
      if (!o.permiso || auth.puede(o.permiso)) return o
      if (o.alterno && auth.puede(o.alterno.permiso)) return { ...o, to: o.alterno.to }
      return null
    })
    .filter(Boolean)
}
const menu = computed(() => visibles(opciones))
const sistema = computed(() => visibles(opcionesSistema))

const activo = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to.split('/').slice(0, 2).join('/')))

const menuAbierto = ref(false)
watch(() => route.fullPath, () => (menuAbierto.value = false))

const usuario = computed(() => auth.usuario ?? {})
const nivel = computed(() => datosRol(auth.rol))

onMounted(() => {
  if (!tienda.cargado) tienda.cargar()
})

async function salir(motivo) {
  await auth.cerrarSesion(motivo)
  router.replace({ name: 'login' })
}

// RNF02 – Cierre automático tras 5 minutos sin actividad.
const { enAviso, segundosRestantes, seguirConectado } = useInactividad(() => salir('inactividad'))
</script>

<template>
  <div class="min-h-dvh lg:pl-64">
    <!-- Fondo al abrir el menú en celular -->
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition" leave-active-class="pointer-events-none transition">
      <div v-if="menuAbierto" class="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden" @click="menuAbierto = false" />
    </Transition>

    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 text-white transition-transform duration-200 lg:translate-x-0 print:hidden',
        menuAbierto ? 'translate-x-0' : '-translate-x-full',
      ]"
    >
      <div class="relative px-6 pt-6 pb-8">
        <AppLogo />
        <button class="absolute top-2 right-2 rounded-lg p-1.5 text-blue-200 hover:bg-white/10 lg:hidden" aria-label="Cerrar menú" @click="menuAbierto = false">
          <X class="size-5" />
        </button>
      </div>

      <nav class="flex-1 overflow-y-auto px-4">
        <p class="mb-3 px-3 text-xs font-bold tracking-[0.15em] text-blue-300">MENÚ PRINCIPAL</p>
        <ul class="space-y-1.5">
          <li v-for="item in menu" :key="item.to">
            <RouterLink
              :to="item.to"
              :class="[
                'flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-[15px] font-medium transition',
                activo(item.to) ? 'bg-white text-blue-700 shadow-lg shadow-navy-950/30' : 'text-blue-50/90 hover:bg-white/8 hover:text-white',
              ]"
            >
              <component :is="item.icono" :class="['size-5', activo(item.to) ? 'text-pink-500' : 'text-blue-200']" />
              <span class="flex-1">{{ item.label }}</span>
              <span v-if="activo(item.to)" class="size-1.5 rounded-full bg-pink-500" />
            </RouterLink>
          </li>
        </ul>

        <p class="mt-8 mb-3 px-3 text-xs font-bold tracking-[0.15em] text-blue-300">SISTEMA</p>
        <ul class="space-y-1.5">
          <li v-for="item in sistema" :key="item.to">
            <RouterLink
              :to="item.to"
              :class="[
                'flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-[15px] font-medium transition',
                activo(item.to) ? 'bg-white text-blue-700' : 'text-blue-50/90 hover:bg-white/8 hover:text-white',
              ]"
            >
              <component :is="item.icono" :class="['size-5', activo(item.to) ? 'text-pink-500' : 'text-blue-200']" />
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="m-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div class="mb-3 flex size-9 items-center justify-center rounded-xl bg-white/10">
          <component :is="tienda.modo === 'local' ? HardDrive : Cloud" class="size-5 text-blue-100" />
        </div>
        <template v-if="tienda.modo === 'local'">
          <p class="font-semibold">Modo demostración</p>
          <p class="mt-1 text-sm text-blue-300">La información se guarda en este navegador.</p>
        </template>
        <template v-else>
          <p class="font-semibold">Conectado a la nube</p>
          <p class="mt-1 text-sm text-blue-300">Datos protegidos en Supabase (PostgreSQL).</p>
        </template>
      </div>
    </aside>

    <header class="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-8 print:hidden">
      <button class="btn-icon lg:hidden" aria-label="Abrir menú" @click="menuAbierto = true">
        <Menu class="size-5" />
      </button>
      <div class="min-w-0">
        <p class="truncate text-xs text-slate-500">{{ route.meta.seccion }}</p>
        <p class="truncate font-semibold text-slate-900">{{ route.meta.titulo }}</p>
      </div>
      <div class="ml-auto flex items-center gap-3 sm:gap-4">
        <div class="hidden text-right sm:block">
          <p class="text-sm font-semibold text-slate-900">{{ usuario.nombre }}</p>
          <p class="flex items-center justify-end gap-1 text-xs text-slate-500" :title="nivel?.descripcion">
            <ShieldCheck class="size-3.5 text-blue-600" />
            Nivel {{ nivel?.nivel }} · {{ nivel?.nombre }}
          </p>
        </div>
        <div class="flex size-11 items-center justify-center rounded-xl bg-pink-100 font-semibold text-pink-600 ring-4 ring-pink-50">
          {{ iniciales(usuario.nombre) }}
        </div>
        <span class="hidden h-9 w-px bg-slate-200 sm:block" />
        <button class="btn btn-ghost px-3" @click="salir()">
          <LogOut class="size-5" />
          <span class="hidden md:inline">Cerrar sesión</span>
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <div v-if="!tienda.cargado && tienda.errorCarga" class="card mx-auto max-w-lg p-8 text-center">
        <CircleAlert class="mx-auto size-10 text-rose-500" />
        <p class="mt-4 text-lg font-semibold text-slate-900">No se pudo cargar la información</p>
        <p class="mt-1 text-sm text-slate-500">{{ tienda.errorCarga }}</p>
        <button class="btn btn-primary mt-6" @click="tienda.cargar()"><RotateCw class="size-4" /> Reintentar</button>
      </div>
      <div v-else-if="!tienda.cargado" class="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-slate-500">
        <span class="size-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        Cargando información…
      </div>
      <RouterView v-else :key="route.path" />
    </main>

    <AvisoInactividad :abierto="enAviso" :segundos="segundosRestantes" @seguir="seguirConectado" @salir="salir()" />
  </div>
</template>
