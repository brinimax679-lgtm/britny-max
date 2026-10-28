// Protección de las URL: ningún token, contraseña ni identificador interno debe
// quedar en la barra de direcciones, el historial del navegador o el encabezado
// Referer. Las pantallas que necesitan un id lo reciben por el estado del
// historial (history.state), que no se muestra ni se comparte.

/** Parámetros que nunca deben permanecer en una URL de la aplicación. */
export const PARAMETROS_SENSIBLES = Object.freeze([
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'id_token',
  'token',
  'token_hash',
  'code',
  'expires_at',
  'expires_in',
  'token_type',
  'type',
  'error',
  'error_code',
  'error_description',
  'apikey',
  'password',
  'contrasena',
])

const esSensible = (clave) => PARAMETROS_SENSIBLES.includes(clave.toLowerCase())

/**
 * Devuelve la ruta sin parámetros sensibles (en la consulta o en el fragmento #),
 * o null si la URL ya estaba limpia.
 */
export function urlSinTokens(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  let cambio = false
  for (const clave of [...url.searchParams.keys()]) {
    if (esSensible(clave)) {
      url.searchParams.delete(clave)
      cambio = true
    }
  }
  if (url.hash.length > 1) {
    const fragmento = new URLSearchParams(url.hash.slice(1))
    if ([...fragmento.keys()].some(esSensible)) {
      url.hash = ''
      cambio = true
    }
  }
  return cambio ? url.pathname + url.search + url.hash : null
}

/** Quita de la barra de direcciones cualquier token, sin recargar la página. */
export function limpiarUrlSensible(ventana = globalThis.window) {
  if (!ventana?.location) return false
  const limpia = urlSinTokens(ventana.location.href)
  if (limpia === null) return false
  ventana.history.replaceState(ventana.history.state, '', limpia)
  return true
}

/** ¿La consulta de una ruta trae parámetros sensibles? */
export const consultaConTokens = (query = {}) => Object.keys(query).some(esSensible)

/** ¿El fragmento (#...) trae parámetros sensibles, como en los enlaces de correo de Supabase? */
export function fragmentoConTokens(hash = '') {
  const texto = hash.replace(/^#/, '')
  return Boolean(texto) && [...new URLSearchParams(texto).keys()].some(esSensible)
}

/**
 * Acepta solo rutas internas de la aplicación para redirigir después del
 * inicio de sesión (evita redirecciones abiertas a otros sitios).
 */
export function rutaInternaSegura(valor) {
  if (typeof valor !== 'string' || !valor.startsWith('/')) return '/'
  if (valor.startsWith('//') || valor.startsWith('/\\') || /[\u0000-\u001f\\]/.test(valor)) return '/'
  try {
    const url = new URL(valor, 'http://britnymax.local')
    if (url.origin !== 'http://britnymax.local') return '/'
    return url.pathname + url.search
  } catch {
    return '/'
  }
}
