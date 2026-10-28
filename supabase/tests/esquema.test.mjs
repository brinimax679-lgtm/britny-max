// Pruebas del esquema de Supabase sobre PostgreSQL real (PGlite, en memoria).
// Simula lo que Supabase provee: roles anon/authenticated, auth.users y auth.uid().
// Ejecutar con: npm run test:db

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const esquema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const INTRUSO = '22222222-2222-4222-8222-222222222222'
const INACTIVO = '33333333-3333-4333-8333-333333333333'
const SUPERVISOR = '44444444-4444-4444-8444-444444444444'
const CAJERO = '55555555-5555-4555-8555-555555555555'
const CONSULTA = '66666666-6666-4666-8666-666666666666'
const NUEVO = '77777777-7777-4777-8777-777777777777'

let db

const entornoSupabase = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`

/** Ejecuta `fn` como el rol y usuario indicados, dentro de una transacción. */
async function como(usuario, fn, { rol = 'authenticated' } = {}) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: usuario, role: rol })])
    await tx.exec(`set local role ${rol}`)
    return fn(tx)
  })
}

const admin = (fn) => como(ADMIN, fn)
const uno = async (tx, sql, params) => (await tx.query(sql, params)).rows[0]
const filas = async (tx, sql, params) => (await tx.query(sql, params)).rows

async function rechaza(promesa, patron) {
  await assert.rejects(promesa, (e) => {
    assert.match(e.message, patron)
    return true
  })
}

async function crearCategoria(nombre = 'Granos') {
  return admin(async (tx) => (await uno(tx, `insert into categorias (nombre) values ($1) returning id`, [nombre])).id)
}

async function crearProducto(datos) {
  return admin(async (tx) => (await uno(tx, `select crear_producto($1) as id`, [datos])).id)
}

before(async () => {
  db = new PGlite()
  await db.exec(entornoSupabase)
  await db.exec(esquema)
  await db.exec(esquema) // debe poder ejecutarse dos veces
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@britnymax.app'),
      ('${INTRUSO}', 'intruso@correo.com'),
      ('${INACTIVO}', 'antiguo@britnymax.app'),
      ('${SUPERVISOR}', 'supervisor@britnymax.app'),
      ('${CAJERO}', 'cajero@britnymax.app'),
      ('${CONSULTA}', 'contador@britnymax.app'),
      ('${NUEVO}', 'nuevo@correo.com');
    insert into public.usuarios (id, nombre, rol) values
      ('${ADMIN}', 'Britny Romero', 'administrador'),
      ('${SUPERVISOR}', 'Supervisora', 'supervisor'),
      ('${CAJERO}', 'Cajero', 'cajero'),
      ('${CONSULTA}', 'Contador', 'consulta');
    insert into public.usuarios (id, nombre, rol, activo) values ('${INACTIVO}', 'Ex empleado', 'cajero', false);
  `)
})

// ── Seguridad ─────────────────────────────────────────────────────────────

test('los visitantes anónimos no pueden leer ni operar', async () => {
  await rechaza(como(null, (tx) => tx.query('select * from productos'), { rol: 'anon' }), /permission denied/)
  await rechaza(como(null, (tx) => tx.query(`select registrar_venta(null, '[]')`), { rol: 'anon' }), /permission denied/)
})

test('un usuario autenticado sin autorización no ve ni modifica datos', async () => {
  await crearCategoria('Visible solo a autorizados')
  for (const usuario of [INTRUSO, INACTIVO]) {
    const vistas = await como(usuario, (tx) => filas(tx, 'select * from categorias'))
    assert.equal(vistas.length, 0)
    await rechaza(como(usuario, (tx) => tx.query(`insert into categorias (nombre) values ('Intrusa')`)), /row-level security/)
    await rechaza(como(usuario, (tx) => tx.query(`select registrar_venta(null, '[]')`)), /no está autorizado/)
    await rechaza(como(usuario, (tx) => tx.query(`select importar_respaldo('categorias', '[]')`)), /no está autorizado/)
  }
})

