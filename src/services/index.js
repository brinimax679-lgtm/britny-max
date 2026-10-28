// Elige dónde se guarda la información: Supabase si el archivo .env tiene
// credenciales válidas, o el navegador (modo demo) si no hay credenciales.
// Con credenciales incorrectas la app muestra el error (ver App.vue).

import local from './localBackend.js'
import { usarSupabase } from './configuracion.js'

export { errorConfiguracion } from './configuracion.js'

const backend = usarSupabase ? (await import('./supabaseBackend.js')).default : local

export default backend
