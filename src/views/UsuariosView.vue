<script setup>
// Gestión de usuarios y niveles de seguridad (solo nivel 1: administrador).
import Paginador from '@/components/Paginador.vue'
import { usePaginacion } from '@/composables/usePaginacion'
import { computed, onMounted, reactive, ref } from 'vue'
import { UsersRound, UserPlus, Pencil, KeyRound, Check, Minus, LoaderCircle, ShieldCheck, Info, Save, RotateCcw, Undo2 } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BaseModal from '@/components/BaseModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useTiendaStore } from '@/stores/tienda'
import { useValidacion } from '@/composables/useValidacion'
import {
  ROLES, PERMISOS, DESCRIPCION_PERMISOS, PERMISOS_ASIGNABLES, ROLES_EDITABLES, REQUISITOS,
  agruparPermisos, datosRol, permisosPorDefecto,
} from '@/lib/permisos'
import { validarUsuario, reglaContrasena } from '@/lib/validaciones'
import { fechaHora } from '@/lib/format'

const auth = useAuthStore()
const ui = useUiStore()
const modoLocal = useTiendaStore().modo === 'local'

const usuarios = ref([])
const cargando = ref(true)
const { pagina, total: totalUsuarios, visibles: usuariosPagina } = usePaginacion(() => usuarios.value)

async function cargar() {
  cargando.value = true
  try {
    usuarios.value = await auth.listarUsuarios()
  } catch (e) {
    ui.error(e)
  } finally {
    cargando.value = false
  }
}
onMounted(cargar)

const colorNivel = {
  administrador: 'bg-blue-50 text-blue-700',
  supervisor: 'bg-violet-50 text-violet-700',
  cajero: 'bg-emerald-50 text-emerald-700',
  consulta: 'bg-slate-100 text-slate-600',
}

// ── Crear / editar ──────────────────────────────────────────────────────
const modal = ref(false)
const guardando = ref(false)
const form = reactive({ id: null, nombre: '', usuario: '', correo: '', rol: 'cajero', activo: true, contrasena: '' })
const esPropio = computed(() => form.id && form.id === auth.usuario?.id)

const { errores, comprobar, desdeError, reiniciar } = useValidacion(form, () =>
  validarUsuario(form, { usuarios: usuarios.value, modo: modoLocal ? 'local' : 'supabase' }),
)

function nuevo() {
  Object.assign(form, { id: null, nombre: '', usuario: '', correo: '', rol: 'cajero', activo: true, contrasena: '' })
  reiniciar()
  modal.value = true
}

function editar(u) {
  Object.assign(form, { id: u.id, nombre: u.nombre, usuario: u.usuario ?? '', correo: u.correo ?? '', rol: u.rol, activo: u.activo, contrasena: '' })
  reiniciar()
  modal.value = true
}

async function guardar() {
  if (!comprobar()) return
  guardando.value = true
  try {
    await auth.guardarUsuario({ ...form }, usuarios.value)
    ui.exito(form.id ? 'Usuario actualizado' : 'Usuario agregado')
    modal.value = false
    await cargar()
  } catch (e) {
    desdeError(e)
    ui.error(e)
  } finally {
    guardando.value = false
  }
}

// ── Permisos por nivel (el administrador los pone y los quita) ──────────
const matriz = reactive(Object.fromEntries(ROLES_EDITABLES.map((r) => [r, []])))
const guardados = ref(null)
const guardandoPermisos = ref(false)
const huella = (grupos) => JSON.stringify(ROLES_EDITABLES.map((r) => [...(grupos?.[r] ?? [])].sort()))

function copiarMatriz(grupos) {
  for (const r of ROLES_EDITABLES) matriz[r] = PERMISOS_ASIGNABLES.filter((p) => grupos?.[r]?.includes(p))
}

onMounted(async () => {
  await auth.cargarPermisos()
  guardados.value = auth.permisos ?? agruparPermisos(permisosPorDefecto())
  copiarMatriz(guardados.value)
})

const hayCambios = computed(() => guardados.value && huella(matriz) !== huella(guardados.value))
const esInicial = computed(() => huella(matriz) === huella(agruparPermisos(permisosPorDefecto())))
const tiene = (rol, permiso) => rol === 'administrador' || matriz[rol]?.includes(permiso)
const totalPermisos = (rol) => (rol === 'administrador' ? Object.keys(PERMISOS).length : matriz[rol]?.length ?? 0)