test('cada nivel ve solo su perfil; el administrador ve todos', async () => {
  const propios = await como(CAJERO, (tx) => filas(tx, 'select nombre from usuarios'))
  assert.deepEqual(propios.map((u) => u.nombre), ['Cajero'])
  const todos = await admin((tx) => filas(tx, 'select nombre from usuarios'))
  assert.equal(todos.length, 5)
  // Nadie inserta ni cambia perfiles directamente (solo con las funciones de la sección 7).
  await rechaza(admin((tx) => tx.query(`insert into usuarios (id, nombre) values ('${INTRUSO}', 'Colado')`)), /row-level security/)
  const r = await como(CAJERO, (tx) => tx.query(`update usuarios set rol = 'administrador' where id = '${CAJERO}'`))
  assert.equal(r.affectedRows, 0, 'un cajero no puede subirse de nivel')
})

// ── Categorías ────────────────────────────────────────────────────────────

test('categorías: nombre obligatorio, único (sin importar mayúsculas) y normalizado', async () => {
  await crearCategoria('Lácteos')
  await rechaza(crearCategoria('  lácteos '), /categorias_nombre_unico/)
  await rechaza(crearCategoria('L'), /categorias_nombre_longitud/)
  await rechaza(crearCategoria('x'.repeat(61)), /categorias_nombre_longitud/)
  const c = await admin((tx) => uno(tx, `insert into categorias (nombre, descripcion) values ('  Aseo  ', '  Limpieza ') returning *`))
  assert.equal(c.nombre, 'Aseo')
  assert.equal(c.descripcion, 'Limpieza')
})

test('no se elimina una categoría con productos activos', async () => {
  const cat = await crearCategoria('Bebidas')
  const prod = await crearProducto({ nombre: 'Gaseosa', categoria_id: cat, precio_venta: 2800, cantidad: 0 })
  await rechaza(admin((tx) => tx.query('delete from categorias where id = $1', [cat])), /productos activos/)
  await admin((tx) => tx.query('update productos set activo = false where id = $1', [prod]))
  await admin((tx) => tx.query('delete from categorias where id = $1', [cat]))
  const p = await admin((tx) => uno(tx, 'select categoria_id from productos where id = $1', [prod]))
  assert.equal(p.categoria_id, null)
})

// ── Productos ─────────────────────────────────────────────────────────────

test('crear_producto registra el inventario inicial', async () => {
  const cat = await crearCategoria('Despensa')
  const id = await crearProducto({ nombre: '  Aceite 1 L ', codigo_barras: '7709990000160', categoria_id: cat, precio_compra: 9800, precio_venta: 12500, cantidad: 10, stock_minimo: 3 })
  const p = await admin((tx) => uno(tx, 'select * from productos where id = $1', [id]))
  assert.equal(p.nombre, 'Aceite 1 L')
  assert.equal(p.cantidad, 10)
  const m = await admin((tx) => filas(tx, 'select tipo, cantidad, stock_resultante, motivo from movimientos_inventario where producto_id = $1', [id]))
  assert.deepEqual(m, [{ tipo: 'entrada', cantidad: 10, stock_resultante: 10, motivo: 'Inventario inicial' }])
})

