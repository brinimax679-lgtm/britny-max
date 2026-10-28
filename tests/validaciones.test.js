import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validarCategoria, validarProducto, validarVenta, validarEntrada, validarAjuste, validarFinanza,
  validarCambioContrasena, validarInicioSesion, validarRespaldo, exigirValido, ErrorValidacion, LIMITES,
} from '../src/lib/validaciones.js'
import { hoyISO, sumarDias } from '../src/lib/format.js'

const categorias = [{ id: 'c1', nombre: 'Lácteos' }]
const productoValido = { nombre: 'Leche entera 1 L', codigo_barras: '7709990000047', categoria_id: 'c1', precio_compra: 3500, precio_venta: 4300, cantidad: 10, stock_minimo: 5 }

test('categoría: nombre requerido, longitud y duplicados sin importar mayúsculas', () => {
  assert.deepEqual(validarCategoria({ nombre: 'Aseo' }, { categorias }), {})
  assert.match(validarCategoria({ nombre: '' }).nombre, /Escribe el nombre/)
  assert.match(validarCategoria({ nombre: 'A' }).nombre, /al menos 2/)
  assert.match(validarCategoria({ nombre: 'x'.repeat(61) }).nombre, /máximo 60/)
  assert.match(validarCategoria({ nombre: ' lácteos ' }, { categorias }).nombre, /Ya existe/)
  assert.deepEqual(validarCategoria({ id: 'c1', nombre: 'Lácteos' }, { categorias }), {}, 'editar la misma categoría')
  assert.match(validarCategoria({ nombre: 'Aseo', descripcion: 'x'.repeat(121) }).descripcion, /máximo 120/)
})

test('producto válido no tiene errores', () => {
  assert.deepEqual(validarProducto(productoValido, { categorias }), {})
  assert.deepEqual(validarProducto({ ...productoValido, codigo_barras: '' }, { categorias }), {}, 'el código es opcional')
})

test('producto: precios vacíos, negativos, cero, enormes o con muchos decimales', () => {
  const e = (cambios) => validarProducto({ ...productoValido, ...cambios }, { categorias })
  assert.match(e({ precio_compra: '' }).precio_compra, /Ingresa el precio de compra/)
  assert.match(e({ precio_compra: -1 }).precio_compra, /no puede ser negativo/)
  assert.match(e({ precio_venta: 0 }).precio_venta, /mayor que cero/)
  assert.match(e({ precio_venta: 100_000_001 }).precio_venta, /no puede superar/)
  assert.match(e({ precio_venta: 10.555 }).precio_venta, /2 decimales/)
  assert.deepEqual(e({ precio_compra: 0 }), {}, 'precio de compra 0 es válido (obsequio)')
})

test('producto: cantidades enteras, código de barras y categoría', () => {
  const e = (cambios, ctx = { categorias }) => validarProducto({ ...productoValido, ...cambios }, ctx)
  assert.match(e({ cantidad: 2.5 }).cantidad, /entero/)
  assert.match(e({ cantidad: -1 }).cantidad, /negativa/)
  assert.match(e({ cantidad: LIMITES.cantidadMaxima + 1 }).cantidad, /no puede superar/)
  assert.equal(e({ id: 'p1', cantidad: -1 }).cantidad, undefined, 'al editar no se valida la cantidad')
  assert.match(e({ stock_minimo: '' }).stock_minimo, /Ingresa el stock mínimo/)
  assert.match(e({ codigo_barras: '12' }).codigo_barras, /entre 4 y 40/)
  assert.match(e({ codigo_barras: '770 999' }).codigo_barras, /letras, números y guiones/)
  assert.match(e({ categoria_id: '' }).categoria_id, /Selecciona una categoría/)
  assert.match(e({ categoria_id: 'otra' }).categoria_id, /ya no existe/)
  const productos = [{ id: 'p9', codigo_barras: '7709990000047', activo: true }]
  assert.match(e({}, { categorias, productos }).codigo_barras, /Ya existe/)
  assert.deepEqual(e({}, { categorias, productos: [{ ...productos[0], activo: false }] }), {}, 'un producto retirado libera el código')
})

test('venta: stock, cantidades, fecha y productos retirados', () => {
  const productoPorId = {
    a: { id: 'a', nombre: 'Café', cantidad: 2, precio_venta: 10500, activo: true },
    b: { id: 'b', nombre: 'Pan', cantidad: 5, precio_venta: 6000, activo: false },
  }
  const v = (items, fecha) => validarVenta({ fecha, items }, { productoPorId })
  assert.deepEqual(v([{ producto_id: 'a', cantidad: 2, precio_unitario: 10500 }]), {})
  assert.match(v([]).items, /al menos un producto/)
  assert.match(v([{ producto_id: 'a', cantidad: 3 }]).items, /Stock insuficiente para Café/)
  assert.match(v([{ producto_id: 'a', cantidad: 1 }, { producto_id: 'a', cantidad: 2 }]).items, /Stock insuficiente/)
  assert.match(v([{ producto_id: 'a', cantidad: 0 }]).items, /al menos 1/)
  assert.match(v([{ producto_id: 'a', cantidad: 1.5 }]).items, /entero/)
  assert.match(v([{ producto_id: 'b', cantidad: 1 }]).items, /ya no existe/)
  assert.match(v([{ producto_id: 'a', cantidad: 1 }], new Date(Date.now() + 86_400_000).toISOString()).fecha, /posterior a hoy/)
})

