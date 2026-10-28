<script setup>
// RF01 – Autenticación de usuario.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock, Eye, EyeOff, Package, ShoppingCart, ChartColumn, LoaderCircle, Info, TimerReset } from 'lucide-vue-next'
import AppLogo from '@/components/AppLogo.vue'
import { useAuthStore, tomarAviso, usuarioRecordado } from '@/stores/auth'
import { tomarDestino } from '@/router'
import backend from '@/services'
import { USUARIOS_DEMO } from '@/services/seed'
import { validarInicioSesion } from '@/lib/validaciones'
import { nombreRol } from '@/lib/permisos'
import { MINUTOS_INACTIVIDAD } from '@/lib/inactividad'

const auth = useAuthStore()
const router = useRouter()

// Solo se recuerda el nombre de usuario; la sesión nunca queda guardada.
const usuario = ref(usuarioRecordado())
const contrasena = ref('')
const recordar = ref(Boolean(usuario.value))
const ver = ref(false)
const error = ref('')
const errores = ref({})
const enviando = ref(false)
const aviso = ref(tomarAviso())
const modoDemo = backend.modo === 'local'

const beneficios = [
  { icono: Package, texto: 'Inventario' },
  { icono: ShoppingCart, texto: 'Ventas' },
  { icono: ChartColumn, texto: 'Reportes' },
]

async function entrar() {
  error.value = ''
  errores.value = validarInicioSesion(usuario.value, contrasena.value)
  if (Object.keys(errores.value).length) return
  enviando.value = true
  try {
    await auth.iniciarSesion(usuario.value, contrasena.value, recordar.value)
    contrasena.value = ''
    router.replace(tomarDestino())
  } catch (e) {
    error.value = e.message
    contrasena.value = ''
  } finally {
    enviando.value = false
  }
}

function usarCuentaDemo(cuenta) {
  usuario.value = cuenta.usuario
  contrasena.value = cuenta.contrasena
  errores.value = {}
}
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-2">
    <section class="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-12 text-white lg:flex lg:flex-col">
      <div class="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full border-[70px] border-white/8" />
      <div class="pointer-events-none absolute -bottom-56 -left-24 size-[30rem] rounded-full bg-white/6" />
      <AppLogo variante="login" />
      <div class="relative my-auto max-w-md">
        <h1 class="text-5xl leading-tight font-medium tracking-tight">
          Gestión de inventario
          <span class="block text-pink-300">sin complicaciones.</span>
        </h1>
        <p class="mt-6 text-lg leading-relaxed text-blue-100">
          Controla tu stock, ventas, ingresos y egresos desde un solo lugar. Rápido, claro y siempre al día.
        </p>
        <ul class="mt-12 flex gap-10">
          <li v-for="b in beneficios" :key="b.texto" class="flex flex-col gap-2">
            <component :is="b.icono" class="size-7 text-white" />
            <span class="text-sm text-blue-100">{{ b.texto }}</span>
          </li>
        </ul>
      </div>
      <p class="relative text-sm text-blue-200">Tienda Britny Max · Rionegro, Santander</p>
    </section>

    <section class="flex items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
      <div class="w-full max-w-md">
        <div class="mb-8 flex justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 p-5 lg:hidden">
          <AppLogo variante="login" />
        </div>

        <div class="card p-7 sm:p-9">
          <h2 class="text-3xl font-medium tracking-tight text-slate-900">Bienvenido a Britny Máx</h2>
          <p class="mt-2 text-slate-500">Ingresa tus credenciales para continuar.</p>

          <p v-if="aviso" class="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
            <TimerReset class="mt-0.5 size-4 shrink-0" />
            {{ aviso }}
          </p>

          <form class="mt-8 space-y-5" novalidate @submit.prevent="entrar">
            <div>
              <label class="label font-medium" for="usuario">Usuario</label>
              <div class="relative">
                <User class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="usuario"
                  v-model="usuario"
                  class="input py-3 pl-12"
                  placeholder="Ingresa tu usuario"
                  autocomplete="username"
                  autocapitalize="none"
                  maxlength="120"
                  autofocus
                  :aria-invalid="Boolean(errores.usuario)"
                  @input="errores.usuario = ''"
                />
              </div>
              <p v-if="errores.usuario" class="error-campo">{{ errores.usuario }}</p>
            </div>

            <div>
              <label class="label font-medium" for="contrasena">Contraseña</label>
              <div class="relative">
                <Lock class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="contrasena"
                  v-model="contrasena"
                  :type="ver ? 'text' : 'password'"
                  class="input py-3 pr-12 pl-12"
                  placeholder="Ingresa tu contraseña"
                  autocomplete="current-password"
                  maxlength="72"
                  :aria-invalid="Boolean(errores.contrasena)"
                  @input="errores.contrasena = ''"
                />
                <button
                  type="button"
                  class="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  :aria-label="ver ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  @click="ver = !ver"
                >
                  <component :is="ver ? EyeOff : Eye" class="size-5" />
                </button>
              </div>
              <p v-if="errores.contrasena" class="error-campo">{{ errores.contrasena }}</p>
            </div>

            <div>
              <label class="flex cursor-pointer items-center gap-3 text-slate-600 select-none">
                <input v-model="recordar" type="checkbox" class="size-4 rounded border-slate-300 accent-blue-600" />
                Recordar usuario
              </label>
              <p class="ayuda ml-7">La sesión se cierra sola tras {{ MINUTOS_INACTIVIDAD }} minutos sin actividad o al cerrar el navegador.</p>
            </div>

            <p v-if="error" class="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600" role="alert">{{ error }}</p>

            <button
              type="submit"
              class="btn btn-lg w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:brightness-110"
              :disabled="enviando"
            >
              <LoaderCircle v-if="enviando" class="size-5 animate-spin" />
              Iniciar sesión
            </button>
          </form>

          <div v-if="modoDemo" class="mt-6 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800">
            <p class="flex items-center gap-2"><Info class="size-4 shrink-0" /><strong>Modo demostración</strong> · una cuenta por nivel</p>
            <ul class="mt-3 grid gap-1.5">
              <li v-for="c in USUARIOS_DEMO" :key="c.usuario">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-left hover:bg-white"
                  @click="usarCuentaDemo(c)"
                >
                  <span><code class="font-semibold">{{ c.usuario }}</code> / <code>{{ c.contrasena }}</code></span>
                  <span class="text-xs text-blue-600">{{ nombreRol(c.rol) }}</span>
                </button>
              </li>
            </ul>
            <p class="mt-2 text-xs text-blue-700">Los datos se guardan solo en este navegador.</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
