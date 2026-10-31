// Modo producción: PostgreSQL gestionado con Supabase (RNF08, RNF09).
// Las operaciones que afectan existencias se ejecutan con funciones SQL
// transaccionales definidas en supabase/schema.sql (RNF07).

import { createClient } from '@supabase/supabase-js'
import { configuracion } from './configuracion.js'

// Los tokens de sesión viven solo en sessionStorage: desaparecen al cerrar el
// navegador y nunca quedan guardados de forma permanente en el equipo.
// Se borran también los que pudieran quedar de versiones anteriores.
try {
  for (const clave of Object.keys(localStorage)) {
    if (clave.startsWith('sb-') || clave === 'britnymax:recordar') localStorage.removeItem(clave)
  }
} catch {
  /* sin almacenamiento persistente */
}

const sb = createClient(configuracion.url, configuracion.clave, {
  auth: {
    storage: globalThis.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    // La app solo inicia sesión con usuario y contraseña: nunca acepta tokens
    // que lleguen en la URL (evita que queden en el historial o se filtren).
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

// Mensajes para cada restricción de supabase/schema.sql.
const RESTRICCIONES = {
  categorias_nombre_unico: 'Ya existe una categoría con ese nombre',
  categorias_nombre_longitud: 'El nombre de la categoría debe tener entre 2 y 60 caracteres',
  categorias_descripcion_longitud: 'La descripción admite máximo 120 caracteres',
  productos_nombre_longitud: 'El nombre del producto debe tener entre 2 y 120 caracteres',
  productos_codigo_formato: 'El código de barras debe tener entre 4 y 40 letras, números o guiones',
  productos_codigo_unico: 'Ya existe un producto con ese código de barras',
  productos_precio_compra_rango: 'El precio de compra no es válido',
  productos_precio_venta_rango: 'El precio de venta debe ser mayor que cero',
  productos_cantidad_rango: 'Las existencias superarían el máximo permitido',
  productos_stock_minimo_rango: 'El stock mínimo no es válido',
  ingresos_concepto_longitud: 'El concepto debe tener entre 3 y 140 caracteres',
  egresos_concepto_longitud: 'El concepto debe tener entre 3 y 140 caracteres',
  ingresos_monto_rango: 'El monto debe ser mayor que cero',
  egresos_monto_rango: 'El monto debe ser mayor que cero',
  ingresos_fecha_minima: 'La fecha es demasiado antigua',
  egresos_fecha_minima: 'La fecha es demasiado antigua',
  ingresos_tipo_valido: 'Selecciona un tipo de ingreso válido',
  egresos_tipo_valido: 'Selecciona un tipo de egreso válido',
}

let alExpirar = () => {}

function traducir(error) {
  const m = error?.message || ''
  const restriccion = /constraint "([^"]+)"/.exec(`${m} ${error?.details ?? ''}`)?.[1]
  if (restriccion && RESTRICCIONES[restriccion]) return new Error(RESTRICCIONES[restriccion])
  if (error?.code === '23505') return new Error('Ya existe un registro con esos datos')
  if (error?.code === '23503') return new Error('El registro está relacionado con otros datos y no se puede modificar así')
  if (error?.code === '23514' || error?.code === '23502') return new Error('Algún dato no cumple las reglas del sistema. Revisa el formulario')
  if (/Invalid login credentials/i.test(m)) return new Error('Usuario o contraseña incorrectos')
  if (/Email not confirmed/i.test(m)) return new Error('El correo del usuario aún no está confirmado en Supabase')
  if (/rate limit|too many requests/i.test(m)) return new Error('Demasiados intentos. Espera un momento e inténtalo de nuevo')
  if (/JWT expired|invalid JWT|PGRST30[13]/i.test(`${m} ${error?.code}`)) {
    alExpirar()
    return new Error('Tu sesión expiró. Inicia sesión de nuevo')
  }
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(m)) {
    return new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo')
  }
  if (error?.code === 'PGRST202' || error?.code === '42P01' || error?.code === '42883') {
    return new Error('La base de datos no está configurada: ejecuta supabase/schema.sql en el SQL Editor de Supabase')
  }
  if (error?.code === '42501' || /row-level security|permission denied/i.test(m)) {
    return new Error(/autorizado|nivel de acceso/.test(m) ? m : 'Tu nivel de acceso no permite esta operación')
  }
  return new Error(m || 'Ocurrió un error inesperado')
}