test('entrada y ajuste de inventario', () => {
  const productoPorId = { a: { id: 'a', nombre: 'Arroz', cantidad: 10, activo: true } }
  assert.deepEqual(validarEntrada({ items: [{ producto_id: 'a', cantidad: 5, costo_unitario: 2400 }] }, { productoPorId }), {})
  assert.match(validarEntrada({ items: [{ producto_id: 'a', cantidad: 5, costo_unitario: -1 }] }, { productoPorId }).items, /negativo/)
  assert.match(validarEntrada({ items: [{ producto_id: 'a', cantidad: 1_000_000 }] }, { productoPorId }).items, /máximo permitido/)
  assert.match(validarEntrada({ concepto: 'x'.repeat(121), items: [{ producto_id: 'a', cantidad: 1 }] }, { productoPorId }).concepto, /máximo 120/)
  assert.deepEqual(validarAjuste({ motivo: 'Conteo físico', items: [{ producto_id: 'a', cantidad_fisica: 0 }] }, { productoPorId }), {})
  assert.match(validarAjuste({ motivo: 'Conteo', items: [{ producto_id: 'a', cantidad_fisica: -2 }] }, { productoPorId }).items, /negativo/)
  assert.match(validarAjuste({ motivo: 'ab', items: [{ producto_id: 'a', cantidad_fisica: 2 }] }, { productoPorId }).motivo, /al menos 3/)
})

test('ingresos y egresos: fecha, tipo, concepto y monto', () => {
  const base = { fecha: hoyISO(), tipo: 'servicios_publicos', concepto: 'Factura de energía', monto: 86500 }
  assert.deepEqual(validarFinanza('egreso', base), {})
  assert.match(validarFinanza('egreso', { ...base, fecha: sumarDias(hoyISO(), 1) }).fecha, /posterior a hoy/)
  assert.match(validarFinanza('egreso', { ...base, fecha: '1999-12-31' }).fecha, /antigua/)
  assert.match(validarFinanza('egreso', { ...base, fecha: '2026-02-30' }).fecha, /no es válida/)
  assert.match(validarFinanza('egreso', { ...base, tipo: 'aporte' }).tipo, /tipo válido/)
  assert.match(validarFinanza('ingreso', base).tipo, /tipo válido/)
  assert.match(validarFinanza('egreso', { ...base, concepto: '  ab ' }).concepto, /al menos 3/)
  assert.match(validarFinanza('egreso', { ...base, monto: '' }).monto, /Ingresa el monto/)
  assert.match(validarFinanza('egreso', { ...base, monto: 0 }).monto, /mayor que cero/)
  assert.match(validarFinanza('egreso', { ...base, monto: 2_000_000_000 }).monto, /no puede superar/)
})

test('contraseñas e inicio de sesión', () => {
  assert.deepEqual(validarCambioContrasena({ actual: 'britny2026', nueva: 'Tienda2027', confirmacion: 'Tienda2027' }), {})
  assert.match(validarCambioContrasena({ actual: '', nueva: 'Tienda2027', confirmacion: 'Tienda2027' }).actual, /actual/)
  assert.match(validarCambioContrasena({ actual: 'x', nueva: 'corta1', confirmacion: 'corta1' }).nueva, /al menos 8/)
  assert.match(validarCambioContrasena({ actual: 'x', nueva: 'soloLetras', confirmacion: 'soloLetras' }).nueva, /letra y un número/)
  assert.match(validarCambioContrasena({ actual: 'Tienda2027', nueva: 'Tienda2027', confirmacion: 'Tienda2027' }).nueva, /diferente/)
  assert.match(validarCambioContrasena({ actual: 'x', nueva: 'Tienda2027', confirmacion: 'Tienda2028' }).confirmacion, /no coincide/)
  assert.deepEqual(Object.keys(validarInicioSesion('', '')), ['usuario', 'contrasena'])
  assert.deepEqual(validarInicioSesion('admin', 'secreto'), {})
})

test('respaldos: estructura mínima', () => {
  const datos = { categorias: [], productos: [{ id: 'p1' }], ventas: [], movimientos: [], ingresos: [], egresos: [] }
  assert.equal(validarRespaldo({ app: 'britny-max', datos }), datos)
  assert.throws(() => validarRespaldo({ app: 'otra', datos }), /no es un respaldo/)
  assert.throws(() => validarRespaldo({ app: 'britny-max', datos: { ...datos, egresos: undefined } }), /falta "egresos"/)
  assert.throws(() => validarRespaldo({ app: 'britny-max', datos: { ...datos, productos: [{ nombre: 'sin id' }] } }), /dañados/)
})

test('exigirValido lanza ErrorValidacion con el mapa de errores', () => {
  assert.doesNotThrow(() => exigirValido({}))
  assert.throws(() => exigirValido({ nombre: 'Escribe el nombre', monto: 'x' }), (e) => {
    assert.ok(e instanceof ErrorValidacion)
    assert.equal(e.message, 'Escribe el nombre')
    assert.deepEqual(Object.keys(e.errores), ['nombre', 'monto'])
    return true
  })
})
