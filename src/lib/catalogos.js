// Catálogos y reglas de negocio compartidas por las vistas.

export function estadoStock(p) {
  if (Number(p.cantidad) <= 0) return 'agotado'
  if (Number(p.cantidad) <= Number(p.stock_minimo || 0)) return 'bajo'
  return 'disponible'
}

export const TIPOS_INGRESO = [
  { id: 'venta', label: 'Venta' },
  { id: 'aporte', label: 'Aporte de capital' },
  { id: 'otro', label: 'Otro ingreso' },
]

export const TIPOS_EGRESO = [
  { id: 'compra_mercancia', label: 'Compra de mercancía' },
  { id: 'servicios_publicos', label: 'Servicios públicos' },
  { id: 'arriendo', label: 'Arriendo' },
  { id: 'nomina', label: 'Pagos a personal' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'otros', label: 'Otros gastos' },
]

export const TIPOS_MOVIMIENTO = [
  { id: 'entrada', label: 'Entrada' },
  { id: 'salida', label: 'Salida' },
  { id: 'ajuste', label: 'Ajuste' },
]

const etiquetas = Object.fromEntries(
  [...TIPOS_INGRESO, ...TIPOS_EGRESO, ...TIPOS_MOVIMIENTO].map((t) => [t.id, t.label]),
)
export const etiquetaTipo = (id) => etiquetas[id] ?? id