test('productos: validaciones de nombre, código, precios y existencias', async () => {
  const cat = await crearCategoria('Snacks')
  const base = { nombre: 'Papas', categoria_id: cat, precio_compra: 1700, precio_venta: 2500, cantidad: 0 }
  await rechaza(crearProducto({ ...base, nombre: 'P' }), /productos_nombre_longitud/)
  await rechaza(crearProducto({ ...base, codigo_barras: '12' }), /productos_codigo_formato/)
  await rechaza(crearProducto({ ...base, codigo_barras: '770 123' }), /productos_codigo_formato/)
  await rechaza(crearProducto({ ...base, precio_venta: 0 }), /productos_precio_venta_rango/)
  await rechaza(crearProducto({ ...base, precio_compra: -1 }), /productos_precio_compra_rango/)
  await rechaza(crearProducto({ ...base, precio_venta: 200000000 }), /productos_precio_venta_rango|numeric field overflow/)
  await rechaza(crearProducto({ ...base, cantidad: -3 }), /cantidad inicial no es válida/)
  await rechaza(crearProducto({ ...base, stock_minimo: -1 }), /productos_stock_minimo_rango/)
  await rechaza(crearProducto({ ...base, categoria_id: '' }), /Selecciona una categoría/)
  const id = await crearProducto({ ...base, codigo_barras: '' })
  const p = await admin((tx) => uno(tx, 'select codigo_barras from productos where id = $1', [id]))
  assert.equal(p.codigo_barras, null)
})

test('el código de barras es único entre productos activos', async () => {
  const cat = await crearCategoria('Panadería')
  const base = { categoria_id: cat, precio_venta: 6000, cantidad: 0, codigo_barras: 'PAN-0001' }
  const id = await crearProducto({ ...base, nombre: 'Pan tajado' })
  await rechaza(crearProducto({ ...base, nombre: 'Pan integral' }), /productos_codigo_unico/)
  await admin((tx) => tx.query('update productos set activo = false where id = $1', [id]))
  await crearProducto({ ...base, nombre: 'Pan integral' })
})

test('las existencias no se pueden modificar directamente', async () => {
  const cat = await crearCategoria('Granos secos')
  await rechaza(
    admin((tx) => tx.query(`insert into productos (nombre, categoria_id, precio_venta, cantidad) values ('Arroz', $1, 3000, 5)`, [cat])),
    /existencias iniciales/,
  )
  const id = await crearProducto({ nombre: 'Arroz', categoria_id: cat, precio_venta: 3000, cantidad: 5 })
  await rechaza(admin((tx) => tx.query('update productos set cantidad = 99 where id = $1', [id])), /solo cambian con ventas/)
  await admin((tx) => tx.query('update productos set precio_venta = 3200 where id = $1', [id]))
  const borrados = await admin((tx) => tx.query('delete from productos where id = $1', [id]))
  assert.equal(borrados.affectedRows, 0, 'los productos no se eliminan físicamente')
})

// ── Ventas ────────────────────────────────────────────────────────────────

async function productoConStock(nombre, cantidad, precio = 1000) {
  const cat = await crearCategoria(`Cat ${nombre}`)
  return crearProducto({ nombre, categoria_id: cat, precio_compra: precio / 2, precio_venta: precio, cantidad })
}

test('registrar_venta descuenta existencias, guarda el detalle y genera el ingreso', async () => {
  const a = await productoConStock('Leche', 10, 4300)
  const b = await productoConStock('Queso', 3, 7000)
  const items = [
    { producto_id: a, cantidad: 2, precio_unitario: 4300 },
    { producto_id: b, cantidad: 1, precio_unitario: 7000 },
  ]
  const venta = await admin(async (tx) => (await uno(tx, 'select registrar_venta(null, $1) as id', [JSON.stringify(items)])).id)

  const v = await admin((tx) => uno(tx, 'select total::float, estado, usuario_id from ventas where id = $1', [venta]))
  assert.deepEqual(v, { total: 15600, estado: 'registrada', usuario_id: ADMIN })
  const stock = await admin((tx) => filas(tx, 'select cantidad from productos where id = any($1) order by nombre', [[a, b]]))
  assert.deepEqual(stock.map((s) => s.cantidad), [8, 2])
  const ingreso = await admin((tx) => uno(tx, 'select monto::float, tipo from ingresos where venta_id = $1', [venta]))
  assert.deepEqual(ingreso, { monto: 15600, tipo: 'venta' })
  const movs = await admin((tx) => filas(tx, `select cantidad from movimientos_inventario where referencia_id = $1 order by cantidad`, [venta]))
  assert.deepEqual(movs.map((m) => m.cantidad), [-2, -1])
})

