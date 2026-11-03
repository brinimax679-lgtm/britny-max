<script setup>
// RNF09 – Respaldo de información · RNF02 – Credenciales protegidas.
import { reactive, ref } from 'vue'
import { DatabaseBackup, Download, Upload, KeyRound, HardDrive, Cloud, RotateCcw, Eraser, LoaderCircle, ShieldCheck, TimerReset, Link2Off, Lock } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useTiendaStore } from '@/stores/tienda'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { descargar, leerArchivoTexto } from '@/lib/archivos'
import { fechaHora, hoyISO, numero } from '@/lib/format'
import { validarCambioContrasena } from '@/lib/validaciones'
import { useValidacion } from '@/composables/useValidacion'
import { datosRol } from '@/lib/permisos'
import { MINUTOS_INACTIVIDAD } from '@/lib/inactividad'

const tienda = useTiendaStore()
const auth = useAuthStore()
const nivel = datosRol(auth.rol)
const ui = useUiStore()

const CLAVE_ULTIMO = 'britnymax:ultimo-respaldo'
const leerUltimo = () => {
  try {
    return sessionStorage.getItem(CLAVE_ULTIMO)
  } catch {
    return null
  }
}
const ultimoRespaldo = ref(leerUltimo())
const archivo = ref(null)
const restaurando = ref(false)

const clave = reactive({ actual: '', nueva: '', confirmacion: '' })
const cambiando = ref(false)
const { errores, comprobar, desdeError, reiniciar } = useValidacion(clave, () => validarCambioContrasena(clave))

function descargarRespaldo() {
  const respaldo = tienda.crearRespaldo()
  descargar(`respaldo-britny-max-${hoyISO()}.json`, JSON.stringify(respaldo, null, 2), 'application/json')
  ultimoRespaldo.value = respaldo.exportado_en
  try {
    sessionStorage.setItem(CLAVE_ULTIMO, respaldo.exportado_en)
  } catch {
    /* sin almacenamiento disponible: solo se omite el recordatorio */
  }
  ui.exito('Respaldo descargado')
}

async function restaurar(evento) {
  const elegido = evento.target.files?.[0]
  evento.target.value = ''
  if (!elegido) return
  let respaldo
  try {
    respaldo = JSON.parse(await leerArchivoTexto(elegido))
  } catch {
    return ui.error('El archivo no es un respaldo válido')
  }
  const d = respaldo?.datos ?? {}
  const ok = await ui.confirmar({
    titulo: 'Restaurar respaldo',
    mensaje: `El respaldo del ${respaldo?.exportado_en ? fechaHora(respaldo.exportado_en) : '—'} contiene ${numero(d.productos?.length ?? 0)} productos y ${numero(d.ventas?.length ?? 0)} ventas. ${
      tienda.modo === 'local' ? 'Reemplazará toda la información actual de este navegador.' : 'Los registros se agregarán o actualizarán en la base de datos.'
    } ¿Deseas continuar?`,
    textoConfirmar: 'Restaurar',
    peligro: true,
  })
  if (!ok) return
  restaurando.value = true
  try {
    await tienda.restaurarRespaldo(respaldo)
    ui.exito('Información restaurada correctamente')
  } catch (e) {
    ui.error(e)
  } finally {
    restaurando.value = false
  }
}

async function cambiarClave() {
  if (!comprobar()) return
  cambiando.value = true
  try {
    await auth.cambiarContrasena({ ...clave })
    Object.assign(clave, { actual: '', nueva: '', confirmacion: '' })
    reiniciar()
    ui.exito('Contraseña actualizada')
  } catch (e) {
    if (!desdeError(e) && /actual/i.test(e.message)) errores.value = { actual: e.message }
    ui.error(e)
  } finally {
    cambiando.value = false
  }
}

async function restablecer(conDatos) {
  const ok = await ui.confirmar({
    titulo: conDatos ? 'Cargar datos de ejemplo' : 'Empezar con el sistema vacío',
    mensaje: conDatos
      ? 'Se reemplazará la información actual por un catálogo de ejemplo con tres semanas de movimientos.'
      : 'Se borrarán todos los productos, ventas, ingresos y egresos de este navegador. Descarga un respaldo antes si lo necesitas.',
    textoConfirmar: conDatos ? 'Cargar ejemplo' : 'Borrar todo',
    peligro: true,
  })
  if (!ok) return
  try {
    await tienda.restablecer(conDatos)
    ui.exito(conDatos ? 'Datos de ejemplo cargados' : 'El sistema quedó vacío y listo para usar')
  } catch (e) {
    ui.error(e)
  }
}
</script>

