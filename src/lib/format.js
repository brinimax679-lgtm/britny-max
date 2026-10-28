// Formatos de moneda, números y fechas (es-CO).
// Las fechas "de calendario" se guardan como 'YYYY-MM-DD' y siempre se
// interpretan en hora local para evitar corrimientos por zona horaria.

const fmtDinero = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const fmtNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

const fmtCompacto = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const dinero = (n) => fmtDinero.format(Math.round(Number(n) || 0))
export const dineroCompacto = (n) => fmtCompacto.format(Number(n) || 0)
export const numero = (n) => fmtNumero.format(Number(n) || 0)

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = MESES.map((m) => m.slice(0, 3))

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/

export function isoLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

export const hoyISO = () => isoLocal(new Date())

export function parseFecha(valor) {
  if (!valor) return null
  if (valor instanceof Date) return valor
  if (RE_DIA.test(valor)) {
    const [y, m, d] = valor.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(valor)
}

/** Día local ('YYYY-MM-DD') de una fecha o marca de tiempo. */
export const diaDe = (valor) => (RE_DIA.test(valor) ? valor : isoLocal(parseFecha(valor)))

export function fechaCorta(valor) {
  const d = parseFecha(valor)
  if (!d) return ''
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`
}

export function fechaLarga(valor) {
  const d = parseFecha(valor)
  if (!d) return ''
  return `${d.getDate()} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`
}

export function hora(valor) {
  const d = parseFecha(valor)
  return d ? d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
}

export const fechaHora = (valor) => `${fechaCorta(valor)}, ${hora(valor)}`

export function sumarDias(iso, dias) {
  const d = parseFecha(iso)
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

export const PRESETS = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mes-anterior', label: 'Mes anterior' },
  { id: 'anio', label: 'Este año' },
  { id: 'todo', label: 'Todo el historial' },
  { id: 'personalizado', label: 'Personalizado' },
]

export function rangoPreset(preset) {
  const hoy = new Date()
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  const h = isoLocal(hoy)
  switch (preset) {
    case 'hoy':
      return { desde: h, hasta: h }
    case '7d':
      return { desde: sumarDias(h, -6), hasta: h }
    case '30d':
      return { desde: sumarDias(h, -29), hasta: h }
    case 'mes':
      return { desde: isoLocal(new Date(y, m, 1)), hasta: h }
    case 'mes-anterior':
      return { desde: isoLocal(new Date(y, m - 1, 1)), hasta: isoLocal(new Date(y, m, 0)) }
    case 'anio':
      return { desde: isoLocal(new Date(y, 0, 1)), hasta: h }
    default:
      return { desde: '', hasta: '' }
  }
}

export const periodoInicial = (preset = 'mes') => ({ preset, ...rangoPreset(preset) })

export function enRango(valor, { desde, hasta } = {}) {
  const d = diaDe(valor)
  return (!desde || d >= desde) && (!hasta || d <= hasta)
}

export function describirRango({ desde, hasta } = {}) {
  if (!desde && !hasta) return 'Todo el historial'
  if (desde === hasta) return fechaCorta(desde)
  return `${desde ? fechaCorta(desde) : 'inicio'} – ${hasta ? fechaCorta(hasta) : 'hoy'}`
}

/** Minúsculas y sin tildes, para búsquedas tolerantes ("lacteos" encuentra "Lácteos"). */
export const normalizarTexto = (s = '') =>
  String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes[1]?.[0] ?? partes[0][1] ?? '')).toUpperCase()
}
