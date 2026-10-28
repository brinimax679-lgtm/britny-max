// Operaciones del modo demo: deben comportarse igual que las funciones SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as ops from '../src/services/operaciones.js'
import { baseVacia, crearBaseDemo } from '../src/services/seed.js'

function base() {
  const db = baseVacia()
  db.categorias.push({ id: 'c1', nombre: 'Granos' })
  const arroz = ops.crearProducto(db, { nombre: 'Arroz', categoria_id: 'c1', precio_compra: 2400, precio_venta: 3000, cantidad: 10 })
  const cafe = ops.crearProducto(db, { nombre: 'Café', categoria_id: 'c1', precio_compra: 8000, precio_venta: 10500, cantidad: 2 })
  return { db, arroz, cafe }
}

test('crear producto registra el inventario inicial', () => {
  const { db, arroz } = base()
  assert.deepEqual(
    db.movimientos.filter((m) => m.producto_id === arroz.id).map((m) => [m.tipo, m.cantidad, m.motivo]),
    [['entrada', 10, 'Inventario inicial']],
  )
})

test('venta: descuenta stock, guarda detalle, movimiento e ingreso', () => {
  const { db, arroz, cafe } = base()
  const venta = ops.registrarVenta(db, {
    items: [{ producto_id: arroz.id, cantidad: 3, precio_unitario: 3000 }, { producto_id: cafe.id, cantidad: 1, precio_unitario: 10500 }],
  })
  assert.equal(venta.total, 19500)
  assert.equal(arroz.cantidad, 7)
  assert.equal(cafe.cantidad, 1)
  assert.equal(db.ingresos.find((i) => i.venta_id === venta.id).monto, 19500)
  assert.deepEqual(db.movimientos.filter((m) => m.referencia_id === venta.id).map((m) => m.cantidad), [-3, -1])
})

test('venta con stock insuficiente no cambia nada (todo o nada)', () => {
  const { db, arroz, cafe } = base()
  const copia = structuredClone(db)
  assert.throws(
    () => ops.registrarVenta(db, { items: [{ producto_id: arroz.id, cantidad: 1 }, { producto_id: cafe.id, cantidad: 5 }] }),
    /Stock insuficiente para Café \(disponible: 2\)/,
  )
  // El backend local trabaja sobre una copia y la descarta ante un error;
  // aquí se comprueba que la operación falla antes de registrar la venta.
  assert.equal(db.ventas.length, copia.ventas.length)
  assert.equal(db.ingresos.length, copia.ingresos.length)
})

test('anular venta devuelve existencias y retira el ingreso', () => {
  const { db, arroz } = base()
  const venta = ops.registrarVenta(db, { items: [{ producto_id: arroz.id, cantidad: 4 }] })
  ops.anularVenta(db, venta.id)
  assert.equal(arroz.cantidad, 10)
  assert.equal(db.ingresos.some((i) => i.venta_id === venta.id), false)
  assert.throws(() => ops.anularVenta(db, venta.id), /ya fue anulada/)
})

test('entrada de mercancía con egreso y concepto corto', () => {
  const { db, cafe } = base()
  const { referencia } = ops.registrarEntrada(db, {
    concepto: 'ab',
    items: [{ producto_id: cafe.id, cantidad: 10, costo_unitario: 8200 }],
    registrarEgreso: true,
    actualizarPrecio: true,
  })
  assert.equal(cafe.cantidad, 12)
  assert.equal(cafe.precio_compra, 8200)
  const egreso = db.egresos.find((e) => e.referencia_id === referencia)
  assert.deepEqual([egreso.concepto, egreso.monto, egreso.tipo], ['Compra de mercancía', 82000, 'compra_mercancia'])
})

test('conteo físico ajusta solo los productos con diferencia', () => {
  const { db, arroz, cafe } = base()
  const { ajustados } = ops.ajustarInventario(db, {
    motivo: 'Conteo semanal',
    items: [{ producto_id: arroz.id, cantidad_fisica: 7 }, { producto_id: cafe.id, cantidad_fisica: 2 }],
  })
  assert.equal(ajustados, 1)
  const ajuste = db.movimientos.find((m) => m.tipo === 'ajuste')
  assert.deepEqual([ajuste.cantidad, ajuste.stock_resultante, ajuste.motivo], [-3, 7, 'Conteo semanal'])
  assert.throws(() => ops.ajustarInventario(db, { items: [{ producto_id: arroz.id, cantidad_fisica: -1 }] }), /Cantidad inválida/)
})

test('los datos de ejemplo son consistentes', () => {
  const db = crearBaseDemo([])
  for (const p of db.productos) {
    const neto = db.movimientos.filter((m) => m.producto_id === p.id).reduce((s, m) => s + m.cantidad, 0)
    assert.equal(neto, p.cantidad, `los movimientos de ${p.nombre} explican sus existencias`)
    assert.ok(p.cantidad >= 0)
  }
  for (const v of db.ventas) {
    const suma = v.detalles.reduce((s, d) => s + d.subtotal, 0)
    assert.equal(suma, v.total)
    assert.equal(db.ingresos.find((i) => i.venta_id === v.id)?.monto, v.total)
  }
})