/** Marca o desmarca un permiso; arrastra sus requisitos (vender exige ver el inventario, etc.). */
function alternar(rol, permiso) {
  const lista = new Set(matriz[rol])
  if (lista.has(permiso)) {
    lista.delete(permiso)
    for (const [p, requisitos] of Object.entries(REQUISITOS)) if (requisitos.includes(permiso)) lista.delete(p)
  } else {
    lista.add(permiso)
    for (const r of REQUISITOS[permiso] ?? []) lista.add(r)
  }
  matriz[rol] = PERMISOS_ASIGNABLES.filter((p) => lista.has(p))
}

async function guardarPermisos() {
  guardandoPermisos.value = true
  try {
    await auth.guardarPermisos(ROLES_EDITABLES.flatMap((rol) => matriz[rol].map((permiso) => ({ rol, permiso }))))
    guardados.value = auth.permisos
    copiarMatriz(guardados.value)
    ui.exito('Permisos guardados. Cada persona los verá al cambiar de pantalla o recargar la página.')
  } catch (e) {
    ui.error(e)
  } finally {
    guardandoPermisos.value = false
  }
}

// ── Restablecer contraseña (modo demo) ──────────────────────────────────
const modalClave = ref(false)
const clave = reactive({ id: null, nombre: '', nueva: '' })
const errorClave = ref('')

function cambiarClave(u) {
  Object.assign(clave, { id: u.id, nombre: u.nombre, nueva: '' })
  errorClave.value = ''
  modalClave.value = true
}

async function guardarClave() {
  errorClave.value = reglaContrasena(clave.nueva, 'la nueva contraseña') ?? ''
  if (errorClave.value) return
  try {
    await auth.restablecerContrasena(clave.id, clave.nueva)
    ui.exito(`Contraseña de ${clave.nombre} actualizada`)
    modalClave.value = false
  } catch (e) {
    ui.error(e)
  }
}
</script>

