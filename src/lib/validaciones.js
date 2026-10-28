// Reglas de validación compartidas por los formularios, el store y el modo demo.
// Los mismos límites están declarados como restricciones en supabase/schema.sql,
// de modo que la base de datos rechaza lo mismo que la interfaz (RNF07).

import { dinero, hoyISO, numero as formatoNumero } from './format.js'
import { rolValido } from './permisos.js'

export const LIMITES = Object.freeze({
  nombreCategoria: [2, 60],
  descripcionCategoria: 120,
  nombreProducto: [2, 120],
  codigoBarras: [4, 40],
  precioMaximo: 100_000_000,
  cantidadMaxima: 1_000_000,
  stockMinimoMaximo: 100_000,
  concepto: [3, 140],
  montoMaximo: 1_000_000_000,
  motivo: [3, 120],
  conceptoEntrada: 120,
  itemsPorOperacion: 200,
  fechaMinima: '2000-01-01',
  contrasenaMinima: 8,
})

export const PATRON_CODIGO = /^[A-Za-z0-9-]+$/
const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000

export const TIPOS_VALIDOS = Object.freeze({
  ingreso: ['venta', 'aporte', 'otro'],
  egreso: ['compra_mercancia', 'servicios_publicos', 'arriendo', 'nomina', 'transporte', 'otros'],
})

/** Error con un mapa { campo: mensaje } para mostrar junto a cada campo. */
export class ErrorValidacion extends Error {
  constructor(errores) {
    super(Object.values(errores)[0] ?? 'Revisa los datos ingresados')
    this.name = 'ErrorValidacion'
    this.errores = errores
  }
}

export function exigirValido(errores) {
  if (Object.keys(errores).length) throw new ErrorValidacion(errores)
}

// ── Reglas básicas ────────────────────────────────────────────────────────
// `campo` es la etiqueta con artículo ("el nombre", "la cantidad"); `f` indica
// género femenino para concordar los mensajes.

const vacio = (v) => v === undefined || v === null || String(v).trim() === ''
const texto = (v) => (v ?? '').toString().trim()
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const aNumero = (v) => (vacio(v) ? null : Number(v))

export function reglaTexto(valor, campo, [min, max], { requerido = true } = {}) {
  const t = texto(valor)
  if (!t) return requerido ? `Escribe ${campo}` : null
  if (t.length < min) return `${mayuscula(campo)} debe tener al menos ${min} caracteres`
  if (t.length > max) return `${mayuscula(campo)} admite máximo ${max} caracteres`
  return null
}

export function reglaDinero(valor, campo, { mayorQueCero = false, max = LIMITES.precioMaximo, f = false } = {}) {
  const n = aNumero(valor)
  if (n === null) return `Ingresa ${campo}`
  if (!Number.isFinite(n)) return `${mayuscula(campo)} debe ser un número`
  if (mayorQueCero && n <= 0) return `${mayuscula(campo)} debe ser mayor que cero`
  if (n < 0) return `${mayuscula(campo)} no puede ser negativ${f ? 'a' : 'o'}`
  if (n > max) return `${mayuscula(campo)} no puede superar ${dinero(max)}`
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return `${mayuscula(campo)} admite máximo 2 decimales`
  return null
}

export function reglaEntero(valor, campo, { min = 0, max = LIMITES.cantidadMaxima, f = true, requerido = true } = {}) {
  const n = aNumero(valor)
  if (n === null) return requerido ? `Ingresa ${campo}` : null
  if (!Number.isInteger(n)) return `${mayuscula(campo)} debe ser un número entero`
  if (n < min) return min === 0 ? `${mayuscula(campo)} no puede ser negativ${f ? 'a' : 'o'}` : `${mayuscula(campo)} debe ser al menos ${min}`
  if (n > max) return `${mayuscula(campo)} no puede superar ${formatoNumero(max)}`
  return null
}

/** 'YYYY-MM-DD' que existe en el calendario (rechaza 2026-02-30). */
function fechaExiste(t) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!partes) return false
  const [y, m, d] = partes.slice(1).map(Number)
  const fecha = new Date(y, m - 1, d)
  return fecha.getFullYear() === y && fecha.getMonth() === m - 1 && fecha.getDate() === d
}

/** Fecha de calendario 'YYYY-MM-DD' entre 2000-01-01 y hoy. */
export function reglaFecha(valor, campo = 'la fecha') {
  const t = texto(valor)
  if (!t) return `Selecciona ${campo}`
  if (!fechaExiste(t)) return 'La fecha no es válida'
  if (t < LIMITES.fechaMinima) return 'La fecha es demasiado antigua'
  if (t > hoyISO()) return 'La fecha no puede ser posterior a hoy'
  return null
}

