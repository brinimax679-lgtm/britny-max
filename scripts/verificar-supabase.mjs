// Verifica que el proyecto de Supabase quedó listo para Britny Max.
// No escribe datos: solo lee y llama las funciones con datos vacíos para
// confirmar que existen, que validan y que la seguridad está activa.
//
// Uso:  npm run verificar:supabase
// Opcional: VERIFICAR_USUARIO y VERIFICAR_CONTRASENA para no escribirlos.

import { readFileSync, existsSync } from 'node:fs'
import readline from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import { validarConfiguracion } from '../src/services/configuracion.js'

const ok = (t) => console.log(`  \x1b[32m✔\x1b[0m ${t}`)
const mal = (t) => { console.log(`  \x1b[31m✖\x1b[0m ${t}`); fallos++ }
const aviso = (t) => console.log(`  \x1b[33m!\x1b[0m ${t}`)
let fallos = 0

function leerEnv() {
  const valores = { ...process.env }
  for (const archivo of ['.env', '.env.local']) {
    if (!existsSync(archivo)) continue
    for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea)
      if (m && !linea.trim().startsWith('#')) valores[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return valores
}

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (oculto) {
      rl._writeToOutput = (s) => rl.output.write(s.startsWith(texto) ? texto : s.includes('\n') ? '\n' : '*')
    }
    rl.question(texto, (r) => {
      rl.close()
      if (oculto) process.stdout.write('\n')
      resolve(r.trim())
    })
  })
}

async function esperaError(promesa, patron, descripcion) {
  const { error } = await promesa
  if (error && patron.test(`${error.message} ${error.code}`)) ok(descripcion)
  else mal(`${descripcion} — respuesta inesperada: ${error ? error.message : 'sin error'}`)
}

const env = leerEnv()
const config = {
  url: (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
  clave: (env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  dominio: (env.VITE_AUTH_DOMAIN ?? '').trim() || 'britnymax.app',
}

console.log('\nBritny Max · verificación de Supabase\n')
console.log('1. Configuración (.env)')
const errorConfig = validarConfiguracion(config)
if (!config.url && !config.clave) {
  mal('No hay VITE_SUPABASE_URL ni VITE_SUPABASE_ANON_KEY. Copia .env.example como .env y complétalo.')
  process.exit(1)
}
if (errorConfig) {
  mal(errorConfig)
  process.exit(1)
}
ok(`Proyecto ${config.url}`)

const sb = createClient(config.url, config.clave, { auth: { persistSession: false, autoRefreshToken: false } })

console.log('\n2. Seguridad para visitantes sin sesión')
try {
  const r = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.clave } })
  const ajustes = await r.json()
  if (ajustes.disable_signup) ok('El registro público de usuarios está desactivado')
  else aviso('El registro público está ACTIVO: desactívalo en Authentication → Sign In / Providers → "Allow new users to sign up"')
} catch (e) {
  mal(`No se pudo conectar con Supabase: ${e.message}`)
  process.exit(1)
}

const anonimo = await sb.from('productos').select('id').limit(1)
if (anonimo.error && /42P01|PGRST205|does not exist|schema cache/i.test(`${anonimo.error.code} ${anonimo.error.message}`)) {
  mal('Las tablas no existen: ejecuta supabase/schema.sql en el SQL Editor')
  process.exit(1)
}
if (anonimo.error) ok('Un visitante anónimo no puede leer productos')
else mal('Un visitante anónimo PUEDE leer productos: vuelve a ejecutar supabase/schema.sql')
await esperaError(sb.rpc('registrar_venta', { p_fecha: null, p_items: [] }), /permission denied|42501/, 'Un visitante anónimo no puede registrar ventas')

console.log('\n3. Acceso de la administradora')
const usuario = env.VERIFICAR_USUARIO || (await preguntar('  Usuario o correo: '))
const contrasena = env.VERIFICAR_CONTRASENA || (await preguntar('  Contraseña: ', true))
const correo = usuario.includes('@') ? usuario.toLowerCase() : `${usuario.toLowerCase()}@${config.dominio}`
const sesion = await sb.auth.signInWithPassword({ email: correo, password: contrasena })
if (sesion.error) {
  mal(`No se pudo iniciar sesión con ${correo}: ${sesion.error.message}`)
  process.exit(1)
}
ok(`Sesión iniciada como ${correo}`)

const perfil = await sb.from('usuarios').select('nombre, rol, activo').eq('id', sesion.data.user.id).maybeSingle()
if (perfil.error) mal(`No se pudo leer public.usuarios: ${perfil.error.message}`)
else if (!perfil.data) mal('El usuario no está autorizado: agrega su fila en public.usuarios (ver README)')
else if (!perfil.data.activo) mal('El usuario está marcado como inactivo en public.usuarios')
else ok(`Autorizado: ${perfil.data.nombre} (${perfil.data.rol})`)

console.log('\n4. Tablas')
for (const tabla of ['categorias', 'productos', 'ventas', 'detalle_venta', 'movimientos_inventario', 'ingresos', 'egresos']) {
  const { count, error } = await sb.from(tabla).select('*', { count: 'exact', head: true })
  if (error) mal(`${tabla}: ${error.message}`)
  else ok(`${tabla}: ${count} registro(s)`)
}

console.log('\n5. Funciones y validaciones (sin guardar datos)')
await esperaError(sb.rpc('registrar_venta', { p_fecha: null, p_items: [] }), /no tiene productos/, 'registrar_venta valida que haya productos')
await esperaError(
  sb.rpc('registrar_entrada', { p_fecha: null, p_concepto: '', p_items: [], p_registrar_egreso: false, p_actualizar_precio: false }),
  /no tiene productos/,
  'registrar_entrada valida que haya productos',
)
await esperaError(sb.rpc('anular_venta', { p_venta: '00000000-0000-4000-8000-000000000000' }), /no encontrada/, 'anular_venta valida la venta')
await esperaError(sb.rpc('crear_producto', { p_producto: {} }), /Selecciona una categoría/, 'crear_producto valida la categoría')
await esperaError(
  sb.rpc('registrar_venta', { p_fecha: new Date(Date.now() + 86_400_000).toISOString(), p_items: [] }),
  /posterior a hoy/,
  'Las ventas no aceptan fechas futuras',
)
const ajuste = await sb.rpc('ajustar_inventario', { p_fecha: null, p_motivo: '', p_items: [] })
if (ajuste.error) mal(`ajustar_inventario: ${ajuste.error.message}`)
else ok('ajustar_inventario disponible')
const respaldo = await sb.rpc('importar_respaldo', { p_tabla: 'categorias', p_filas: [] })
if (respaldo.error) mal(`importar_respaldo: ${respaldo.error.message}`)
else ok('importar_respaldo disponible')
await esperaError(sb.from('ventas').insert({ total: 1 }), /row-level security|42501/, 'Las ventas solo se crean con registrar_venta')

await sb.auth.signOut()
console.log(fallos ? `\n\x1b[31m${fallos} verificación(es) fallaron.\x1b[0m\n` : '\n\x1b[32mTodo listo: la base de datos está configurada correctamente.\x1b[0m\n')
process.exit(fallos ? 1 : 0)
