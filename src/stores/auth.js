import { defineStore } from 'pinia'
import backend from '@/services'
import { useTiendaStore } from './tienda'
import { exigirValido, validarCambioContrasena, validarInicioSesion, validarUsuario, reglaContrasena } from '@/lib/validaciones'
import { exigirPermiso, nombreRol, puede as puedeRol } from '@/lib/permisos'
import { MINUTOS_INACTIVIDAD, olvidarActividad, registrarActividad, sesionVencida } from '@/lib/inactividad'

const CLAVE_AVISO = 'britnymax:aviso-login'
const CLAVE_USUARIO = 'britnymax:usuario-recordado'

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

/** Solo se recuerda el nombre de usuario, nunca la contraseña ni el token. */
export function usuarioRecordado() {
  try {
    return localStorage.getItem(CLAVE_USUARIO) ?? ''
  } catch {
    return ''
  }
}

export const AVISO_INACTIVIDAD = `Tu sesión se cerró tras ${MINUTOS_INACTIVIDAD} minutos de inactividad. Ingresa de nuevo.`

// RF01 – Autenticación de usuario · RNF02 – Seguridad.
export const useAuthStore = defineStore('auth', {
  state: () => ({ usuario: null, verificado: false }),

  getters: {
    rol: (s) => s.usuario?.rol ?? null,
    nombreRol: (s) => nombreRol(s.usuario?.rol),
    /** puede('ventas.anular') → true/false según el nivel del usuario. */
    puede: (s) => (permiso) => puedeRol(s.usuario?.rol, permiso),
  },

  actions: {
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
          }
        } catch {
          this.usuario = null
        }
        this.verificado = true
      }
      return this.usuario
    },

    async iniciarSesion(usuario, contrasena, recordarUsuario) {
      exigirValido(validarInicioSesion(usuario, contrasena))
      this.usuario = await backend.iniciarSesion(usuario.trim(), contrasena)
      this.verificado = true
      registrarActividad()
      try {
        if (recordarUsuario) localStorage.setItem(CLAVE_USUARIO, usuario.trim())
        else localStorage.removeItem(CLAVE_USUARIO)
      } catch {
        /* sin almacenamiento */
      }
    },

    /** Limpia el estado local (también cuando la sesión vence en Supabase). */
    sesionTerminada() {
      this.usuario = null
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

    async restablecerContrasena(id, nueva) {
      exigirPermiso(this.rol, 'usuarios.gestionar')
      const error = reglaContrasena(nueva, 'la nueva contraseña')
      if (error) throw new Error(error)
      return backend.restablecerContrasena(id, nueva)
    },
  },
})
