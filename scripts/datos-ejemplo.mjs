// Genera el SQL para cargar (o borrar) los datos de ejemplo en Supabase.
// El contenido sale del mismo generador que usa el modo demo, así que los
// movimientos, ventas, ingresos y egresos siempre quedan cuadrados.
//
//   npm run datos:ejemplo          -> escribe supabase/datos-ejemplo.sql
//   npm run datos:ejemplo -- vaciar -> escribe supabase/vaciar-datos.sql
//
// Luego se pega el archivo en el SQL Editor de Supabase y se ejecuta.

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { crearBaseDemo } from '../src/services/seed.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const vaciar = process.argv[2] === 'vaciar'

const TABLAS = `public.detalle_venta, public.movimientos_inventario, public.ingresos,
         public.egresos, public.ventas, public.productos, public.categorias`

const CABECERA = `-- Las existencias solo se pueden fijar dentro de una operación del sistema;
-- esta marca le dice al disparador que esto es una carga autorizada.
select set_config('britnymax.operacion', 'si', true);

-- Borra los datos del negocio. No toca las cuentas de usuario.
truncate ${TABLAS} restart identity cascade;`

const txt = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replaceAll("'", "''")}'`)
const num = (v) => (v === null || v === undefined ? 'null' : String(Number(v)))

/** INSERT multi-fila, en bloques para no generar sentencias gigantes. */
function inserta(tabla, columnas, filas, valores, porBloque = 200) {
  const partes = []
  for (let i = 0; i < filas.length; i += porBloque) {
    partes.push(
      `insert into public.${tabla} (${columnas.join(', ')}) values\n` +
        filas.slice(i, i + porBloque).map((f) => `  (${valores(f).join(', ')})`).join(',\n') +
        ';',
    )
  }
  return partes.join('\n')
}

mkdirSync(join(raiz, 'supabase'), { recursive: true })

if (vaciar) {
  const sql = `-- Deja la base lista para los datos reales de la tienda.
-- Pegar en: Supabase > SQL Editor > New query > Run.
begin;

${CABECERA}

commit;
`
  const salida = join(raiz, 'supabase', 'vaciar-datos.sql')
  writeFileSync(salida, sql, 'utf8')
  console.log(`Listo: ${salida}\nPégalo en el SQL Editor de Supabase para borrar los datos de ejemplo.`)
  process.exit(0)
}

const db = crearBaseDemo([])
const detalles = db.ventas.flatMap((v) => v.detalles ?? [])

const sql = [
  `-- Datos de ejemplo de Britny Max (generados por src/services/seed.js).
-- Pegar en: Supabase > SQL Editor > New query > Run.
-- Todo va en una transacción: si algo falla, no queda nada a medias.
begin;

${CABECERA}`,

  inserta('categorias', ['id', 'nombre', 'descripcion', 'creado_en'], db.categorias, (c) => [
    txt(c.id), txt(c.nombre), txt(c.descripcion ?? ''), txt(c.creado_en),
  ]),

  inserta(
    'productos',
    ['id', 'nombre', 'codigo_barras', 'categoria_id', 'precio_compra', 'precio_venta', 'cantidad', 'stock_minimo', 'activo', 'creado_en'],
    db.productos,
    (p) => [
      txt(p.id), txt(p.nombre), txt(p.codigo_barras), txt(p.categoria_id),
      num(p.precio_compra), num(p.precio_venta), num(p.cantidad), num(p.stock_minimo),
      p.activo !== false ? 'true' : 'false', txt(p.creado_en),
    ],
  ),

  inserta('ventas', ['id', 'fecha', 'total', 'estado', 'creado_en'], db.ventas, (v) => [
    txt(v.id), txt(v.fecha), num(v.total), txt(v.estado ?? 'registrada'), txt(v.creado_en),
  ]),

  inserta(
    'detalle_venta',
    ['id', 'venta_id', 'producto_id', 'nombre_producto', 'cantidad', 'precio_unitario', 'subtotal'],
    detalles,
    (d) => [
      txt(d.id), txt(d.venta_id), txt(d.producto_id), txt(d.nombre_producto),
      num(d.cantidad), num(d.precio_unitario), num(d.subtotal),
    ],
  ),

  inserta(
    'movimientos_inventario',
    ['id', 'fecha', 'producto_id', 'nombre_producto', 'tipo', 'cantidad', 'stock_resultante', 'motivo', 'referencia_id'],
    db.movimientos,
    (m) => [
      txt(m.id), txt(m.fecha), txt(m.producto_id), txt(m.nombre_producto), txt(m.tipo),
      num(m.cantidad), num(m.stock_resultante), txt(m.motivo ?? ''), txt(m.referencia_id),
    ],
  ),

  inserta('ingresos', ['id', 'fecha', 'concepto', 'monto', 'tipo', 'venta_id', 'creado_en'], db.ingresos, (i) => [
    txt(i.id), txt(i.fecha), txt(i.concepto), num(i.monto), txt(i.tipo), txt(i.venta_id), txt(i.creado_en),
  ]),

  inserta('egresos', ['id', 'fecha', 'concepto', 'monto', 'tipo', 'referencia_id', 'creado_en'], db.egresos, (e) => [
    txt(e.id), txt(e.fecha), txt(e.concepto), num(e.monto), txt(e.tipo), txt(e.referencia_id), txt(e.creado_en),
  ]),

  'commit;',
].join('\n\n') + '\n'

const salida = join(raiz, 'supabase', 'datos-ejemplo.sql')
writeFileSync(salida, sql, 'utf8')

console.log(
  `Listo: ${salida} (${Math.round(sql.length / 1024)} KB)\n` +
    `  ${db.categorias.length} categorías · ${db.productos.length} productos · ${db.ventas.length} ventas · ` +
    `${db.movimientos.length} movimientos · ${db.ingresos.length} ingresos · ${db.egresos.length} egresos\n` +
    `Pégalo en el SQL Editor de Supabase y ejecútalo.`,
)