test('registrar_venta valida stock, cantidades, fecha y productos', async () => {
  const id = await productoConStock('Café', 2, 10500)
  const vender = (items, fecha = null) => admin((tx) => tx.query('select registrar_venta($1, $2)', [fecha, JSON.stringify(items)]))
  await rechaza(vender([]), /no tiene productos/)
  await rechaza(vender([{ producto_id: id, cantidad: 3 }]), /Stock insuficiente para Café \(disponible: 2\)/)
  await rechaza(vender([{ producto_id: id, cantidad: 1 }, { producto_id: id, cantidad: 2 }]), /Stock insuficiente/)
  await rechaza(vender([{ producto_id: id, cantidad: 0 }]), /Cantidad inválida/)
  await rechaza(vender([{ producto_id: id, cantidad: 1 }], new Date(Date.now() + 86400000).toISOString()), /posterior a hoy/)
  await rechaza(vender([{ producto_id: '00000000-0000-4000-8000-000000000000', cantidad: 1 }]), /ya no existe/)
  const p = await admin((tx) => uno(tx, 'select cantidad from productos where id = $1', [id]))
  assert.equal(p.cantidad, 2, 'una venta rechazada no cambia nada')
  const ventas = await admin((tx) => filas(tx, `select v.id from ventas v join detalle_venta d on d.venta_id = v.id where d.producto_id = $1`, [id]))
  assert.equal(ventas.length, 0)
})

test('ventas, detalles y movimientos no se escriben por fuera de las operaciones', async () => {
  await rechaza(admin((tx) => tx.query(`insert into ventas (total) values (100)`)), /row-level security/)
  await rechaza(
    admin((tx) => tx.query(`insert into movimientos_inventario (nombre_producto, tipo, cantidad, stock_resultante) values ('X', 'entrada', 5, 5)`)),
    /row-level security/,
  )
  const id = await productoConStock('Yogur', 5)
  const venta = await admin(async (tx) => (await uno(tx, 'select registrar_venta(null, $1) as id', [JSON.stringify([{ producto_id: id, cantidad: 1 }])])).id)
  const r = await admin((tx) => tx.query(`update ventas set total = 1 where id = $1`, [venta]))
  assert.equal(r.affectedRows, 0)
  const ing = await admin((tx) => tx.query(`delete from ingresos where venta_id = $1`, [venta]))
  assert.equal(ing.affectedRows, 0, 'el ingreso de una venta no se borra directamente')
})

test('la marca de operación no sobrevive fuera de la función', async () => {
  const id = await productoConStock('Atún', 4)
  await rechaza(
    admin(async (tx) => {
      await tx.query('select registrar_venta(null, $1)', [JSON.stringify([{ producto_id: id, cantidad: 1 }])])
      await tx.query('update productos set cantidad = 500 where id = $1', [id])
    }),
    /solo cambian con ventas/,
  )
})

test('anular_venta devuelve existencias y retira el ingreso', async () => {
  const id = await productoConStock('Galletas', 6, 3800)
  const venta = await admin(async (tx) => (await uno(tx, 'select registrar_venta(null, $1) as id', [JSON.stringify([{ producto_id: id, cantidad: 4 }])])).id)
  await admin((tx) => tx.query('select anular_venta($1)', [venta]))
  const p = await admin((tx) => uno(tx, 'select cantidad from productos where id = $1', [id]))
  assert.equal(p.cantidad, 6)
  const v = await admin((tx) => uno(tx, 'select estado from ventas where id = $1', [venta]))
  assert.equal(v.estado, 'anulada')
  assert.equal((await admin((tx) => filas(tx, 'select 1 from ingresos where venta_id = $1', [venta]))).length, 0)
  await rechaza(admin((tx) => tx.query('select anular_venta($1)', [venta])), /ya fue anulada/)
  await rechaza(admin((tx) => tx.query(`select anular_venta('00000000-0000-4000-8000-000000000000')`)), /no encontrada/)
})