<template>
  <div>
    <PageHeader miga="Sistema" :icono="UsersRound" titulo="Usuarios y niveles" subtitulo="Define quién entra al sistema y qué puede hacer cada persona.">
      <template #acciones>
        <button class="btn btn-primary btn-lg" @click="nuevo"><UserPlus class="size-5" /> Agregar usuario</button>
      </template>
    </PageHeader>

    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table v-if="usuarios.length" class="tabla min-w-[720px]">
          <thead>
            <tr>
              <th class="pl-6">Nombre</th>
              <th>{{ modoLocal ? 'Usuario' : 'Correo' }}</th>
              <th>Nivel</th>
              <th>Estado</th>
              <th v-if="!modoLocal">Último ingreso</th>
              <th class="pr-6 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usuariosPagina" :key="u.id">
              <td class="pl-6 font-semibold text-slate-900">
                {{ u.nombre }}
                <span v-if="u.id === auth.usuario?.id" class="ml-1 text-xs font-normal text-slate-400">(tú)</span>
              </td>
              <td class="font-mono text-xs text-slate-600">{{ modoLocal ? u.usuario : u.correo }}</td>
              <td>
                <span :class="['badge', colorNivel[u.rol]]">Nivel {{ datosRol(u.rol)?.nivel }} · {{ datosRol(u.rol)?.nombre }}</span>
              </td>
              <td>
                <span :class="['badge', u.activo ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500']">
                  {{ u.activo ? 'Activo' : 'Inactivo' }}
                </span>
              </td>
              <td v-if="!modoLocal" class="whitespace-nowrap text-slate-500">{{ u.ultimo_ingreso ? fechaHora(u.ultimo_ingreso) : 'Nunca' }}</td>
              <td class="pr-6">
                <div class="flex justify-end gap-2">
                  <button class="btn-icon" title="Editar" :aria-label="`Editar ${u.nombre}`" @click="editar(u)"><Pencil class="size-4" /></button>
                  <button v-if="modoLocal" class="btn-icon" title="Restablecer contraseña" :aria-label="`Restablecer contraseña de ${u.nombre}`" @click="cambiarClave(u)">
                    <KeyRound class="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="cargando" class="flex items-center justify-center gap-3 p-12 text-slate-500">
          <LoaderCircle class="size-5 animate-spin" /> Cargando usuarios…
        </div>
        <EmptyState v-else :icono="UsersRound" titulo="Sin usuarios" />
      </div>
      <Paginador v-model="pagina" :total="totalUsuarios" />
    </section>

    <section class="card mt-6 overflow-hidden">
      <div class="p-6 pb-4">
        <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-900"><ShieldCheck class="size-5 text-blue-600" /> Permisos por nivel</h2>
        <p class="mt-1 text-sm text-slate-500">
          Marca o desmarca lo que puede hacer cada nivel. El administrador siempre tiene todos los permisos.
          Los cambios se aplican en la aplicación y en la base de datos.
        </p>
      </div>
      <div class="grid gap-3 px-6 pb-6 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="r in ROLES" :key="r.id" class="rounded-xl border border-slate-200 p-4">
          <span :class="['badge', colorNivel[r.id]]">Nivel {{ r.nivel }}</span>
          <p class="mt-2 font-semibold text-slate-900">{{ r.nombre }}</p>
          <p class="mt-1 text-sm text-slate-500">
            {{ r.id === 'administrador' ? 'Control total; no se puede limitar.' : `${totalPermisos(r.id)} de ${PERMISOS_ASIGNABLES.length} permisos asignados.` }}
          </p>
        </div>
      </div>
      <div class="overflow-x-auto border-t border-slate-100">
        <table class="tabla min-w-[640px]">
          <thead>
            <tr>
              <th class="pl-6">Permiso</th>
              <th v-for="r in ROLES" :key="r.id" class="text-center">{{ r.nombre }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="permiso in Object.keys(PERMISOS)" :key="permiso">
              <td class="pl-6 text-slate-700">{{ DESCRIPCION_PERMISOS[permiso] }}</td>
              <td v-for="r in ROLES" :key="r.id" class="text-center">
                <Check v-if="r.id === 'administrador'" class="mx-auto size-5 text-emerald-600" :aria-label="`${r.nombre}: sí (siempre)`" />
                <span v-else-if="!PERMISOS_ASIGNABLES.includes(permiso)" class="inline-flex" title="Solo el administrador">
                  <Minus class="mx-auto size-4 text-slate-300" :aria-label="`${r.nombre}: solo el administrador`" />
                </span>
                <input
                  v-else
                  type="checkbox"
                  class="size-5 cursor-pointer rounded accent-emerald-600"
                  :checked="tiene(r.id, permiso)"
                  :disabled="guardandoPermisos"
                  :aria-label="`${r.nombre}: ${DESCRIPCION_PERMISOS[permiso]}`"
                  @change="alternar(r.id, permiso)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex flex-wrap items-center gap-3 border-t border-slate-100 px-6 py-4">
        <p class="mr-auto text-sm" :class="hayCambios ? 'font-medium text-amber-700' : 'text-slate-500'">
          {{ hayCambios ? 'Tienes cambios sin guardar.' : 'Al marcar un permiso se agregan los que necesita para funcionar (por ejemplo, vender exige consultar productos).' }}
        </p>
        <button v-if="!esInicial" class="btn btn-ghost" :disabled="guardandoPermisos" @click="copiarMatriz(agruparPermisos(permisosPorDefecto()))">
          <RotateCcw class="size-4" /> Valores iniciales
        </button>
        <button v-if="hayCambios" class="btn btn-outline" :disabled="guardandoPermisos" @click="copiarMatriz(guardados)">
          <Undo2 class="size-4" /> Deshacer
        </button>
        <button class="btn btn-primary" :disabled="!hayCambios || guardandoPermisos" @click="guardarPermisos">
          <LoaderCircle v-if="guardandoPermisos" class="size-4 animate-spin" /><Save v-else class="size-4" /> Guardar permisos
        </button>
      </div>
    </section>

    <BaseModal
      :abierto="modal"
      :titulo="form.id ? 'Editar usuario' : 'Agregar usuario'"
      :subtitulo="form.id ? 'Cambia el nombre, el nivel o el estado de la cuenta.' : 'La persona podrá entrar con el nivel que elijas.'"
      @cerrar="modal = false"
    >
      <form id="form-usuario" class="grid gap-4" novalidate @submit.prevent="guardar">
        <p v-if="!form.id && !modoLocal" class="flex gap-2.5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
          <Info class="mt-0.5 size-4 shrink-0" />
          Primero crea la cuenta en Supabase → Authentication → Users (con «Auto confirm user»). Luego escribe aquí su correo para autorizarla.
        </p>
        <div>
          <label class="label" for="u-nombre">Nombre</label>
          <input id="u-nombre" v-model="form.nombre" class="input" maxlength="80" :aria-invalid="Boolean(errores.nombre)" />
          <p v-if="errores.nombre" class="error-campo">{{ errores.nombre }}</p>
        </div>
        <template v-if="!form.id">
          <div v-if="modoLocal">
            <label class="label" for="u-usuario">Usuario para ingresar</label>
            <input id="u-usuario" v-model="form.usuario" class="input font-mono" maxlength="30" autocapitalize="none" autocomplete="off" :aria-invalid="Boolean(errores.usuario)" />
            <p v-if="errores.usuario" class="error-campo">{{ errores.usuario }}</p>
          </div>
          <div v-else>
            <label class="label" for="u-correo">Correo de la cuenta</label>
            <input id="u-correo" v-model="form.correo" type="email" class="input" maxlength="254" autocomplete="off" :aria-invalid="Boolean(errores.correo)" />
            <p v-if="errores.correo" class="error-campo">{{ errores.correo }}</p>
          </div>
        </template>
        <div>
          <label class="label" for="u-rol">Nivel de acceso</label>
          <select id="u-rol" v-model="form.rol" class="input" :disabled="esPropio" :aria-invalid="Boolean(errores.rol)">
            <option v-for="r in ROLES" :key="r.id" :value="r.id">Nivel {{ r.nivel }} · {{ r.nombre }}</option>
          </select>
          <p v-if="errores.rol" class="error-campo">{{ errores.rol }}</p>
          <p v-else class="ayuda">{{ datosRol(form.rol)?.descripcion }}</p>
          <p v-if="esPropio" class="ayuda">No puedes cambiar tu propio nivel.</p>
        </div>
        <div v-if="!form.id && modoLocal">
          <label class="label" for="u-clave">Contraseña inicial</label>
          <input id="u-clave" v-model="form.contrasena" type="password" class="input" maxlength="72" autocomplete="new-password" :aria-invalid="Boolean(errores.contrasena)" />
          <p v-if="errores.contrasena" class="error-campo">{{ errores.contrasena }}</p>
          <p v-else class="ayuda">Mínimo 8 caracteres, con letras y números. La persona puede cambiarla después.</p>
        </div>
        <label v-if="form.id" class="flex cursor-pointer items-center gap-3 text-sm text-slate-700">
          <input v-model="form.activo" type="checkbox" class="size-4 accent-blue-600" :disabled="esPropio" />
          Cuenta activa (si se desactiva, no puede entrar)
        </label>
      </form>
      <template #pie>
        <button class="btn btn-outline" @click="modal = false">Cancelar</button>
        <button type="submit" form="form-usuario" class="btn btn-primary" :disabled="guardando">
          <LoaderCircle v-if="guardando" class="size-4 animate-spin" />
          {{ form.id ? 'Guardar cambios' : 'Agregar usuario' }}
        </button>
      </template>
    </BaseModal>

    <BaseModal :abierto="modalClave" titulo="Restablecer contraseña" :subtitulo="clave.nombre" ancho="sm:max-w-md" @cerrar="modalClave = false">
      <form id="form-clave" novalidate @submit.prevent="guardarClave">
        <label class="label" for="u-nueva">Nueva contraseña</label>
        <input id="u-nueva" v-model="clave.nueva" type="password" class="input" maxlength="72" autocomplete="new-password" :aria-invalid="Boolean(errorClave)" />
        <p v-if="errorClave" class="error-campo">{{ errorClave }}</p>
        <p v-else class="ayuda">Mínimo 8 caracteres, con letras y números.</p>
      </form>
      <template #pie>
        <button class="btn btn-outline" @click="modalClave = false">Cancelar</button>
        <button type="submit" form="form-clave" class="btn btn-primary">Guardar</button>
      </template>
    </BaseModal>
  </div>
</template>