/** Marca de tiempo ISO (ventas y entradas): no puede ser futura. */
export function reglaMomento(valor) {
  if (vacio(valor)) return null
  const t = Date.parse(valor)
  if (Number.isNaN(t)) return 'La fecha no es válida'
  if (t > Date.now() + TOLERANCIA_RELOJ_MS) return 'La fecha no puede ser posterior a hoy'
  if (t < Date.parse(`${LIMITES.fechaMinima}T00:00:00`)) return 'La fecha es demasiado antigua'
  return null
}

function agregar(errores, campo, mensaje) {
  if (mensaje && !errores[campo]) errores[campo] = mensaje
}

// ── Validadores por entidad ───────────────────────────────────────────────

export function validarCategoria(datos, { categorias = [] } = {}) {
  const e = {}
  const nombre = texto(datos.nombre)
  agregar(e, 'nombre', reglaTexto(nombre, 'el nombre', LIMITES.nombreCategoria))
  if (!e.nombre && categorias.some((c) => c.id !== datos.id && c.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
    e.nombre = 'Ya existe una categoría con ese nombre'
  }
  agregar(e, 'descripcion', reglaTexto(datos.descripcion, 'la descripción', [0, LIMITES.descripcionCategoria], { requerido: false }))
  return e
}

export function validarProducto(datos, { productos = [], categorias = [] } = {}) {
  const e = {}
  agregar(e, 'nombre', reglaTexto(datos.nombre, 'el nombre del producto', LIMITES.nombreProducto))

  const codigo = texto(datos.codigo_barras)
  if (codigo) {
    const [min, max] = LIMITES.codigoBarras
    if (codigo.length < min || codigo.length > max) e.codigo_barras = `El código debe tener entre ${min} y ${max} caracteres`
    else if (!PATRON_CODIGO.test(codigo)) e.codigo_barras = 'El código solo admite letras, números y guiones'
    else if (productos.some((p) => p.activo !== false && p.id !== datos.id && p.codigo_barras === codigo)) {
      e.codigo_barras = 'Ya existe un producto con ese código de barras'
    }
  }

  if (vacio(datos.categoria_id)) e.categoria_id = 'Selecciona una categoría'
  else if (categorias.length && !categorias.some((c) => c.id === datos.categoria_id)) e.categoria_id = 'La categoría seleccionada ya no existe'

  agregar(e, 'precio_compra', reglaDinero(datos.precio_compra, 'el precio de compra'))
  agregar(e, 'precio_venta', reglaDinero(datos.precio_venta, 'el precio de venta', { mayorQueCero: true }))
  if (!datos.id) agregar(e, 'cantidad', reglaEntero(datos.cantidad, 'la cantidad inicial'))
  agregar(e, 'stock_minimo', reglaEntero(datos.stock_minimo, 'el stock mínimo', { max: LIMITES.stockMinimoMaximo, f: false }))
  return e
}

export function validarVenta({ fecha, items }, { productoPorId = {} } = {}) {
  const e = {}
  agregar(e, 'fecha', reglaMomento(fecha))
  if (!items?.length) e.items = 'Agrega al menos un producto a la venta'
  else if (items.length > LIMITES.itemsPorOperacion) e.items = `Una venta admite máximo ${LIMITES.itemsPorOperacion} productos`

  const pedidas = {}
  for (const it of items ?? []) {
    const p = productoPorId[it.producto_id]
    if (!p || p.activo === false) {
      agregar(e, 'items', 'Uno de los productos ya no existe en el catálogo')
      continue
    }
    agregar(e, 'items', reglaEntero(it.cantidad, `la cantidad de ${p.nombre}`, { min: 1 }))
    agregar(e, 'items', reglaDinero(it.precio_unitario ?? p.precio_venta, `el precio de ${p.nombre}`))
    pedidas[p.id] = (pedidas[p.id] ?? 0) + (Number(it.cantidad) || 0)
    if (pedidas[p.id] > p.cantidad) agregar(e, 'items', `Stock insuficiente para ${p.nombre} (disponible: ${p.cantidad})`)
  }
  return e
}

export function validarEntrada({ fecha, concepto, items }, { productoPorId = {} } = {}) {
  const e = {}
  agregar(e, 'fecha', reglaMomento(fecha))
  agregar(e, 'concepto', reglaTexto(concepto, 'el concepto', [0, LIMITES.conceptoEntrada], { requerido: false }))
  if (!items?.length) e.items = 'Agrega al menos un producto a la entrada'
  else if (items.length > LIMITES.itemsPorOperacion) e.items = `Una entrada admite máximo ${LIMITES.itemsPorOperacion} productos`

  for (const it of items ?? []) {
    const p = productoPorId[it.producto_id]
    if (!p || p.activo === false) {
      agregar(e, 'items', 'Uno de los productos ya no existe en el catálogo')
      continue
    }
    agregar(e, 'items', reglaEntero(it.cantidad, `la cantidad de ${p.nombre}`, { min: 1 }))
    agregar(e, 'items', reglaDinero(it.costo_unitario ?? 0, `el costo de ${p.nombre}`))
    if (p.cantidad + (Number(it.cantidad) || 0) > LIMITES.cantidadMaxima) {
      agregar(e, 'items', `Las existencias de ${p.nombre} superarían el máximo permitido`)
    }
  }
  return e
}

export function validarAjuste({ motivo, items }, { productoPorId = {} } = {}) {
  const e = {}
  agregar(e, 'motivo', reglaTexto(motivo, 'el motivo', LIMITES.motivo))
  if (!items?.length) e.items = 'No hay diferencias para ajustar'
  for (const it of items ?? []) {
    const p = productoPorId[it.producto_id]
    if (!p || p.activo === false) {
      agregar(e, 'items', 'Uno de los productos ya no existe en el catálogo')
      continue
    }
    agregar(e, 'items', reglaEntero(it.cantidad_fisica, `el conteo de ${p.nombre}`, { f: false }))
  }
  return e
}

export function validarFinanza(clase, datos) {
  const e = {}
  agregar(e, 'fecha', reglaFecha(datos.fecha))
  if (!TIPOS_VALIDOS[clase]?.includes(datos.tipo)) e.tipo = 'Selecciona un tipo válido'
  agregar(e, 'concepto', reglaTexto(datos.concepto, 'el concepto', LIMITES.concepto))
  agregar(e, 'monto', reglaDinero(datos.monto, 'el monto', { mayorQueCero: true, max: LIMITES.montoMaximo }))
  return e
}

export function reglaContrasena(valor, campo = 'la contraseña') {
  if (!valor) return `Escribe ${campo}`
  if (valor.length < LIMITES.contrasenaMinima) return `${mayuscula(campo)} debe tener al menos ${LIMITES.contrasenaMinima} caracteres`
  if (valor.length > 72) return `${mayuscula(campo)} admite máximo 72 caracteres`
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(valor) || !/\d/.test(valor)) return 'Usa al menos una letra y un número'
  return null
}