// ── Entradas y conteo físico ──────────────────────────────────────────────

test('registrar_entrada suma existencias, actualiza costo y genera el egreso', async () => {
  const id = await productoConStock('Azúcar', 2, 4800)
  const items = JSON.stringify([{ producto_id: id, cantidad: 10, costo_unitario: 4000 }])
  const ref = await admin(async (tx) => (await uno(tx, `select registrar_entrada(null, 'Distribuidora El Llano', $1, true, true) as ref`, [items])).ref)
  const p = await admin((tx) => uno(tx, 'select cantidad, precio_compra::float from productos where id = $1', [id]))
  assert.deepEqual(p, { cantidad: 12, precio_compra: 4000 })
  const e = await admin((tx) => uno(tx, 'select concepto, monto::float, tipo from egresos where referencia_id = $1', [ref]))
  assert.deepEqual(e, { concepto: 'Distribuidora El Llano', monto: 40000, tipo: 'compra_mercancia' })

  const ref2 = await admin(async (tx) => (await uno(tx, `select registrar_entrada(null, 'ab', $1, true, false) as ref`, [items])).ref)
  const e2 = await admin((tx) => uno(tx, 'select concepto from egresos where referencia_id = $1', [ref2]))
  assert.equal(e2.concepto, 'Compra de mercancía', 'un concepto muy corto usa el texto por defecto')

  await rechaza(admin((tx) => tx.query(`select registrar_entrada(null, '', '[]', false, false)`)), /no tiene productos/)
  await rechaza(
    admin((tx) => tx.query(`select registrar_entrada(null, '', $1, false, false)`, [JSON.stringify([{ producto_id: id, cantidad: 1, costo_unitario: -5 }])])),
    /Costo inválido/,
  )
  await rechaza(
    admin((tx) => tx.query(`select registrar_entrada(null, '', $1, false, false)`, [JSON.stringify([{ producto_id: id, cantidad: 2000000 }])])),
    /productos_cantidad_rango/,
  )
})

test('ajustar_inventario registra las diferencias del conteo físico', async () => {
  const a = await productoConStock('Jabón', 10)
  const b = await productoConStock('Detergente', 4)
  const items = JSON.stringify([
    { producto_id: a, cantidad_fisica: 8 },
    { producto_id: b, cantidad_fisica: 4 },
  ])
  const n = await admin(async (tx) => (await uno(tx, `select ajustar_inventario(null, 'Conteo semanal', $1) as n`, [items])).n)
  assert.equal(n, 1)
  const m = await admin((tx) => uno(tx, `select tipo, cantidad, stock_resultante, motivo from movimientos_inventario where producto_id = $1 and tipo = 'ajuste'`, [a]))
  assert.deepEqual(m, { tipo: 'ajuste', cantidad: -2, stock_resultante: 8, motivo: 'Conteo semanal' })
  await rechaza(
    admin((tx) => tx.query(`select ajustar_inventario(null, 'x', $1)`, [JSON.stringify([{ producto_id: a, cantidad_fisica: -1 }])])),
    /Cantidad inválida/,
  )
})

// ── Ingresos y egresos ────────────────────────────────────────────────────

