// Elige dónde se guarda la información: Supabase si el archivo .env tiene
// credenciales válidas, o el navegador solo en modo demo (npm run dev:demo).
// Con credenciales incorrectas la app muestra el error (ver App.vue).

import { usarSupabase } from './configuracion.js'

export { errorConfiguracion } from './configuracion.js'

// Cada backend se carga solo cuando se usa: la versión publicada no trae el
// código del modo demo (que es el único que guarda datos en localStorage).
const backend = usarSupabase
  ? (await import('./supabaseBackend.js')).default
  : (await import('./localBackend.js')).default

export default backend
