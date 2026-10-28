// Niveles de seguridad, cierre por inactividad y protección de las URL.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, PERMISOS, puede, exigirPermiso, nombreRol } from '../src/lib/permisos.js'
import { LIMITE_MS, MINUTOS_INACTIVIDAD, tiempoRestante, sesionVencida } from '../src/lib/inactividad.js'
import { urlSinTokens, rutaInternaSegura, consultaConTokens } from '../src/lib/url-segura.js'
import { validarUsuario } from '../src/lib/validaciones.js'

// Almacenamiento del navegador simulado para el modo demo.
class Almacen {
  #datos = new Map()
  getItem(k) { return this.#datos.has(k) ? this.#datos.get(k) : null }
  setItem(k, v) { this.#datos.set(k, String(v)) }
  removeItem(k) { this.#datos.delete(k) }
  clear() { this.#datos.clear() }
  key(i) { return [...this.#datos.keys()][i] ?? null }
  get length() { return this.#datos.size }
}

// ── Niveles ───────────────────────────────────────────────────────────────

test('hay exactamente 4 niveles, numerados del 1 al 4', () => {
  assert.deepEqual(ROLES.map((r) => [r.nivel, r.id]), [[1, 'administrador'], [2, 'supervisor'], [3, 'cajero'], [4, 'consulta']])
})

test('matriz de permisos', () => {
  const tabla = (permiso) => ROLES.map((r) => puede(r.id, permiso))
  //                                         admin  super  cajero consulta
  assert.deepEqual(tabla('inventario.ver'), [true, true, true, true])
  assert.deepEqual(tabla('inventario.editar'), [true, true, false, false])
  assert.deepEqual(tabla('ventas.registrar'), [true, true, true, false])
  assert.deepEqual(tabla('ventas.anular'), [true, true, false, false])
  assert.deepEqual(tabla('finanzas.ver'), [true, true, false, true])
  assert.deepEqual(tabla('finanzas.editar'), [true, true, false, false])
  assert.deepEqual(tabla('reportes.ver'), [true, true, false, true])
  assert.deepEqual(tabla('respaldo.restaurar'), [true, false, false, false])
  assert.deepEqual(tabla('usuarios.gestionar'), [true, false, false, false])
  // El administrador puede todo; consulta nunca modifica nada.
  for (const permiso of Object.keys(PERMISOS)) assert.ok(puede('administrador', permiso), permiso)
  for (const permiso of Object.keys(PERMISOS).filter((p) => !/ver$/.test(p))) assert.equal(puede('consulta', permiso), false, permiso)
})

test('permisos desconocidos o sin nivel se niegan', () => {
  assert.equal(puede('administrador', 'algo.inventado'), false)
  assert.equal(puede(null, 'inventario.ver'), false)
  assert.equal(puede('jefe', 'inventario.ver'), false)
  assert.throws(() => exigirPermiso('cajero', 'ventas.anular'), /nivel de acceso \(Cajero\)/)
  assert.equal(nombreRol('x'), 'Sin nivel')
})

// ── Inactividad ───────────────────────────────────────────────────────────

test('la sesión vence a los 5 minutos sin actividad', () => {
  assert.equal(MINUTOS_INACTIVIDAD, 5)
  const t0 = 1_000_000
  assert.equal(tiempoRestante(t0 + 60_000, t0), LIMITE_MS - 60_000)
  assert.equal(sesionVencida(t0 + LIMITE_MS - 1, t0), false)
  assert.equal(sesionVencida(t0 + LIMITE_MS, t0), true)
  assert.equal(sesionVencida(t0 + 3 * 3_600_000, t0), true, 'también si el equipo estuvo suspendido')
  assert.equal(sesionVencida(t0, 0), true, 'sin registro de actividad se considera vencida')
})

// ── URL ───────────────────────────────────────────────────────────────────

test('quita tokens de la consulta y del fragmento de la URL', () => {
  assert.equal(urlSinTokens('http://localhost:4173/reportes?tab=ventas'), null, 'una URL limpia no se toca')
  assert.equal(urlSinTokens('http://localhost:4173/?access_token=abc&tab=x'), '/?tab=x')
  assert.equal(urlSinTokens('http://localhost:4173/#access_token=abc&refresh_token=def&type=recovery'), '/')
  assert.equal(urlSinTokens('http://localhost:4173/login?code=123'), '/login')
  assert.equal(urlSinTokens('http://localhost:4173/?Password=1234'), '/', 'sin importar mayúsculas')
  assert.equal(consultaConTokens({ tab: 'ventas' }), false)
  assert.equal(consultaConTokens({ token: 'x' }), true)
})

test('solo redirige a rutas internas después del login', () => {
  assert.equal(rutaInternaSegura('/productos'), '/productos')
  assert.equal(rutaInternaSegura('/reportes?tab=ventas'), '/reportes?tab=ventas')
  assert.equal(rutaInternaSegura('https://otro-sitio.com'), '/')
  assert.equal(rutaInternaSegura('//otro-sitio.com/robar'), '/')
  assert.equal(rutaInternaSegura('/\\otro-sitio.com'), '/')
  assert.equal(rutaInternaSegura('javascript:alert(1)'), '/')
  assert.equal(rutaInternaSegura(undefined), '/')
})

// ── Usuarios ──────────────────────────────────────────────────────────────

test('validación de usuarios', () => {
  const base = { nombre: 'Laura Gómez', rol: 'cajero' }
  assert.deepEqual(validarUsuario({ ...base, usuario: 'laura', contrasena: 'Caja2026x' }), {})
  assert.match(validarUsuario({ ...base, rol: 'jefe', usuario: 'laura', contrasena: 'Caja2026x' }).rol, /nivel/)
  assert.match(validarUsuario({ ...base, usuario: 'Laura Gómez', contrasena: 'Caja2026x' }).usuario, /letras/)
  assert.match(validarUsuario({ ...base, usuario: 'laura', contrasena: 'corta1' }).contrasena, /8 caracteres/)
  assert.match(validarUsuario({ ...base, usuario: 'admin', contrasena: 'Caja2026x' }, { usuarios: [{ usuario: 'admin' }] }).usuario, /ya existe/)
  assert.deepEqual(validarUsuario({ ...base, correo: 'laura@correo.com' }, { modo: 'supabase' }), {})
  assert.match(validarUsuario({ ...base, correo: 'laura' }, { modo: 'supabase' }).correo, /no es válido/)
  assert.deepEqual(validarUsuario({ id: 'u1', ...base }), {}, 'al editar no pide usuario ni contraseña')
})

// ── Modo demo: aplica los mismos niveles que la base de datos ────────────

let backend
before(async () => {
  globalThis.localStorage = new Almacen()
  globalThis.sessionStorage = new Almacen()
  backend = (await import('../src/services/localBackend.js')).default
})
beforeEach(async () => {
  await backend.cerrarSesion()
})

test('modo demo: crea una cuenta de ejemplo por nivel', async () => {
  for (const [usuario, clave, rol] of [
    ['admin', 'britny2026', 'administrador'],
    ['supervisor', 'super2026', 'supervisor'],
    ['cajero', 'cajero2026', 'cajero'],
    ['consulta', 'consulta2026', 'consulta'],
  ]) {
    const u = await backend.iniciarSesion(usuario, clave)
    assert.equal(u.rol, rol)
  }
  assert.equal(globalThis.localStorage.getItem('britnymax:sesion'), null, 'la sesión no queda guardada de forma permanente')
})

test('modo demo: el cajero vende pero no ve finanzas ni edita', async () => {
  await backend.iniciarSesion('cajero', 'cajero2026')
  const datos = await backend.cargarTodo()
  assert.equal(datos.ingresos.length, 0)
  assert.equal(datos.egresos.length, 0)
  const producto = datos.productos.find((p) => p.activo !== false && p.cantidad > 0)
  await backend.registrarVenta({ items: [{ producto_id: producto.id, cantidad: 1, precio_unitario: producto.precio_venta }] })
  await assert.rejects(backend.guardarProducto({ ...producto, nombre: 'Cambiado' }), /nivel de acceso \(Cajero\)/)
  await assert.rejects(backend.guardarFinanza('egreso', { fecha: '2026-01-01', concepto: 'Gasto', monto: 100, tipo: 'otros' }), /nivel de acceso/)
  await assert.rejects(backend.listarUsuarios(), /nivel de acceso/)
})

test('modo demo: consulta ve finanzas pero no modifica', async () => {
  await backend.iniciarSesion('consulta', 'consulta2026')
  const datos = await backend.cargarTodo()
  assert.ok(datos.ingresos.length > 0)
  const producto = datos.productos.find((p) => p.activo !== false && p.cantidad > 0)
  await assert.rejects(backend.registrarVenta({ items: [{ producto_id: producto.id, cantidad: 1 }] }), /nivel de acceso \(Consulta\)/)
  await assert.rejects(backend.restablecer(true), /nivel de acceso/)
})

test('modo demo: sin sesión no se opera', async () => {
  await assert.rejects(backend.cargarTodo(), /sesión terminó/)
  await assert.rejects(backend.eliminarProducto('x'), /sesión terminó/)
})

test('modo demo: el administrador gestiona usuarios con protecciones', async () => {
  const yo = await backend.iniciarSesion('admin', 'britny2026')
  const nuevo = await backend.guardarUsuario({ usuario: 'laura', nombre: 'Laura', rol: 'cajero', contrasena: 'Caja2026x' })
  assert.equal(nuevo.rol, 'cajero')
  await assert.rejects(backend.guardarUsuario({ usuario: 'laura', nombre: 'Otra', rol: 'cajero', contrasena: 'Caja2026x' }), /ya existe/)
  await backend.guardarUsuario({ id: nuevo.id, nombre: 'Laura', rol: 'supervisor', activo: false })
  await assert.rejects(backend.iniciarSesion('laura', 'Caja2026x'), /desactivado/)
  await backend.iniciarSesion('admin', 'britny2026')
  await assert.rejects(backend.guardarUsuario({ id: yo.id, nombre: yo.nombre, rol: 'cajero', activo: true }), /propio nivel/)
  await assert.rejects(backend.guardarUsuario({ id: yo.id, nombre: yo.nombre, rol: 'administrador', activo: false }), /desactivarte/)
  await backend.restablecerContrasena(nuevo.id, 'Nueva2026x')
  const lista = await backend.listarUsuarios()
  assert.ok(lista.every((u) => !('hash' in u) && !('sal' in u)), 'nunca expone hashes ni sales')
})
