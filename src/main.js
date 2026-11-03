// Primero: si la URL trae tokens, se quitan de la barra de direcciones y del
// historial antes de que el router la lea (no se leen ni se usan).
import './lib/limpiar-url.js'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import backend from './services'
import { useAuthStore } from './stores/auth'
import './style.css'
import { iniciarTablasResponsivas } from './lib/tablas-responsivas.js'

const app = createApp(App).use(createPinia()).use(router)

// Si la sesión de Supabase vence o se cierra en otra pestaña, vuelve al login.
backend.alCerrarSesion?.(() => {
  const auth = useAuthStore()
  if (!auth.usuario) return
  auth.sesionTerminada()
  router.replace({ name: 'login' })
})

app.mount('#app')
iniciarTablasResponsivas()
