import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { validarConfiguracion } from './src/services/configuracion.js'

// Encabezados de seguridad para el servidor que usa iniciar-britny-max.bat
// (vite preview). Los mismos están en vercel.json para la publicación.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export const ENCABEZADOS_SEGURIDAD = {
  'Content-Security-Policy': CSP,
  // Ninguna URL de la aplicación se envía a otros sitios (Referer).
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig(({ command, mode }) => {
  // Una compilación de producción sin Supabase publicaría una app vacía:
  // se detiene aquí con el motivo (por ejemplo, variables faltantes en Vercel).
  if (command === 'build' && mode !== 'demo') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const error = validarConfiguracion(
      { url: env.VITE_SUPABASE_URL ?? '', clave: env.VITE_SUPABASE_ANON_KEY ?? '', dominio: env.VITE_AUTH_DOMAIN ?? '' },
      { permitirDemo: false },
    )
    if (error) throw new Error(`Britny Max no se puede compilar: ${error}`)
  }
  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    preview: { headers: ENCABEZADOS_SEGURIDAD },
  }
})
