// Lee y valida las variables de entorno de Supabase (archivo .env).
// El modo demo (datos en el navegador) solo existe con `npm run dev:demo`;
// en cualquier otro caso, si faltan las variables o son incorrectas, se
// muestra un aviso en lugar de guardar datos en el navegador por error.

const entorno = import.meta.env ?? {}
export const MODO_DEMO = entorno.MODE === 'demo'
const leer = (nombre) => (entorno[nombre] ?? '').toString().trim()

function rolDeClave(clave) {
  try {
    const carga = clave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(carga)).role ?? ''
  } catch {
    return ''
  }
}

export function validarConfiguracion({ url, clave, dominio }, { permitirDemo = true } = {}) {
  if (!url && !clave) {
    return permitirDemo ? '' : 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY: la aplicación no está conectada a la base de datos.'
  }
  if (!url) return 'Falta VITE_SUPABASE_URL en el archivo .env'
  if (!clave) return 'Falta VITE_SUPABASE_ANON_KEY en el archivo .env'

  let direccion
  try {
    direccion = new URL(url)
  } catch {
    return 'VITE_SUPABASE_URL no es una dirección válida (ejemplo: https://abcd1234.supabase.co)'
  }
  const local = ['localhost', '127.0.0.1'].includes(direccion.hostname)
  if (direccion.protocol !== 'https:' && !local) return 'VITE_SUPABASE_URL debe empezar por https://'
  if (direccion.pathname !== '/' && direccion.pathname !== '') {
    return 'VITE_SUPABASE_URL debe ser solo la dirección del proyecto, sin /rest/v1 ni otras rutas'
  }

  if (clave.startsWith('sb_secret_') || rolDeClave(clave) === 'service_role') {
    return 'VITE_SUPABASE_ANON_KEY tiene la clave secreta (service_role). Usa la clave pública "anon" o "publishable": la secreta nunca debe ir en el navegador.'
  }
  const esJwt = clave.split('.').length === 3 && rolDeClave(clave) === 'anon'
  if (!esJwt && !clave.startsWith('sb_publishable_')) {
    return 'VITE_SUPABASE_ANON_KEY no es válida. Cópiala de Project Settings → API Keys (anon / publishable).'
  }
  if (dominio && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio)) return 'VITE_AUTH_DOMAIN no es un dominio válido (ejemplo: britnymax.app)'
  return ''
}

export const configuracion = {
  url: leer('VITE_SUPABASE_URL').replace(/\/+$/, ''),
  clave: leer('VITE_SUPABASE_ANON_KEY'),
  dominio: leer('VITE_AUTH_DOMAIN') || 'britnymax.app',
}

export const errorConfiguracion = validarConfiguracion(configuracion, { permitirDemo: MODO_DEMO })
export const usarSupabase = Boolean(configuracion.url && configuracion.clave) && !errorConfiguracion