test('ingresos y egresos: fecha, concepto, monto y tipo', async () => {
  const insertar = (tabla, fila) =>
    admin((tx) => tx.query(`insert into ${tabla} (fecha, concepto, monto, tipo) values ($1, $2, $3, $4)`, [fila.fecha, fila.concepto, fila.monto, fila.tipo]))
  const hoy = new Date().toISOString().slice(0, 10)
  const base = { fecha: '2026-01-15', concepto: 'Factura de energía', monto: 86500, tipo: 'servicios_publicos' }
  await insertar('egresos', base)
  await rechaza(insertar('egresos', { ...base, concepto: 'ab' }), /egresos_concepto_longitud/)
  await rechaza(insertar('egresos', { ...base, monto: 0 }), /egresos_monto_rango/)
  await rechaza(insertar('egresos', { ...base, tipo: 'loteria' }), /egresos_tipo_valido/)
  await rechaza(insertar('egresos', { ...base, fecha: '1999-12-31' }), /egresos_fecha_minima/)
  await rechaza(insertar('egresos', { ...base, fecha: '2999-01-01' }), /posterior a hoy/)
  await insertar('ingresos', { fecha: hoy, concepto: 'Aporte de la propietaria', monto: 200000, tipo: 'aporte' })
  await rechaza(insertar('ingresos', { fecha: hoy, concepto: 'Venta falsa', monto: 1, tipo: 'regalo' }), /ingresos_tipo_valido/)
  await rechaza(
    admin((tx) => tx.query(`insert into ingresos (concepto, monto, venta_id) select 'Venta inventada', 100, id from ventas limit 1`)),
    /row-level security/,
  )
})

// ── Respaldo ──────────────────────────────────────────────────────────────

test('importar_respaldo restaura en orden y puede repetirse', async () => {
  const cat = { id: 'aaaaaaaa-0000-4000-8000-000000000001', nombre: 'Importada', descripcion: '' }
  const prod = {
    id: 'aaaaaaaa-0000-4000-8000-000000000002', nombre: 'Producto importado', codigo_barras: 'IMP-0001',
    categoria_id: cat.id, precio_compra: 1000, precio_venta: 1500, cantidad: 7, stock_minimo: 2, activo: true,
  }
  const venta = { id: 'aaaaaaaa-0000-4000-8000-000000000003', fecha: '2026-02-01T15:00:00Z', total: 3000, estado: 'registrada', detalles: [] }
  const detalle = { id: 'aaaaaaaa-0000-4000-8000-000000000004', venta_id: venta.id, producto_id: prod.id, nombre_producto: prod.nombre, cantidad: 2, precio_unitario: 1500, subtotal: 3000 }
  const ingreso = { id: 'aaaaaaaa-0000-4000-8000-000000000005', fecha: '2026-02-01', concepto: 'Venta de productos', monto: 3000, tipo: 'venta', venta_id: venta.id }

  const importar = (tabla, filas) => admin(async (tx) => (await uno(tx, 'select importar_respaldo($1, $2) as n', [tabla, JSON.stringify(filas)])).n)
  for (let vez = 0; vez < 2; vez++) {
    assert.equal(await importar('categorias', [cat]), 1)
    assert.equal(await importar('productos', [prod]), 1)
    assert.equal(await importar('ventas', [venta]), 1)
    await importar('detalle_venta', [detalle])
    assert.equal(await importar('ingresos', [ingreso]), 1)
  }
  const p = await admin((tx) => uno(tx, 'select cantidad from productos where id = $1', [prod.id]))
  assert.equal(p.cantidad, 7)
  await rechaza(importar('usuarios', []), /desconocida/)
  await rechaza(importar('productos', { no: 'es lista' }), /Formato de respaldo inválido/)
})

// ── Niveles de seguridad ──────────────────────────────────────────────────

const comoCajero = (fn) => como(CAJERO, fn)
const comoConsulta = (fn) => como(CONSULTA, fn)
const comoSupervisor = (fn) => como(SUPERVISOR, fn)

