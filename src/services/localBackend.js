// Modo demo: toda la información se guarda en el navegador (localStorage).
// Expone la misma interfaz que supabaseBackend.js y aplica los mismos niveles
// de seguridad que las políticas de la base de datos.

import * as ops from './operaciones.js'
import { crearBaseDemo, baseVacia, crearUsuariosDemo, crearUsuarioLocal, USUARIOS_DEMO } from './seed.js'
import { uid, hashContrasena, nuevaSal } from '../lib/seguridad.js'
import { exigirPermiso, puede, rolValido } from '../lib/permisos.js'

const CLAVE_DB = 'britnymax:db:v1'
// La sesión vive solo en sessionStorage: se borra al cerrar el navegador.
const CLAVE_SESION = 'britnymax:sesion'
const COLECCIONES = ['categorias', 'productos', 'ventas', 'movimientos', 'ingresos', 'egresos']

function leer() {
  try {
    const raw = localStorage.getItem(CLAVE_DB)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function escribir(db) {
  try {
    localStorage.setItem(CLAVE_DB, JSON.stringify(db))
  } catch {
    throw new Error('No hay espacio suficiente en el navegador para guardar la información. Descarga un respaldo.')
  }
}

/** Actualiza bases creadas por versiones anteriores (una sola cuenta, sin niveles). */
function migrarUsuarios(db) {
  if (!db.usuarios?.length) {
    db.usuarios = crearUsuariosDemo()
    return true
  }
  let cambio = false
  for (const u of db.usuarios) {
    if (!rolValido(u.rol)) {
      u.rol = 'administrador'
      cambio = true
    }
    if (u.activo === undefined) {
      u.activo = true
      cambio = true
    }
  }
  if (db.usuarios.length === 1 && db.usuarios[0].usuario === USUARIOS_DEMO[0].usuario) {
    db.usuarios.push(...crearUsuariosDemo().slice(1))
    cambio = true
  }
  return cambio
}

function base() {
  let db = leer()
  if (!db) {
    db = crearBaseDemo()
    escribir(db)
  }
  if (migrarUsuarios(db)) escribir(db)
  return db
}

/** Ejecuta la operación sobre una copia y solo guarda si termina sin errores. */
function transaccion(fn) {
  const db = structuredClone(base())
  const resultado = fn(db)
  escribir(db)
  return resultado === undefined ? undefined : structuredClone(resultado)
}

function idSesion() {
  try {
    const raw = sessionStorage.getItem(CLAVE_SESION)
    return raw ? JSON.parse(raw).id : null
  } catch {
    return null
  }
}

/** Usuario de la sesión, solo si sigue existiendo y activo. */
function usuarioActual(db = base()) {
  const id = idSesion()
  return (id && db.usuarios.find((u) => u.id === id && u.activo !== false)) || null
}

/** Equivalente a las políticas de la base de datos: sin sesión válida o sin permiso, no se opera. */
function exigir(permiso) {
  const u = usuarioActual()
  if (!u) throw new Error('Tu sesión terminó. Inicia sesión de nuevo')
  exigirPermiso(u.rol, permiso)
  return u
}

const publico = (u) => ({
  id: u.id,
  usuario: u.usuario,
  nombre: u.nombre,
  rol: u.rol,
  activo: u.activo !== false,
  creado_en: u.creado_en ?? null,
})
const ahora = () => new Date().toISOString()

function protegerAdministradores(db, objetivo, cambios, actual) {
  if (objetivo.id === actual.id && (cambios.rol !== objetivo.rol || cambios.activo === false)) {
    throw new Error('No puedes cambiar tu propio nivel de acceso ni desactivarte')
  }
  const dejaDeSerAdmin = objetivo.rol === 'administrador' && objetivo.activo !== false &&
    (cambios.rol !== 'administrador' || cambios.activo === false)
  const adminsActivos = db.usuarios.filter((u) => u.rol === 'administrador' && u.activo !== false).length
  if (dejaDeSerAdmin && adminsActivos <= 1) throw new Error('Debe quedar al menos un administrador activo')
}

export default {
  modo: 'local',

  async sesionActual() {
    const u = usuarioActual()
    return u ? publico(u) : null
  },

  async iniciarSesion(usuario, contrasena) {
    const nombre = usuario.trim().toLowerCase()
    const u = base().usuarios.find((x) => x.usuario.toLowerCase() === nombre)
    if (!u || hashContrasena(contrasena, u.sal) !== u.hash) {
      throw new Error('Usuario o contraseña incorrectos')
    }
    if (u.activo === false) throw new Error('Tu usuario está desactivado. Pide a la administradora que lo habilite.')
    try {
      localStorage.removeItem(CLAVE_SESION) // sesiones de versiones anteriores
    } catch {
      /* sin almacenamiento persistente */
    }
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ id: u.id, inicio: ahora() }))
    return publico(u)
  },

  async cerrarSesion() {
    sessionStorage.removeItem(CLAVE_SESION)
    try {
      localStorage.removeItem(CLAVE_SESION)
    } catch {
      /* sin almacenamiento persistente */
    }
  },

  async cambiarContrasena(actual, nueva) {
    const id = idSesion()
    transaccion((db) => {
      const u = db.usuarios.find((x) => x.id === id)
      if (!u || hashContrasena(actual, u.sal) !== u.hash) throw new Error('La contraseña actual no es correcta')
      u.sal = nuevaSal()
      u.hash = hashContrasena(nueva, u.sal)
    })
  },

  async cargarTodo() {
    const db = base()
    const u = usuarioActual(db)
    if (!u) throw new Error('Tu sesión terminó. Inicia sesión de nuevo')
    const datos = structuredClone(Object.fromEntries(COLECCIONES.map((c) => [c, db[c] ?? []])))
    // Igual que las políticas de la base de datos: sin permiso, las finanzas llegan vacías.
    if (!puede(u.rol, 'finanzas.ver')) {
      datos.ingresos = []
      datos.egresos = []
    }
    return datos
  },

  async guardarCategoria(datos) {
    exigir('inventario.editar')
    return transaccion((db) => {
      const fila = { nombre: datos.nombre, descripcion: datos.descripcion || '' }
      if (db.categorias.some((c) => c.id !== datos.id && c.nombre.toLowerCase() === fila.nombre.toLowerCase())) {
        throw new Error('Ya existe una categoría con ese nombre')
      }
      if (datos.id) {
        const c = db.categorias.find((x) => x.id === datos.id)
        if (!c) throw new Error('Categoría no encontrada')
        return Object.assign(c, fila)
      }
      const c = { id: uid(), ...fila, creado_en: ahora() }
      db.categorias.push(c)
      return c
    })
  },

  async eliminarCategoria(id) {
    exigir('inventario.editar')
    transaccion((db) => {
      db.categorias = db.categorias.filter((c) => c.id !== id)
      for (const p of db.productos) if (p.categoria_id === id) p.categoria_id = null
    })
  },

  async guardarProducto(datos) {
    exigir('inventario.editar')
    return transaccion((db) => {
      const codigo = datos.codigo_barras?.trim() || null
      if (codigo && db.productos.some((p) => p.activo !== false && p.id !== datos.id && p.codigo_barras === codigo)) {
        throw new Error('Ya existe un producto con ese código de barras')
      }
      if (!datos.id) return ops.crearProducto(db, { ...datos, codigo_barras: codigo })
      const p = db.productos.find((x) => x.id === datos.id && x.activo !== false)
      if (!p) throw new Error('Producto no encontrado')
      return Object.assign(p, {
        nombre: datos.nombre,
        codigo_barras: codigo,
        categoria_id: datos.categoria_id || null,
        precio_compra: Number(datos.precio_compra) || 0,
        precio_venta: Number(datos.precio_venta) || 0,
        stock_minimo: Number(datos.stock_minimo) || 0,
      })
    })
  },

  async eliminarProducto(id) {
    exigir('inventario.editar')
    transaccion((db) => {
      const p = db.productos.find((x) => x.id === id)
      if (p) p.activo = false
    })
  },

  async registrarVenta(datos) {
    exigir('ventas.registrar')
    return transaccion((db) => ops.registrarVenta(db, datos))
  },

  async anularVenta(id) {
    exigir('ventas.anular')
    transaccion((db) => ops.anularVenta(db, id))
  },

  async registrarEntrada(datos) {
    exigir('inventario.entradas')
    return transaccion((db) => ops.registrarEntrada(db, datos))
  },

  async ajustarInventario(datos) {
    exigir('inventario.conteo')
    return transaccion((db) => ops.ajustarInventario(db, datos))
  },

  async guardarFinanza(clase, datos) {
    exigir('finanzas.editar')
    const coleccion = clase === 'ingreso' ? 'ingresos' : 'egresos'
    return transaccion((db) => {
      const fila = { fecha: datos.fecha, concepto: datos.concepto, monto: Number(datos.monto), tipo: datos.tipo }
      if (datos.id) {
        const r = db[coleccion].find((x) => x.id === datos.id)
        if (!r) throw new Error('Registro no encontrado')
        if (r.venta_id) throw new Error('Este ingreso fue generado por una venta; anula la venta para modificarlo')
        return Object.assign(r, fila)
      }
      const r = { id: uid(), ...fila, creado_en: ahora() }
      db[coleccion].push(r)
      return r
    })
  },

  async eliminarFinanza(clase, id) {
    exigir('finanzas.editar')
    const coleccion = clase === 'ingreso' ? 'ingresos' : 'egresos'
    transaccion((db) => {
      if (db[coleccion].find((x) => x.id === id)?.venta_id) {
        throw new Error('Este ingreso fue generado por una venta; anula la venta desde el historial')
      }
      db[coleccion] = db[coleccion].filter((x) => x.id !== id)
    })
  },

  async importar(datos) {
    exigir('respaldo.restaurar')
    transaccion((db) => {
      for (const c of COLECCIONES) db[c] = datos[c] ?? []
    })
  },

  async restablecer(conDatosDeEjemplo) {
    exigir('respaldo.restaurar')
    const usuarios = base().usuarios
    escribir(conDatosDeEjemplo ? crearBaseDemo(usuarios) : { ...baseVacia(), usuarios })
  },

  // ── Usuarios (solo administrador) ───────────────────────────────────────

  async listarUsuarios() {
    exigir('usuarios.gestionar')
    return base()
      .usuarios.map(publico)
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'))
  },

  async guardarUsuario(datos) {
    const actual = exigir('usuarios.gestionar')
    return transaccion((db) => {
      if (!datos.id) {
        if (db.usuarios.some((u) => u.usuario === datos.usuario.trim().toLowerCase())) {
          throw new Error('Ese usuario ya existe')
        }
        const nuevo = crearUsuarioLocal(datos)
        db.usuarios.push(nuevo)
        return publico(nuevo)
      }
      const u = db.usuarios.find((x) => x.id === datos.id)
      if (!u) throw new Error('Usuario no encontrado')
      const cambios = { nombre: datos.nombre.trim(), rol: datos.rol, activo: datos.activo !== false }
      protegerAdministradores(db, u, cambios, actual)
      return publico(Object.assign(u, cambios))
    })
  },

  async restablecerContrasena(id, nueva) {
    exigir('usuarios.gestionar')
    transaccion((db) => {
      const u = db.usuarios.find((x) => x.id === id)
      if (!u) throw new Error('Usuario no encontrado')
      u.sal = nuevaSal()
      u.hash = hashContrasena(nueva, u.sal)
    })
  },
}
