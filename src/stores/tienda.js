import { defineStore } from 'pinia'
import backend from '@/services'
import { estadoStock } from '@/lib/catalogos'
import { exigirPermiso } from '@/lib/permisos'
import { useAuthStore } from './auth'
import {
  exigirValido, validarCategoria, validarProducto, validarVenta, validarEntrada, validarAjuste, validarFinanza, validarRespaldo,
} from '@/lib/validaciones'

const num = (v) => Number(v) || 0
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')
const recientes = (a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : (b.creado_en ?? '') > (a.creado_en ?? '') ? 1 : -1)

function normalizar(d) {
  return {
    categorias: [...d.categorias].sort(porNombre),
    productos: d.productos.map((p) => ({
      ...p,
      precio_compra: num(p.precio_compra),
      precio_venta: num(p.precio_venta),
      cantidad: num(p.cantidad),
      stock_minimo: num(p.stock_minimo),
      activo: p.activo !== false,
    })),
    ventas: d.ventas
      .map((v) => ({
        ...v,
        total: num(v.total),
        detalles: (v.detalles ?? []).map((x) => ({
          ...x,
          cantidad: num(x.cantidad),
          precio_unitario: num(x.precio_unitario),
          subtotal: num(x.subtotal),
        })),
      }))
      .sort(recientes),
    movimientos: d.movimientos
      .map((m) => ({ ...m, cantidad: num(m.cantidad), stock_resultante: num(m.stock_resultante) }))
      .sort(recientes),
    ingresos: d.ingresos.map((i) => ({ ...i, monto: num(i.monto) })).sort(recientes),
    egresos: d.egresos.map((e) => ({ ...e, monto: num(e.monto) })).sort(recientes),
  }
}

/** Defensa en el cliente: el nivel del usuario debe permitir la acción (la base de datos también lo verifica). */
const exigir = (permiso) => exigirPermiso(useAuthStore().rol, permiso)

function exigirCondicion(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje)
}