test('nivel 3 (cajero): vende, pero no edita inventario ni ve finanzas', async () => {
  const id = await productoConStock('Gaseosa del cajero', 10, 2800)
  const venta = await comoCajero(async (tx) =>
    (await uno(tx, 'select registrar_venta(null, $1) as id', [JSON.stringify([{ producto_id: id, cantidad: 2 }])])).id)
  const p = await admin((tx) => uno(tx, 'select cantidad from productos where id = $1', [id]))
  assert.equal(p.cantidad, 8, 'la venta del cajero descuenta existencias')
  const ingreso = await admin((tx) => uno(tx, 'select monto::float from ingresos where venta_id = $1', [venta]))
  assert.equal(ingreso.monto, 5600, 'y genera el ingreso aunque el cajero no vea finanzas')

  assert.equal((await comoCajero((tx) => filas(tx, 'select id from ingresos'))).length, 0)
  assert.equal((await comoCajero((tx) => filas(tx, 'select id from egresos'))).length, 0)
  assert.ok((await comoCajero((tx) => filas(tx, 'select id from productos'))).length > 0, 'sí consulta el inventario')

  const cat = await crearCategoria('Cat del cajero')
  await rechaza(comoCajero((tx) => tx.query('select crear_producto($1)', [{ nombre: 'Nuevo', categoria_id: cat, precio_venta: 100 }])), /nivel de acceso \(Cajero\)/)
  await rechaza(comoCajero((tx) => tx.query('select anular_venta($1)', [venta])), /nivel de acceso \(Cajero\)/)
  await rechaza(comoCajero((tx) => tx.query(`select registrar_entrada(null, '', $1, false, false)`, [JSON.stringify([{ producto_id: id, cantidad: 1 }])])), /nivel de acceso/)
  await rechaza(comoCajero((tx) => tx.query(`insert into categorias (nombre) values ('Del cajero')`)), /row-level security/)
  await rechaza(comoCajero((tx) => tx.query(`insert into egresos (concepto, monto, tipo) values ('Gasto', 100, 'otros')`)), /row-level security/)
  const r = await comoCajero((tx) => tx.query('update productos set precio_venta = 1 where id = $1', [id]))
  assert.equal(r.affectedRows, 0, 'el cajero no cambia precios')
})

test('nivel 4 (consulta): ve todo, no modifica nada', async () => {
  const id = await productoConStock('Producto de consulta', 5, 1000)
  assert.ok((await comoConsulta((tx) => filas(tx, 'select id from ingresos'))).length > 0, 've los ingresos')
  assert.ok((await comoConsulta((tx) => filas(tx, 'select id from ventas'))).length > 0, 've las ventas')
  await rechaza(comoConsulta((tx) => tx.query('select registrar_venta(null, $1)', [JSON.stringify([{ producto_id: id, cantidad: 1 }])])), /nivel de acceso \(Consulta\)/)
  await rechaza(comoConsulta((tx) => tx.query(`select ajustar_inventario(null, 'x', $1)`, [JSON.stringify([{ producto_id: id, cantidad_fisica: 0 }])])), /nivel de acceso/)
  await rechaza(comoConsulta((tx) => tx.query(`insert into egresos (concepto, monto, tipo) values ('Gasto', 100, 'otros')`)), /row-level security/)
  const r = await comoConsulta((tx) => tx.query('update productos set nombre = $2 where id = $1', [id, 'Cambiado']))
  assert.equal(r.affectedRows, 0)
  const d = await comoConsulta((tx) => tx.query('delete from egresos'))
  assert.equal(d.affectedRows, 0)
})

