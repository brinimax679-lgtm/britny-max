import { defineStore } from 'pinia'
import backend from '@/services'
import { useTiendaStore } from './tienda'
import { exigirValido, validarCambioContrasena, validarInicioSesion, validarUsuario, reglaContrasena } from '@/lib/validaciones'
import { agruparPermisos, exigirPermiso, nombreRol, normalizarPermisos, puede as puedeRol } from '@/lib/permisos'
import { MINUTOS_INACTIVIDAD, olvidarActividad, registrarActividad, sesionVencida } from '@/lib/inactividad'

const CLAVE_AVISO = 'britnymax:aviso-login'

/** Mensaje de un solo uso para mostrar en la pantalla de acceso. */
function dejarAviso(mensaje) {
  try {
    sessionStorage.setItem(CLAVE_AVISO, mensaje)
  } catch {
    /* sin almacenamiento */
  }
}

export function tomarAviso() {
  try {
    const m = sessionStorage.getItem(CLAVE_AVISO)
    sessionStorage.removeItem(CLAVE_AVISO)
    return m
  } catch {
    return null
  }
}


export const AVISO_INACTIVIDAD = `Tu sesión se cerró tras ${MINUTOS_INACTIVIDAD} minutos de inactividad. Ingresa de nuevo.`

/** Cada cuánto se vuelven a leer los permisos al navegar (cambios que hizo el administrador). */
const REFRESCO_PERMISOS_MS = 30_000

// RF01 – Autenticación de usuario · RNF02 – Seguridad.
export const useAuthStore = defineStore('auth', {
  state: () => ({ usuario: null, verificado: false, permisos: null, permisosLeidos: 0 }),

  getters: {
    rol: (s) => s.usuario?.rol ?? null,
    nombreRol: (s) => nombreRol(s.usuario?.rol),
    /** puede('ventas.anular') → true/false según el nivel y los permisos que asignó el administrador. */
    puede: (s) => (permiso) => puedeRol(s.usuario?.rol, permiso, s.permisos),
  },

  actions: {
    /** Lee la matriz de permisos; si falla, se conserva la anterior (la base de datos igual los exige). */
    async cargarPermisos() {
      if (!this.usuario) return
      try {
        this.permisos = agruparPermisos(await backend.obtenerPermisos())
        this.permisosLeidos = Date.now()
      } catch {
        /* sin conexión: se usa la última matriz conocida */
      }
    },

    /** Al navegar: aplica los cambios del administrador sin tener que cerrar sesión. */
    async refrescarPermisos() {
      if (this.usuario && Date.now() - this.permisosLeidos > REFRESCO_PERMISOS_MS) await this.cargarPermisos()
    },

    async verificar() {
      if (!this.verificado) {
        try {
          const u = await backend.sesionActual()
          if (u && sesionVencida()) {
            // La sesión quedó abierta pero sin actividad: se cierra antes de mostrar datos.
            await backend.cerrarSesion().catch(() => {})
            olvidarActividad()
            dejarAviso(AVISO_INACTIVIDAD)
            this.usuario = null
          } else {
            this.usuario = u
            await this.cargarPermisos()
          }
        } catch {
          this.usuario = null
        }
        this.verificado = true
      }
      return this.usuario
    },

    async iniciarSesion(usuario, contrasena) {
      exigirValido(validarInicioSesion(usuario, contrasena))
      this.usuario = await backend.iniciarSesion(usuario.trim(), contrasena)
      this.verificado = true
      await this.cargarPermisos()
      registrarActividad()
    },

    /** Limpia el estado local (también cuando la sesión vence en Supabase). */
    sesionTerminada() {
      this.usuario = null
      this.permisos = null
      this.permisosLeidos = 0
      olvidarActividad()
      useTiendaStore().$reset()
    },

    async cerrarSesion(motivo) {
      try {
        await backend.cerrarSesion()
      } finally {
        this.sesionTerminada()
        if (motivo === 'inactividad') dejarAviso(AVISO_INACTIVIDAD)
      }
    },

    async cambiarContrasena(datos) {
      exigirValido(validarCambioContrasena(datos))
      await backend.cambiarContrasena(datos.actual, datos.nueva)
    },

    // ── Gestión de usuarios (nivel 1: administrador) ────────────────────

    async listarUsuarios() {
      exigirPermiso(this.rol, 'usuarios.gestionar')
      return backend.listarUsuarios()
    },

    async guardarUsuario(datos, usuarios) {
      exigirPermiso(this.rol, 'usuarios.gestionar')
      exigirValido(validarUsuario(datos, { usuarios, modo: backend.modo }))
      if (datos.id === this.usuario?.id && (datos.rol !== this.rol || datos.activo === false)) {
        throw new Error('No puedes cambiar tu propio nivel de acceso ni desactivarte')
      }
      return backend.guardarUsuario({
        ...datos,
        nombre: datos.nombre.trim(),
        usuario: datos.usuario?.trim().toLowerCase(),
        correo: datos.correo?.trim().toLowerCase(),
      })
    },

    /** El administrador pone y quita permisos a los niveles 2 a 4. */
    async guardarPermisos(lista) {
      exigirPermiso(this.rol, 'usuarios.gestionar')
      const limpia = normalizarPermisos(lista)
      await backend.guardarPermisos(limpia)
      this.permisos = agruparPermisos(limpia)
      this.permisosLeidos = Date.now()
    },

    async restablecerContrasena(id, nueva) {
      exigirPermiso(this.rol, 'usuarios.gestionar')
      const error = reglaContrasena(nueva, 'la nueva contraseña')
      if (error) throw new Error(error)
      return backend.restablecerContrasena(id, nueva)
    },
  },
})
