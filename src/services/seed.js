// Datos iniciales del modo demo: usuario administrador y un catálogo de
// ejemplo con tres semanas de ventas, compras y gastos para que el panel y
// los reportes muestren información desde el primer ingreso.

import { uid, hashContrasena, nuevaSal } from '../lib/seguridad.js'
import { hoyISO, sumarDias, parseFecha } from '../lib/format.js'
import * as ops from './operaciones.js'

// Cuentas del modo demo, una por nivel de seguridad. Solo existen en el
// navegador de quien usa la demo; sirven para mostrar qué ve cada nivel.
export const USUARIOS_DEMO = Object.freeze([
  { usuario: 'admin', contrasena: 'britny2026', nombre: 'Britny Romero', rol: 'administrador' },
  { usuario: 'supervisor', contrasena: 'super2026', nombre: 'Supervisora de turno', rol: 'supervisor' },
  { usuario: 'cajero', contrasena: 'cajero2026', nombre: 'Cajero de mostrador', rol: 'cajero' },
  { usuario: 'consulta', contrasena: 'consulta2026', nombre: 'Contador (consulta)', rol: 'consulta' },
])

export function baseVacia() {
  return { version: 1, usuarios: [], categorias: [], productos: [], ventas: [], movimientos: [], ingresos: [], egresos: [] }
}

export function crearUsuarioLocal({ usuario, contrasena, nombre, rol }) {
  const sal = nuevaSal()
  return {
    id: uid(),
    usuario: usuario.trim().toLowerCase(),
    nombre: nombre.trim(),
    rol,
    activo: true,
    sal,
    hash: hashContrasena(contrasena, sal),
    creado_en: new Date().toISOString(),
  }
}

export const crearUsuariosDemo = () => USUARIOS_DEMO.map(crearUsuarioLocal)

const CATEGORIAS = [
  ['Granos', 'Arroz, fríjol, lenteja y similares'],
  ['Lácteos', 'Leche, queso, yogur y derivados'],
  ['Bebidas', 'Gaseosas, agua, jugos y café'],
  ['Aseo', 'Limpieza del hogar y aseo personal'],
  ['Snacks', 'Paquetes, galletas y mecato'],
  ['Panadería', 'Pan y productos horneados'],
  ['Despensa', 'Aceite, azúcar, sal y enlatados'],
]

// [nombre, categoría, precio compra, precio venta, stock objetivo, stock mínimo]
const PRODUCTOS = [
  ['Arroz 500 g', 'Granos', 2400, 3000, 60, 12],
  ['Fríjol cargamanto 500 g', 'Granos', 5200, 6500, 36, 8],
  ['Lenteja 500 g', 'Granos', 2800, 3500, 30, 6],
  ['Leche entera 1 L', 'Lácteos', 3500, 4300, 48, 10],
  ['Queso campesino 250 g', 'Lácteos', 5500, 7000, 14, 5],
  ['Yogur de fresa 200 g', 'Lácteos', 1900, 2500, 30, 6],
  ['Gaseosa 400 ml', 'Bebidas', 2000, 2800, 60, 12],
  ['Café molido 250 g', 'Bebidas', 8000, 10500, 6, 3],
  ['Agua 600 ml', 'Bebidas', 1000, 1600, 48, 10],
  ['Jabón en barra', 'Aseo', 2300, 3200, 30, 6],
  ['Papel higiénico x4', 'Aseo', 5800, 7500, 24, 5],
  ['Detergente 500 g', 'Aseo', 4200, 5500, 24, 5],
  ['Papas fritas 45 g', 'Snacks', 1700, 2500, 48, 10],
  ['Galletas x6', 'Snacks', 2900, 3800, 36, 8],
  ['Pan tajado', 'Panadería', 4500, 6000, 24, 5],
  ['Aceite 1 L', 'Despensa', 9800, 12500, 24, 5],
  ['Azúcar 1 kg', 'Despensa', 3900, 4800, 36, 8],
  ['Atún en lata', 'Despensa', 4700, 6200, 30, 6],
]

/** EAN-13 ficticio con prefijo de Colombia (770) y dígito de control válido. */
function ean13(n) {
  const base = `7709990${String(n).padStart(5, '0')}`
  const suma = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base + ((10 - (suma % 10)) % 10)
}

