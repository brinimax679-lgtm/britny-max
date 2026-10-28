// Elige dónde se guarda la información: Supabase si el archivo .env tiene
// credenciales válidas, o el navegador solo en modo demo (npm run dev:demo).
// Con credenciales incorrectas la app muestra el error (ver App.vue).

import local from './localBackend.js'
import { usarSupabase } from './configuracion.js'

export { errorConfiguracion } from './configuracion.js'

const backend = usarSupabase ? (await import('./supabaseBackend.js')).default : local

export default backend
