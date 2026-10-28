// Niveles de seguridad (roles) y lo que cada uno puede hacer.
// La misma matriz está en supabase/schema.sql (políticas y funciones), de modo
// que la base de datos rechaza lo mismo que la interfaz oculta (RNF02).

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

/** ¿El rol puede realizar la acción? Un permiso desconocido siempre se niega. */
export function puede(rol, permiso) {
  return Boolean(rol) && (PERMISOS[permiso]?.includes(rol) ?? false)
}

/** Lanza un error si el rol no tiene el permiso (defensa en el cliente y en el modo demo). */
export function exigirPermiso(rol, permiso) {
  if (!puede(rol, permiso)) {
    const error = new Error(`Tu nivel de acceso (${nombreRol(rol)}) no permite esta operación`)
    error.codigo = 'sin-permiso'
    throw error
  }
}