test('nivel 2 (supervisor): opera el negocio, sin respaldos ni usuarios', async () => {
  const cat = await admin(async (tx) => (await uno(tx, `insert into categorias (nombre) values ('Del supervisor') returning id`)).id)
  const id = await comoSupervisor(async (tx) =>
    (await uno(tx, 'select crear_producto($1) as id', [{ nombre: 'Del supervisor', categoria_id: cat, precio_venta: 1500, cantidad: 3 }])).id)
  await comoSupervisor((tx) => tx.query(`select registrar_entrada(null, 'Proveedor', $1, true, false)`, [JSON.stringify([{ producto_id: id, cantidad: 2, costo_unitario: 900 }])]))
  const venta = await comoSupervisor(async (tx) =>
    (await uno(tx, 'select registrar_venta(null, $1) as id', [JSON.stringify([{ producto_id: id, cantidad: 1 }])])).id)
  await comoSupervisor((tx) => tx.query('select anular_venta($1)', [venta]))
  await comoSupervisor((tx) => tx.query(`insert into egresos (concepto, monto, tipo, fecha) values ('Factura de agua', 32000, 'servicios_publicos', '2026-01-10')`))

  await rechaza(comoSupervisor((tx) => tx.query(`select importar_respaldo('categorias', '[]')`)), /nivel de acceso \(Supervisor\)/)
  await rechaza(comoSupervisor((tx) => tx.query('select * from listar_usuarios()')), /nivel de acceso/)
  await rechaza(comoSupervisor((tx) => tx.query(`select autorizar_usuario('nuevo@correo.com', 'Nuevo', 'administrador')`)), /nivel de acceso/)
  await rechaza(comoSupervisor((tx) => tx.query('select actualizar_usuario($1, $2, $3, true)', [SUPERVISOR, 'Supervisora', 'administrador'])), /nivel de acceso/)
})

test('nivel 1 (administrador): gestiona usuarios con protecciones', async () => {
  const lista = await admin((tx) => filas(tx, 'select nombre, correo, rol, activo from listar_usuarios()'))
  assert.ok(lista.some((u) => u.correo === 'cajero@britnymax.app' && u.rol === 'cajero'))

  await rechaza(admin((tx) => tx.query(`select autorizar_usuario('noexiste@correo.com', 'Nadie', 'cajero')`)), /No existe una cuenta/)
  await rechaza(admin((tx) => tx.query(`select autorizar_usuario('nuevo@correo.com', 'Nuevo', 'jefe')`)), /nivel de acceso válido/)
  const nuevo = await admin(async (tx) => (await uno(tx, `select autorizar_usuario('  NUEVO@correo.com ', 'Nuevo cajero', 'cajero') as id`)).id)
  assert.equal(nuevo, NUEVO, 'encuentra la cuenta sin importar mayúsculas ni espacios')
  await rechaza(admin((tx) => tx.query(`select autorizar_usuario('nuevo@correo.com', 'Otra vez', 'cajero')`)), /ya está registrada/)

  await admin((tx) => tx.query('select actualizar_usuario($1, $2, $3, $4)', [NUEVO, 'Nuevo supervisor', 'supervisor', true]))
  const cambiado = await admin((tx) => uno(tx, 'select nombre, rol from usuarios where id = $1', [NUEVO]))
  assert.deepEqual(cambiado, { nombre: 'Nuevo supervisor', rol: 'supervisor' })

  await admin((tx) => tx.query('select actualizar_usuario($1, $2, $3, false)', [NUEVO, 'Nuevo supervisor', 'supervisor']))
  await rechaza(como(NUEVO, (tx) => tx.query(`select registrar_venta(null, '[]')`)), /no está autorizado/)

  await rechaza(admin((tx) => tx.query('select actualizar_usuario($1, $2, $3, true)', [ADMIN, 'Britny Romero', 'cajero'])), /propio nivel/)
  await rechaza(admin((tx) => tx.query('select actualizar_usuario($1, $2, $3, false)', [ADMIN, 'Britny Romero', 'administrador'])), /desactivarte/)
  await rechaza(admin((tx) => tx.query('select actualizar_usuario($1, $2, $3, true)', [NUEVO, 'X', 'cajero'])), /usuarios_nombre_longitud/)
})

test('las funciones de nivel no se pueden llamar desde la API', async () => {
  await rechaza(como(null, (tx) => tx.query(`select privado.tiene_rol('administrador')`), { rol: 'anon' }), /permission denied/)
  await rechaza(como(null, (tx) => tx.query('select * from listar_usuarios()'), { rol: 'anon' }), /permission denied/)
})
