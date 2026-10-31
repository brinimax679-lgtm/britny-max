// Niveles de seguridad (roles) y lo que cada uno puede hacer.
// PERMISOS es la matriz inicial; el administrador la cambia desde «Usuarios y
// niveles» y queda guardada en la tabla permisos_rol, que las políticas y
// funciones de supabase/schema.sql consultan: la base de datos rechaza lo
// mismo que la interfaz oculta (RNF02).

export const ROLES = Object.freeze([
  {
    id: 'administrador',
    nivel: 1,
    nombre: 'Administrador',
    descripcion: 'Control total: usuarios, respaldos y todas las operaciones del negocio.',
  },
  {
    id: 'supervisor',
    nivel: 2,
    nombre: 'Supervisor',
    descripcion: 'Opera todo el negocio (inventario, ventas, finanzas y reportes); no administra usuarios ni restaura respaldos.',
  },
  {
    id: 'cajero',
    nivel: 3,
    nombre: 'Cajero',
    descripcion: 'Registra ventas y consulta productos; no ve finanzas ni modifica el inventario.',
  },
  {
    id: 'consulta',
    nivel: 4,
    nombre: 'Consulta',
    descripcion: 'Solo lectura de inventario, ventas, finanzas y reportes; no puede modificar nada.',
  },
])

const A = 'administrador'
const S = 'supervisor'
const C = 'cajero'
const Q = 'consulta'

export const PERMISOS = Object.freeze({
  'inventario.ver': [A, S, C, Q],
  'inventario.editar': [A, S], // productos y categorías
  'inventario.entradas': [A, S],
  'inventario.conteo': [A, S],
  'ventas.registrar': [A, S, C],
  'ventas.ver': [A, S, C, Q],
  'ventas.anular': [A, S],
  'finanzas.ver': [A, S, Q],
  'finanzas.editar': [A, S],
  'reportes.ver': [A, S, Q],
  'respaldo.descargar': [A, S],
  'respaldo.restaurar': [A],
  'usuarios.gestionar': [A],
})

/** Texto de cada permiso, para mostrar la matriz de niveles en la aplicación. */
export const DESCRIPCION_PERMISOS = Object.freeze({
  'inventario.ver': 'Consultar productos y leer códigos de barras',
  'inventario.editar': 'Registrar, editar y eliminar productos y categorías',
  'inventario.entradas': 'Registrar entradas de mercancía',
  'inventario.conteo': 'Hacer conteos físicos y ajustes de inventario',
  'ventas.registrar': 'Registrar ventas',
  'ventas.ver': 'Consultar el historial de ventas',
  'ventas.anular': 'Anular ventas',
  'finanzas.ver': 'Consultar ingresos y egresos',
  'finanzas.editar': 'Registrar, editar y eliminar ingresos y egresos',
  'reportes.ver': 'Consultar y exportar reportes',
  'respaldo.descargar': 'Descargar respaldos de la información',
  'respaldo.restaurar': 'Restaurar respaldos y borrar datos',
  'usuarios.gestionar': 'Administrar usuarios y niveles de acceso',
})

export const rolValido = (rol) => ROLES.some((r) => r.id === rol)
export const datosRol = (rol) => ROLES.find((r) => r.id === rol) ?? null
export const nombreRol = (rol) => datosRol(rol)?.nombre ?? 'Sin nivel'

/** El administrador tiene todos los permisos; los niveles 2 a 4 tienen los que él les asigne. */
export const ROLES_EDITABLES = Object.freeze(['supervisor', 'cajero', 'consulta'])
/** Permisos que no se pueden asignar a otros niveles. */
export const PERMISOS_SOLO_ADMIN = Object.freeze(['usuarios.gestionar'])
export const PERMISOS_ASIGNABLES = Object.freeze(Object.keys(PERMISOS).filter((p) => !PERMISOS_SOLO_ADMIN.includes(p)))

/**
 * Permisos que necesita cada uno para funcionar (por ejemplo, vender exige ver
 * el inventario). Al asignar uno se agregan sus requisitos; al quitar un
 * requisito se quitan los que dependen de él.
 */
export const REQUISITOS = Object.freeze({
  'inventario.editar': ['inventario.ver'],
  'inventario.entradas': ['inventario.ver'],
  'inventario.conteo': ['inventario.ver'],
  'ventas.registrar': ['inventario.ver'],
  'ventas.anular': ['ventas.ver'],
  'finanzas.editar': ['finanzas.ver'],
  'respaldo.restaurar': ['respaldo.descargar'],
})

/** Matriz inicial como lista [{ rol, permiso }], igual a la que carga schema.sql. */
export function permisosPorDefecto() {
  return ROLES_EDITABLES.flatMap((rol) =>
    PERMISOS_ASIGNABLES.filter((p) => PERMISOS[p].includes(rol)).map((permiso) => ({ rol, permiso })))
}

/** Lista [{ rol, permiso }] → { supervisor: [...], cajero: [...], consulta: [...] }. */
export function agruparPermisos(lista) {
  const grupos = Object.fromEntries(ROLES_EDITABLES.map((r) => [r, []]))
  for (const { rol, permiso } of lista ?? []) {
    if (grupos[rol] && PERMISOS_ASIGNABLES.includes(permiso) && !grupos[rol].includes(permiso)) grupos[rol].push(permiso)
  }
  return grupos
}

/** Valida la lista que se va a guardar: niveles y permisos conocidos, sin repetidos y con sus requisitos. */
export function normalizarPermisos(lista) {
  if (!Array.isArray(lista)) throw new Error('Formato de permisos inválido')
  for (const { rol, permiso } of lista) {
    if (!ROLES_EDITABLES.includes(rol)) throw new Error('Solo se pueden cambiar los permisos de supervisor, cajero y consulta')
    if (!PERMISOS_ASIGNABLES.includes(permiso)) throw new Error(`El permiso «${permiso}» no se puede asignar`)
  }
  const grupos = agruparPermisos(lista)
  for (const rol of ROLES_EDITABLES) {
    for (const permiso of [...grupos[rol]]) {
      for (const req of REQUISITOS[permiso] ?? []) if (!grupos[rol].includes(req)) grupos[rol].push(req)
    }
  }
  return ROLES_EDITABLES.flatMap((rol) => PERMISOS_ASIGNABLES.filter((p) => grupos[rol].includes(p)).map((permiso) => ({ rol, permiso })))
}

/**
 * ¿El rol puede realizar la acción? `asignados` es la matriz que configuró el
 * administrador ({ rol: [permisos] }); sin ella se usa la matriz inicial.
 * Un permiso desconocido siempre se niega.
 */
export function puede(rol, permiso, asignados = null) {
  if (!rol || !PERMISOS[permiso] || !rolValido(rol)) return false
  if (rol === 'administrador') return true
  if (PERMISOS_SOLO_ADMIN.includes(permiso)) return false
  if (asignados) return asignados[rol]?.includes(permiso) ?? false
  return PERMISOS[permiso].includes(rol)
}

/** Lanza un error si el rol no tiene el permiso (defensa en el cliente y en el modo demo). */
export function exigirPermiso(rol, permiso, asignados = null) {
  if (!puede(rol, permiso, asignados)) {
    const error = new Error(`Tu nivel de acceso (${nombreRol(rol)}) no permite esta operación`)
    error.codigo = 'sin-permiso'
    throw error
  }
}