/** Generador pseudoaleatorio con semilla para que la demo sea reproducible. */
function aleatorio(semilla) {
  let a = semilla
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function momento(dia, horaDecimal) {
  const d = parseFecha(dia)
  d.setHours(Math.floor(horaDecimal), Math.floor((horaDecimal % 1) * 60), 0, 0)
  return d.toISOString()
}

export function crearBaseDemo(usuarios = crearUsuariosDemo()) {
  const db = baseVacia()
  db.usuarios = usuarios
  const rnd = aleatorio(2026)
  const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1))
  const hoy = hoyISO()
  const inicio = sumarDias(hoy, -21)
  const ahora = new Date()

  const idCategoria = {}
  for (const [nombre, descripcion] of CATEGORIAS) {
    const c = { id: uid(), nombre, descripcion, creado_en: momento(inicio, 7) }
    db.categorias.push(c)
    idCategoria[nombre] = c.id
  }

  const objetivo = new Map()
  PRODUCTOS.forEach(([nombre, cat, compra, venta, stock, minimo], i) => {
    const p = ops.crearProducto(db, {
      nombre,
      codigo_barras: ean13(i + 1),
      categoria_id: idCategoria[cat],
      precio_compra: compra,
      precio_venta: venta,
      cantidad: stock,
      stock_minimo: minimo,
      creado_en: momento(inicio, 7.5),
    })
    objetivo.set(p.id, stock)
  })
  const buscar = (inicio) => db.productos.find((p) => p.nombre.startsWith(inicio))
  const cafe = buscar('Café')

  const reabastecer = (dia, excluidos = []) => {
    const items = db.productos
      .filter((p) => !excluidos.includes(p))
      .map((p) => ({ producto_id: p.id, cantidad: objetivo.get(p.id) - p.cantidad, costo_unitario: p.precio_compra }))
      .filter((it) => it.cantidad > 0)
    if (items.length) {
      ops.registrarEntrada(db, {
        fecha: momento(dia, 6.5),
        concepto: 'Compra semanal a proveedor',
        items,
        registrarEgreso: true,
      })
    }
  }

  for (let offset = -20; offset <= 0; offset++) {
    const dia = sumarDias(hoy, offset)
    // El café no se repone en la última compra y termina agotado.
    if (offset === -14) reabastecer(dia)
    if (offset === -7) reabastecer(dia, [cafe])

    const ventasDelDia = entre(4, 8)
    for (let v = 0; v < ventasDelDia; v++) {
      const h = 7 + rnd() * 13
      const fecha = momento(dia, h)
      if (new Date(fecha) > ahora) continue
      const disponibles = db.productos.filter((p) => p.cantidad > 0)
      const items = []
      for (let k = entre(1, 4); k > 0 && disponibles.length; k--) {
        const [p] = disponibles.splice(entre(0, disponibles.length - 1), 1)
        items.push({ producto_id: p.id, cantidad: Math.min(entre(1, 2), p.cantidad) })
      }
      if (items.length) ops.registrarVenta(db, { fecha, items })
    }

    // Conteo físico con dos diferencias (detección de discrepancias).
    if (offset === -3) {
      const galletas = buscar('Galletas')
      const jabon = buscar('Jabón')
      ops.ajustarInventario(db, {
        fecha: momento(dia, 20.95),
        motivo: 'Conteo físico semanal',
        items: [
          { producto_id: galletas.id, cantidad_fisica: Math.max(galletas.cantidad - 2, 0) },
          { producto_id: jabon.id, cantidad_fisica: Math.max(jabon.cantidad - 1, 0) },
        ],
      })
    }

    // El café termina agotado para mostrar la alerta de reabastecimiento.
    if (offset === -1 && cafe.cantidad > 0) {
      ops.registrarVenta(db, { fecha: momento(dia, 20.9), items: [{ producto_id: cafe.id, cantidad: cafe.cantidad }] })
    }
  }

  const gastos = [
    [-20, 'Arriendo del local', 350000, 'arriendo'],
    [-15, 'Factura de energía', 86500, 'servicios_publicos'],
    [-12, 'Factura de acueducto', 32400, 'servicios_publicos'],
    [-9, 'Internet y telefonía', 55000, 'servicios_publicos'],
    [-6, 'Transporte de mercancía', 25000, 'transporte'],
    [-2, 'Bolsas y empaques', 18000, 'otros'],
  ]
  for (const [offset, concepto, monto, tipo] of gastos) {
    const fecha = sumarDias(hoy, offset)
    db.egresos.push({ id: uid(), fecha, concepto, monto, tipo, referencia_id: null, creado_en: momento(fecha, 12) })
  }

  return db
}