<template>
  <div>
    <PageHeader miga="Sistema" :icono="DatabaseBackup" titulo="Respaldo y cuenta" subtitulo="Protege la información del negocio y administra tu acceso." />

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card p-6 lg:col-span-2">
        <div class="flex flex-wrap items-start gap-4">
          <span :class="['flex size-12 items-center justify-center rounded-2xl', tienda.modo === 'local' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600']">
            <component :is="tienda.modo === 'local' ? HardDrive : Cloud" class="size-6" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-semibold text-slate-900">
              {{ tienda.modo === 'local' ? 'Modo demostración (navegador)' : 'Base de datos en la nube (Supabase)' }}
            </h2>
            <p class="mt-1 max-w-3xl text-sm text-slate-500">
              <template v-if="tienda.modo === 'local'">
                La información se guarda solo en este navegador. Si se borran los datos de navegación se pierde, por eso es importante
                descargar respaldos. Para usar varios dispositivos, configura Supabase (ver README del proyecto).
              </template>
              <template v-else>
                La información se guarda en PostgreSQL mediante Supabase y está disponible desde el computador y el celular.
                Además de los respaldos de la plataforma, puedes descargar una copia en archivo.
              </template>
            </p>
          </div>
          <div class="flex gap-6 text-sm">
            <div><p class="text-slate-500">Productos</p><p class="text-xl font-semibold text-slate-900">{{ numero(tienda.catalogo.length) }}</p></div>
            <div><p class="text-slate-500">Ventas</p><p class="text-xl font-semibold text-slate-900">{{ numero(tienda.ventas.length) }}</p></div>
            <div><p class="text-slate-500">Movimientos</p><p class="text-xl font-semibold text-slate-900">{{ numero(tienda.movimientos.length) }}</p></div>
          </div>
        </div>
      </section>

      <section class="card p-6 lg:col-span-2">
        <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900"><ShieldCheck class="size-5 text-blue-600" /> Tu acceso y la seguridad del sistema</h2>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div class="rounded-xl bg-blue-50/60 p-4">
            <p class="text-xs font-semibold tracking-wide text-blue-700 uppercase">Nivel {{ nivel?.nivel }} de 4</p>
            <p class="mt-1 text-lg font-semibold text-slate-900">{{ nivel?.nombre }}</p>
            <p class="mt-1 text-sm text-slate-600">{{ nivel?.descripcion }}</p>
          </div>
          <ul class="space-y-2.5 text-sm text-slate-600">
            <li class="flex gap-2.5"><TimerReset class="mt-0.5 size-4 shrink-0 text-amber-500" /> La sesión se cierra sola tras {{ MINUTOS_INACTIVIDAD }} minutos sin actividad.</li>
            <li class="flex gap-2.5"><Lock class="mt-0.5 size-4 shrink-0 text-emerald-500" /> El acceso se guarda solo mientras el navegador esté abierto.</li>
            <li class="flex gap-2.5"><Link2Off class="mt-0.5 size-4 shrink-0 text-violet-500" /> Las direcciones (URL) no muestran tokens ni identificadores internos.</li>
          </ul>
        </div>
      </section>

      <section v-if="auth.puede('respaldo.descargar')" class="card p-6">
        <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900"><DatabaseBackup class="size-5 text-blue-600" /> Respaldo de información</h2>
        <p class="mt-1 text-sm text-slate-500">Descarga una copia completa (productos, ventas, movimientos, ingresos y egresos) en un archivo JSON.</p>
        <p class="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Último respaldo en esta sesión:
          <strong class="text-slate-900">{{ ultimoRespaldo ? fechaHora(ultimoRespaldo) : 'nunca' }}</strong>
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <button class="btn btn-primary" @click="descargarRespaldo"><Download class="size-4" /> Descargar respaldo</button>
          <button v-if="auth.puede('respaldo.restaurar')" class="btn btn-outline" :disabled="restaurando" @click="archivo.click()">
            <LoaderCircle v-if="restaurando" class="size-4 animate-spin" />
            <Upload v-else class="size-4" />
            Restaurar desde archivo
          </button>
          <input ref="archivo" type="file" accept="application/json,.json" class="hidden" @change="restaurar" />
        </div>
      </section>

      <section class="card p-6">
        <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900"><KeyRound class="size-5 text-pink-500" /> Cambiar contraseña</h2>
        <p class="mt-1 text-sm text-slate-500">Usuario: <strong class="text-slate-700">{{ auth.usuario?.usuario }}</strong></p>
        <form class="mt-5 grid gap-4" novalidate @submit.prevent="cambiarClave">
          <div>
            <label class="label" for="c-actual">Contraseña actual</label>
            <input id="c-actual" v-model="clave.actual" type="password" class="input" autocomplete="current-password" :aria-invalid="Boolean(errores.actual)" />
            <p v-if="errores.actual" class="error-campo">{{ errores.actual }}</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="c-nueva">Nueva contraseña</label>
              <input id="c-nueva" v-model="clave.nueva" type="password" class="input" autocomplete="new-password" maxlength="72" :aria-invalid="Boolean(errores.nueva)" />
              <p v-if="errores.nueva" class="error-campo">{{ errores.nueva }}</p>
            </div>
            <div>
              <label class="label" for="c-confirmar">Confirmar</label>
              <input id="c-confirmar" v-model="clave.confirmacion" type="password" class="input" autocomplete="new-password" maxlength="72" :aria-invalid="Boolean(errores.confirmacion)" />
              <p v-if="errores.confirmacion" class="error-campo">{{ errores.confirmacion }}</p>
            </div>
          </div>
          <p class="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck class="size-4 text-emerald-500" /> Mínimo 8 caracteres, con letras y números. Las contraseñas se guardan cifradas.</p>
          <div>
            <button type="submit" class="btn btn-primary" :disabled="cambiando">
              <LoaderCircle v-if="cambiando" class="size-4 animate-spin" /> Actualizar contraseña
            </button>
          </div>
        </form>
      </section>

      <section v-if="tienda.modo === 'local' && auth.puede('respaldo.restaurar')" class="card p-6 lg:col-span-2">
        <h2 class="text-lg font-semibold text-slate-900">Datos del modo demostración</h2>
        <p class="mt-1 text-sm text-slate-500">Úsalo para practicar con datos de ejemplo o para empezar a registrar la información real de la tienda.</p>
        <div class="mt-5 flex flex-wrap gap-3">
          <button class="btn btn-outline" @click="restablecer(true)"><RotateCcw class="size-4" /> Cargar datos de ejemplo</button>
          <button class="btn btn-outline text-rose-600 hover:bg-rose-50" @click="restablecer(false)"><Eraser class="size-4" /> Empezar con el sistema vacío</button>
        </div>
      </section>
    </div>
  </div>
</template>
