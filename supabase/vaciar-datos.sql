-- Deja la base lista para los datos reales de la tienda.
-- Pegar en: Supabase > SQL Editor > New query > Run.
begin;

-- Las existencias solo se pueden fijar dentro de una operación del sistema;
-- esta marca le dice al disparador que esto es una carga autorizada.
select set_config('britnymax.operacion', 'si', true);

-- Borra los datos del negocio. No toca las cuentas de usuario.
truncate public.detalle_venta, public.movimientos_inventario, public.ingresos,
         public.egresos, public.ventas, public.productos, public.categorias restart identity cascade;

commit;