export function validarCambioContrasena({ actual, nueva, confirmacion }) {
  const e = {}
  if (!actual) e.actual = 'Escribe tu contraseña actual'
  agregar(e, 'nueva', reglaContrasena(nueva, 'la nueva contraseña'))
  if (!e.nueva && nueva === actual) e.nueva = 'La nueva contraseña debe ser diferente a la actual'
  if (!e.nueva && nueva !== confirmacion) e.confirmacion = 'La confirmación no coincide con la nueva contraseña'
  return e
}

/**
 * Datos de un usuario del sistema. En modo demo se crea con usuario y
 * contraseña; en Supabase la cuenta ya existe y se autoriza por su correo.
 */
export function validarUsuario(datos, { usuarios = [], modo = 'local' } = {}) {
  const e = {}
  agregar(e, 'nombre', reglaTexto(datos.nombre, 'el nombre', [2, 80]))
  if (!rolValido(datos.rol)) e.rol = 'Selecciona un nivel de acceso'
  if (datos.id) return e

  if (modo === 'supabase') {
    const correo = texto(datos.correo).toLowerCase()
    if (!correo) e.correo = 'Escribe el correo de la cuenta'
    else if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) e.correo = 'El correo no es válido'
    else if (usuarios.some((u) => u.correo?.toLowerCase() === correo)) e.correo = 'Esa cuenta ya está registrada'
  } else {
    const usuario = texto(datos.usuario).toLowerCase()
    if (!usuario) e.usuario = 'Escribe el nombre de usuario'
    else if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) e.usuario = 'Usa de 3 a 30 letras sin tildes, números, punto o guiones'
    else if (usuarios.some((u) => u.usuario?.toLowerCase() === usuario)) e.usuario = 'Ese usuario ya existe'
    agregar(e, 'contrasena', reglaContrasena(datos.contrasena, 'la contraseña inicial'))
  }
  return e
}

export function validarInicioSesion(usuario, contrasena) {
  const e = {}
  if (!texto(usuario)) e.usuario = 'Ingresa tu usuario'
  else if (texto(usuario).length > 120) e.usuario = 'El usuario no es válido'
  if (!contrasena) e.contrasena = 'Ingresa tu contraseña'
  return e
}

/** Estructura mínima de un archivo de respaldo antes de restaurarlo. */
export function validarRespaldo(respaldo) {
  const d = respaldo?.datos
  if (respaldo?.app !== 'britny-max' || !d || typeof d !== 'object') {
    throw new Error('El archivo no es un respaldo de Britny Max')
  }
  for (const c of ['categorias', 'productos', 'ventas', 'movimientos', 'ingresos', 'egresos']) {
    if (!Array.isArray(d[c])) throw new Error(`El respaldo está incompleto: falta "${c}"`)
    if (d[c].some((fila) => !fila || typeof fila.id !== 'string')) throw new Error(`El respaldo tiene registros dañados en "${c}"`)
  }
  return d
}
