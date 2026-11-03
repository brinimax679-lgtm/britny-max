// Cierre automático de sesión por inactividad (RNF02).
// La última actividad se guarda con hora real (no con temporizadores), así el
// cierre también ocurre si el computador se suspende o la pestaña queda oculta.
// Vive en sessionStorage: nada queda guardado en el equipo al cerrar el navegador.

export const MINUTOS_INACTIVIDAD = 5
export const SEGUNDOS_AVISO = 30
export const LIMITE_MS = MINUTOS_INACTIVIDAD * 60_000

const CLAVE = 'britnymax:ultima-actividad'

export function registrarActividad(ahora = Date.now()) {
  try {
    sessionStorage.setItem(CLAVE, String(ahora))
  } catch {
    /* sin almacenamiento: el temporizador de la pestaña sigue funcionando */
  }
}

export function ultimaActividad() {
  try {
    return Number(sessionStorage.getItem(CLAVE)) || 0
  } catch {
    return 0
  }
}

export function olvidarActividad() {
  try {
    sessionStorage.removeItem(CLAVE)
  } catch {
    /* nada que limpiar */
  }
}

/** Milisegundos que faltan para el cierre (negativo si ya venció; null si no hay registro). */
export function tiempoRestante(ahora = Date.now(), ultima = ultimaActividad()) {
  if (!ultima) return null
  return LIMITE_MS - (ahora - ultima)
}

/** Una sesión sin registro de actividad se considera vencida (no se puede saber cuándo se usó). */
export function sesionVencida(ahora = Date.now(), ultima = ultimaActividad()) {
  const restante = tiempoRestante(ahora, ultima)
  return restante === null || restante <= 0
}