function revisar({ data, error }) {
  if (error) throw traducir(error)
  return data
}

/** Lee todas las filas de una tabla en bloques de 1000 (límite de PostgREST). */
async function todo(tabla, orden, select = '*') {
  const filas = []
  const paso = 1000
  for (let desde = 0; ; desde += paso) {
    const data = revisar(await sb.from(tabla).select(select).order(orden).order('id').range(desde, desde + paso - 1))
    filas.push(...data)
    if (data.length < paso) return filas
  }
}

const aCorreo = (usuario) => {
  const u = usuario.trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${configuracion.dominio}`
}

/** El usuario debe existir y estar activo en public.usuarios (RNF02). */
async function perfilAutorizado(user) {
  const { data, error } = await sb.from('usuarios').select('nombre, rol, activo').eq('id', user.id).maybeSingle()
  if (error) throw traducir(error)
  if (!data?.activo) {
    await sb.auth.signOut()
    throw new Error('Tu usuario no está autorizado para usar Britny Max. Pide a la administradora que lo habilite.')
  }
  return { id: user.id, usuario: user.email, nombre: data.nombre, rol: data.rol }
}

const tablaFinanza = (clase) => (clase === 'ingreso' ? 'ingresos' : 'egresos')

export default {
  modo: 'supabase',

  alCerrarSesion(callback) {
    alExpirar = callback
    sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') callback()
    })
  },

  async sesionActual() {
    const { data } = await sb.auth.getSession()
    if (!data.session?.user) return null
    try {
      return await perfilAutorizado(data.session.user)
    } catch {
      return null
    }
  },

  async iniciarSesion(usuario, contrasena) {
    const data = revisar(await sb.auth.signInWithPassword({ email: aCorreo(usuario), password: contrasena }))
    return perfilAutorizado(data.user)
  },

  /** Revoca en el servidor el token de esta sesión (no cierra otros dispositivos). */
  async cerrarSesion() {
    await sb.auth.signOut({ scope: 'local' })
  },

  async cambiarContrasena(actual, nueva) {
    const { data } = await sb.auth.getUser()
    const correo = data.user?.email
    const verificacion = await sb.auth.signInWithPassword({ email: correo, password: actual })
    if (verificacion.error) throw new Error('La contraseña actual no es correcta')
    revisar(await sb.auth.updateUser({ password: nueva }))
  },

  async cargarTodo() {
    const [categorias, productos, ventas, movimientos, ingresos, egresos] = await Promise.all([
      todo('categorias', 'nombre'),
      todo('productos', 'creado_en'),
      todo('ventas', 'fecha', '*, detalles:detalle_venta(*)'),
      todo('movimientos_inventario', 'fecha'),
      todo('ingresos', 'fecha'),
      todo('egresos', 'fecha'),
    ])
    return { categorias, productos, ventas, movimientos, ingresos, egresos }
  },

  async guardarCategoria({ id, nombre, descripcion }) {
    const fila = { nombre, descripcion: descripcion || '' }
    const consulta = id ? sb.from('categorias').update(fila).eq('id', id) : sb.from('categorias').insert(fila)
    return revisar(await consulta.select().single())
  },

  async eliminarCategoria(id) {
    revisar(await sb.from('categorias').delete().eq('id', id))
  },

  async guardarProducto(datos) {
    const fila = {
      nombre: datos.nombre,
      codigo_barras: datos.codigo_barras || null,
      categoria_id: datos.categoria_id,
      precio_compra: datos.precio_compra,
      precio_venta: datos.precio_venta,
      stock_minimo: datos.stock_minimo,
    }
    if (datos.id) {
      return revisar(await sb.from('productos').update(fila).eq('id', datos.id).select().single())
    }
    const id = revisar(await sb.rpc('crear_producto', { p_producto: { ...fila, cantidad: datos.cantidad } }))
    return { id, ...fila }
  },

  async eliminarProducto(id) {
    revisar(await sb.from('productos').update({ activo: false }).eq('id', id))
  },

  async registrarVenta({ fecha, items }) {
    const id = revisar(await sb.rpc('registrar_venta', { p_fecha: fecha || null, p_items: items }))
    return { id }
  },

  async anularVenta(id) {
    revisar(await sb.rpc('anular_venta', { p_venta: id }))
  },

  async registrarEntrada({ fecha, concepto, items, registrarEgreso, actualizarPrecio }) {
    const referencia = revisar(
      await sb.rpc('registrar_entrada', {
        p_fecha: fecha || null,
        p_concepto: concepto || '',
        p_items: items,
        p_registrar_egreso: Boolean(registrarEgreso),
        p_actualizar_precio: Boolean(actualizarPrecio),
      }),
    )
    return { referencia }
  },

  async ajustarInventario({ fecha, motivo, items }) {
    const ajustados = revisar(await sb.rpc('ajustar_inventario', { p_fecha: fecha || null, p_motivo: motivo || '', p_items: items }))
    return { ajustados }
  },

  async guardarFinanza(clase, { id, fecha, concepto, monto, tipo }) {
    const fila = { fecha, concepto, monto, tipo }
    const tabla = tablaFinanza(clase)
    const consulta = id ? sb.from(tabla).update(fila).eq('id', id) : sb.from(tabla).insert(fila)
    const data = revisar(await consulta.select())
    if (!data?.length) throw new Error('No se pudo guardar: el registro no existe o no se puede modificar')
    return data[0]
  },

  async eliminarFinanza(clase, id) {
    const data = revisar(await sb.from(tablaFinanza(clase)).delete().eq('id', id).select('id'))
    if (!data?.length) throw new Error('No se pudo eliminar: el registro no existe o no se puede modificar')
  },

  // ── Permisos por nivel (tabla permisos_rol) ───────────────────────────

  async obtenerPermisos() {
    return revisar(await sb.from('permisos_rol').select('rol, permiso'))
  },

  /** Solo el administrador; guardar_permisos lo verifica y reemplaza la matriz completa. */
  async guardarPermisos(lista) {
    revisar(await sb.rpc('guardar_permisos', { p_permisos: lista }))
  },

  // ── Usuarios (solo administrador; las funciones SQL lo verifican) ─────

  async listarUsuarios() {
    return revisar(await sb.rpc('listar_usuarios'))
  },

  /** Nuevo: autoriza una cuenta ya creada en Supabase Auth. Existente: actualiza nombre, nivel y estado. */
  async guardarUsuario({ id, correo, nombre, rol, activo }) {
    if (!id) {
      const nuevoId = revisar(await sb.rpc('autorizar_usuario', { p_correo: correo, p_nombre: nombre, p_rol: rol }))
      return { id: nuevoId }
    }
    revisar(await sb.rpc('actualizar_usuario', { p_id: id, p_nombre: nombre, p_rol: rol, p_activo: activo !== false }))
    return { id }
  },

  async restablecerContrasena() {
    throw new Error('En Supabase, la contraseña de otra cuenta se restablece desde Authentication → Users')
  },

  /** Restaura tabla por tabla, en bloques, con la función importar_respaldo. */
  async importar(datos) {
    const orden = [
      ['categorias', datos.categorias],
      ['productos', datos.productos],
      ['ventas', datos.ventas.map(({ detalles, usuario_id, ...v }) => v)],
      ['detalle_venta', datos.ventas.flatMap((v) => v.detalles ?? [])],
      ['movimientos', datos.movimientos],
      ['ingresos', datos.ingresos.map(({ usuario_id, ...i }) => i)],
      ['egresos', datos.egresos.map(({ usuario_id, ...e }) => e)],
    ]
    for (const [tabla, filas] of orden) {
      for (let i = 0; i < filas.length; i += 500) {
        revisar(await sb.rpc('importar_respaldo', { p_tabla: tabla, p_filas: filas.slice(i, i + 500) }))
      }
    }
  },
}
