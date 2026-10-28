import { defineStore } from 'pinia'

let siguienteId = 1

// Notificaciones (toasts) y diálogo de confirmación globales.
export const useUiStore = defineStore('ui', {
  state: () => ({ toasts: [], confirmacion: null }),
  actions: {
    notificar(mensaje, tipo = 'exito', duracion = 3500) {
      const id = siguienteId++
      this.toasts.push({ id, mensaje, tipo })
      setTimeout(() => this.cerrarToast(id), duracion)
    },
    exito(mensaje) {
      this.notificar(mensaje, 'exito')
    },
    error(error) {
      this.notificar(error?.message ?? String(error), 'error', 6000)
    },
    info(mensaje) {
      this.notificar(mensaje, 'info', 4500)
    },
    cerrarToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
    /** @returns {Promise<boolean>} */
    confirmar({ titulo, mensaje, textoConfirmar = 'Confirmar', peligro = false }) {
      this.confirmacion?.resolver(false)
      return new Promise((resolver) => {
        this.confirmacion = { titulo, mensaje, textoConfirmar, peligro, resolver }
      })
    },
    responder(valor) {
      this.confirmacion?.resolver(valor)
      this.confirmacion = null
    },
  },
})