export const useTiendaStore = defineStore('tienda', {
  state: () => ({
    categorias: [],
    productos: [],
    ventas: [],
    movimientos: [],
    ingresos: [],
    egresos: [],
    cargado: false,
    cargando: false,
    errorCarga: '',
  }),

  getters: {
    modo: () => backend.modo,
    /** Productos activos del catálogo, ordenados por nombre. */
    catalogo: (s) => s.productos.filter((p) => p.activo).sort(porNombre),
    categoriaPorId: (s) => Object.fromEntries(s.categorias.map((c) => [c.id, c])),
    productoPorId: (s) => Object.fromEntries(s.productos.map((p) => [p.id, p])),
    alertas() {
      return this.catalogo.filter((p) => estadoStock(p) !== 'disponible').sort((a, b) => a.cantidad - b.cantidad)
    },
  },

  actions: {
    nombreCategoria(id) {
      return this.categoriaPorId[id]?.nombre ?? 'Sin categoría'
    },
    buscarPorCodigo(codigo) {
      const c = String(codigo ?? '').trim()
      return c ? this.catalogo.find((p) => p.codigo_barras === c) : undefined
    },

    async cargar() {
      this.cargando = true
      this.errorCarga = ''
      try {
        this.$patch(normalizar(await backend.cargarTodo()))
        this.cargado = true
      } catch (e) {
        this.errorCarga = e.message
      } finally {
        this.cargando = false
      }
    },

    /** Ejecuta una operación y vuelve a leer los datos para reflejar los cambios. */
    async ejecutar(operacion) {
      const resultado = await operacion
      await this.cargar()
      return resultado
    },

    // RF02 / RF04 – Categorías y productos
    async guardarCategoria(datos) {
      exigir('inventario.editar')
      exigirValido(validarCategoria(datos, { categorias: this.categorias }))
      return this.ejecutar(
        backend.guardarCategoria({ id: datos.id, nombre: datos.nombre.trim(), descripcion: (datos.descripcion ?? '').trim() }),
      )
    },
    async eliminarCategoria(id) {
      exigir('inventario.editar')
      const usados = this.catalogo.filter((p) => p.categoria_id === id).length
      exigirCondicion(!usados, `No se puede eliminar: hay ${usados} producto(s) en esta categoría`)
      return this.ejecutar(backend.eliminarCategoria(id))
    },
    async guardarProducto(datos) {
      exigir('inventario.editar')
      exigirValido(validarProducto(datos, { productos: this.productos, categorias: this.categorias }))
      return this.ejecutar(
        backend.guardarProducto({
          id: datos.id,
          nombre: datos.nombre.trim(),
          codigo_barras: (datos.codigo_barras ?? '').trim() || null,
          categoria_id: datos.categoria_id,
          precio_compra: Number(datos.precio_compra),
          precio_venta: Number(datos.precio_venta),
          cantidad: Number(datos.cantidad ?? 0),
          stock_minimo: Number(datos.stock_minimo),
        }),
      )
    },
    async eliminarProducto(id) {
      exigir('inventario.editar')
      return this.ejecutar(backend.eliminarProducto(id))
    },

    // RF07 – Salidas por venta
    async registrarVenta({ fecha, items }) {
      exigir('ventas.registrar')
      exigirValido(validarVenta({ fecha, items }, { productoPorId: this.productoPorId }))
      return this.ejecutar(
        backend.registrarVenta({
          fecha,
          items: items.map((it) => ({ producto_id: it.producto_id, cantidad: Number(it.cantidad), precio_unitario: Number(it.precio_unitario) })),
        }),
      )
    },
    async anularVenta(id) {
      exigir('ventas.anular')
      const venta = this.ventas.find((v) => v.id === id)
      exigirCondicion(venta, 'Venta no encontrada')
      exigirCondicion(venta.estado !== 'anulada', 'La venta ya fue anulada')
      return this.ejecutar(backend.anularVenta(id))
    },

    // Entradas de mercancía y conteo físico
    async registrarEntrada(datos) {
      exigir('inventario.entradas')
      exigirValido(validarEntrada(datos, { productoPorId: this.productoPorId }))
      return this.ejecutar(
        backend.registrarEntrada({
          ...datos,
          concepto: (datos.concepto ?? '').trim(),
          items: datos.items.map((it) => ({ producto_id: it.producto_id, cantidad: Number(it.cantidad), costo_unitario: Number(it.costo_unitario) || 0 })),
        }),
      )
    },
    async ajustarInventario(datos) {
      exigir('inventario.conteo')
      exigirValido(validarAjuste(datos, { productoPorId: this.productoPorId }))
      return this.ejecutar(
        backend.ajustarInventario({
          ...datos,
          motivo: datos.motivo.trim(),
          items: datos.items.map((it) => ({ producto_id: it.producto_id, cantidad_fisica: Number(it.cantidad_fisica) })),
        }),
      )
    },

    // RF11 – Ingresos y egresos
    async guardarFinanza(clase, datos) {
      exigir('finanzas.editar')
      exigirValido(validarFinanza(clase, datos))
      if (datos.id && clase === 'ingreso') {
        exigirCondicion(!this.ingresos.find((i) => i.id === datos.id)?.venta_id, 'Este ingreso fue generado por una venta; anula la venta para modificarlo')
      }
      return this.ejecutar(
        backend.guardarFinanza(clase, { id: datos.id, fecha: datos.fecha, tipo: datos.tipo, concepto: datos.concepto.trim(), monto: Number(datos.monto) }),
      )
    },
    async eliminarFinanza(clase, id) {
      exigir('finanzas.editar')
      if (clase === 'ingreso') {
        exigirCondicion(!this.ingresos.find((i) => i.id === id)?.venta_id, 'Este ingreso fue generado por una venta; anula la venta desde el historial')
      }
      return this.ejecutar(backend.eliminarFinanza(clase, id))
    },

    // RNF09 – Respaldo de información
    crearRespaldo() {
      exigir('respaldo.descargar')
      return {
        app: 'britny-max',
        version: 1,
        exportado_en: new Date().toISOString(),
        datos: {
          categorias: this.categorias,
          productos: this.productos,
          ventas: this.ventas,
          movimientos: this.movimientos,
          ingresos: this.ingresos,
          egresos: this.egresos,
        },
      }
    },
    async restaurarRespaldo(respaldo) {
      exigir('respaldo.restaurar')
      return this.ejecutar(backend.importar(validarRespaldo(respaldo)))
    },
    async restablecer(conDatosDeEjemplo) {
      exigir('respaldo.restaurar')
      exigirCondicion(backend.restablecer, 'Esta opción solo está disponible en el modo demo')
      return this.ejecutar(backend.restablecer(conDatosDeEjemplo))
    },
  },
})
