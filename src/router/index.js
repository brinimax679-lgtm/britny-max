import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import AppLayout from '@/components/AppLayout.vue'
import { sesionVencida } from '@/lib/inactividad'
import { consultaConTokens, fragmentoConTokens, PARAMETROS_SENSIBLES, rutaInternaSegura } from '@/lib/url-segura'

const inventario = 'Gestión de inventario'
const comercial = 'Gestión comercial'

// meta.permiso: nivel de seguridad requerido (ver src/lib/permisos.js).
// Ninguna ruta lleva identificadores: las pantallas que editan un registro lo
// reciben por history.state, que no aparece en la barra de direcciones.
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { publica: true, titulo: 'Iniciar sesión' },
  },
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', name: 'inicio', component: () => import('@/views/InicioView.vue'), meta: { seccion: 'Panel de control', titulo: 'Vista general' } },
      { path: 'productos', name: 'productos', component: () => import('@/views/ProductosView.vue'), meta: { seccion: inventario, titulo: 'Productos', permiso: 'inventario.ver' } },
      { path: 'productos/nuevo', name: 'producto-nuevo', component: () => import('@/views/ProductoFormView.vue'), meta: { seccion: inventario, titulo: 'Registrar producto', permiso: 'inventario.editar' } },
      { path: 'productos/editar', name: 'producto-editar', component: () => import('@/views/ProductoFormView.vue'), meta: { seccion: inventario, titulo: 'Editar producto', permiso: 'inventario.editar' } },
      { path: 'productos/lectura', name: 'lectura', component: () => import('@/views/LecturaCodigoView.vue'), meta: { seccion: inventario, titulo: 'Lectura de código', permiso: 'inventario.ver' } },
      { path: 'productos/entrada', name: 'entrada', component: () => import('@/views/EntradaMercanciaView.vue'), meta: { seccion: inventario, titulo: 'Entrada de mercancía', permiso: 'inventario.entradas' } },
      { path: 'productos/conteo', name: 'conteo', component: () => import('@/views/ConteoInventarioView.vue'), meta: { seccion: inventario, titulo: 'Conteo físico', permiso: 'inventario.conteo' } },
      { path: 'ventas', name: 'ventas', component: () => import('@/views/VentasView.vue'), meta: { seccion: comercial, titulo: 'Registro de ventas', permiso: 'ventas.registrar' } },
      { path: 'ventas/historial', name: 'historial-ventas', component: () => import('@/views/HistorialVentasView.vue'), meta: { seccion: comercial, titulo: 'Historial de ventas', permiso: 'ventas.ver' } },
      { path: 'ingresos', name: 'ingresos', component: () => import('@/views/FinanzasView.vue'), props: { clase: 'ingreso' }, meta: { seccion: 'Finanzas', titulo: 'Ingresos', permiso: 'finanzas.ver' } },
      { path: 'egresos', name: 'egresos', component: () => import('@/views/FinanzasView.vue'), props: { clase: 'egreso' }, meta: { seccion: 'Finanzas', titulo: 'Egresos', permiso: 'finanzas.ver' } },
      { path: 'reportes', name: 'reportes', component: () => import('@/views/ReportesView.vue'), meta: { seccion: 'Análisis', titulo: 'Reportes', permiso: 'reportes.ver' } },
      { path: 'usuarios', name: 'usuarios', component: () => import('@/views/UsuariosView.vue'), meta: { seccion: 'Sistema', titulo: 'Usuarios y niveles', permiso: 'usuarios.gestionar' } },
      { path: 'configuracion', name: 'configuracion', component: () => import('@/views/ConfiguracionView.vue'), meta: { seccion: 'Sistema', titulo: 'Respaldo y cuenta' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

const CLAVE_VOLVER = 'britnymax:volver'

/** Ruta pendiente después del login: se guarda en sessionStorage, no en la URL. */
function recordarDestino(ruta) {
  try {
    if (ruta && ruta !== '/') sessionStorage.setItem(CLAVE_VOLVER, ruta)
  } catch {
    /* sin almacenamiento */
  }
}

/** Devuelve (una sola vez) la ruta pendiente, solo si es interna y existe. */
export function tomarDestino() {
  let guardada = '/'
  try {
    guardada = sessionStorage.getItem(CLAVE_VOLVER) ?? '/'
    sessionStorage.removeItem(CLAVE_VOLVER)
  } catch {
    /* sin almacenamiento */
  }
  const ruta = rutaInternaSegura(guardada)
  const destino = router.resolve(ruta)
  return destino.matched.length && destino.name && destino.name !== 'login' ? destino.fullPath : '/'
}

router.beforeEach(async (to) => {
  // 1. Nunca deja tokens ni contraseñas en la barra de direcciones.
  if (consultaConTokens(to.query) || fragmentoConTokens(to.hash)) {
    const query = Object.fromEntries(
      Object.entries(to.query).filter(([k]) => !PARAMETROS_SENSIBLES.includes(k.toLowerCase())),
    )
    return { path: to.path, query, hash: fragmentoConTokens(to.hash) ? '' : to.hash, replace: true }
  }

  const auth = useAuthStore()
  await auth.verificar()

  // 2. Una sesión inactiva por más de 5 minutos se cierra al intentar navegar.
  if (auth.usuario && sesionVencida()) {
    await auth.cerrarSesion('inactividad')
    return { name: 'login', replace: true }
  }

  if (!to.meta.publica && !auth.usuario) {
    recordarDestino(to.fullPath)
    return { name: 'login', replace: true }
  }
  if (to.name === 'login' && auth.usuario) return { name: 'inicio' }

  // 3. Nivel de seguridad de la pantalla, con los permisos vigentes que asignó el administrador.
  await auth.refrescarPermisos()
  if (to.meta.permiso && !auth.puede(to.meta.permiso)) {
    useUiStore().error(`Tu nivel de acceso (${auth.nombreRol}) no permite abrir «${to.meta.titulo}»`)
    return { name: 'inicio', replace: true }
  }
})

router.afterEach((to) => {
  document.title = `${to.meta.titulo ?? 'Inicio'} · Britny Max`
})

export default router
