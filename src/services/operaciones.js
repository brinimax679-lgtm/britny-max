// Operaciones de inventario del modo demo (localStorage).
// Replican las funciones SQL de supabase/schema.sql: cada operación recibe la
// base completa y la modifica; si lanza un error no se guarda nada (RNF07).

import { uid } from '../lib/seguridad.js'
import { diaDe } from '../lib/format.js'

const ahora = () => new Date().toISOString()

function productoActivo(db, id) {
  const p = db.productos.find((x) => x.id === id && x.activo !== false)
  if (!p) throw new Error('Uno de los productos ya no existe en el catálogo')
  return p
}

function cantidadValida(valor, nombre, { permitirCero = false } = {}) {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 0 || (!permitirCero && n === 0)) {
    throw new Error(`Cantidad inválida para ${nombre}`)
  }
  return n
}

function movimiento(db, { fecha, producto, tipo, cantidad, motivo, referencia_id }) {
  db.movimientos.push({
    id: uid(),
    fecha,
    producto_id: producto.id,
    nombre_producto: producto.nombre,
    tipo,
    cantidad,
    stock_resultante: producto.cantidad,
    motivo,
    referencia_id,
  })
}

export function crearProducto(db, datos) {
  const producto = {
    id: uid(),
    nombre: datos.nombre,
    codigo_barras: datos.codigo_barras || null,
    categoria_id: datos.categoria_id || null,
    precio_compra: Number(datos.precio_compra) || 0,
    precio_venta: Number(datos.precio_venta) || 0,
    cantidad: cantidadValida(datos.cantidad ?? 0, datos.nombre, { permitirCero: true }),
    stock_minimo: Number(datos.stock_minimo) || 0,
    activo: true,
    creado_en: datos.creado_en || ahora(),
  }
  db.productos.push(producto)
  if (producto.cantidad > 0) {
    movimiento(db, {
      fecha: producto.creado_en,
      producto,
      tipo: 'entrada',
      cantidad: producto.cantidad,
      motivo: 'Inventario inicial',
      referencia_id: producto.id,
    })
  }
  return producto
}

export function registrarVenta(db, { fecha, items }) {
  if (!items?.length) throw new Error('La venta no tiene productos')
  const f = fecha || ahora()
  const venta = { id: uid(), fecha: f, total: 0, estado: 'registrada', detalles: [], creado_en: ahora() }

  for (const item of items) {
    const p = productoActivo(db, item.producto_id)
    const cant = cantidadValida(item.cantidad, p.nombre)
    if (p.cantidad < cant) throw new Error(`Stock insuficiente para ${p.nombre} (disponible: ${p.cantidad})`)
    const precio = Number(item.precio_unitario ?? p.precio_venta)
    p.cantidad -= cant
    venta.detalles.push({
      id: uid(),
      venta_id: venta.id,
      producto_id: p.id,
      nombre_producto: p.nombre,
      cantidad: cant,
      precio_unitario: precio,
      subtotal: cant * precio,
    })
    movimiento(db, { fecha: f, producto: p, tipo: 'salida', cantidad: -cant, motivo: 'Venta', referencia_id: venta.id })
    venta.total += cant * precio
  }

  db.ventas.push(venta)
  if (venta.total > 0) {
    db.ingresos.push({
      id: uid(),
      fecha: diaDe(f),
      concepto: 'Venta de productos',
      monto: venta.total,
      tipo: 'venta',
      venta_id: venta.id,
      creado_en: ahora(),
    })
  }
  return venta
}

export function anularVenta(db, ventaId) {
  const venta = db.ventas.find((v) => v.id === ventaId)
  if (!venta) throw new Error('Venta no encontrada')
  if (venta.estado === 'anulada') throw new Error('La venta ya fue anulada')
  const f = ahora()
  for (const d of venta.detalles) {
    const p = db.productos.find((x) => x.id === d.producto_id)
    if (!p) continue
    p.cantidad += d.cantidad
    movimiento(db, { fecha: f, producto: p, tipo: 'entrada', cantidad: d.cantidad, motivo: 'Anulación de venta', referencia_id: venta.id })
  }
  venta.estado = 'anulada'
  db.ingresos = db.ingresos.filter((i) => i.venta_id !== venta.id)
  return venta
}

export function registrarEntrada(db, { fecha, concepto, items, registrarEgreso, actualizarPrecio }) {
  if (!items?.length) throw new Error('La entrada no tiene productos')
  const f = fecha || ahora()
  const referencia = uid()
  const motivo = concepto?.trim() || 'Entrada de mercancía'
  let total = 0

  for (const item of items) {
    const p = productoActivo(db, item.producto_id)
    const cant = cantidadValida(item.cantidad, p.nombre)
    const costo = Number(item.costo_unitario) || 0
    p.cantidad += cant
    if (actualizarPrecio && costo > 0) p.precio_compra = costo
    movimiento(db, { fecha: f, producto: p, tipo: 'entrada', cantidad: cant, motivo, referencia_id: referencia })
    total += cant * costo
  }

  if (registrarEgreso && total > 0) {
    db.egresos.push({
      id: uid(),
      fecha: diaDe(f),
      concepto: (concepto?.trim().length ?? 0) >= 3 ? concepto.trim() : 'Compra de mercancía',
      monto: total,
      tipo: 'compra_mercancia',
      referencia_id: referencia,
      creado_en: ahora(),
    })
  }
  return { referencia, total }
}

export function ajustarInventario(db, { fecha, motivo, items }) {
  const f = fecha || ahora()
  const referencia = uid()
  const texto = (motivo?.trim().length ?? 0) >= 3 ? motivo.trim() : 'Conteo físico'
  let ajustados = 0
  for (const item of items) {
    const p = productoActivo(db, item.producto_id)
    const fisica = cantidadValida(item.cantidad_fisica, p.nombre, { permitirCero: true })
    const diferencia = fisica - p.cantidad
    if (diferencia === 0) continue
    p.cantidad = fisica
    movimiento(db, { fecha: f, producto: p, tipo: 'ajuste', cantidad: diferencia, motivo: texto, referencia_id: referencia })
    ajustados++
  }
  return { referencia, ajustados }
}
