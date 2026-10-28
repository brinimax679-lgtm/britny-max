-- =====================================================================
--  Britny Max · Sistema de gestión de inventarios, ingresos y egresos
--  Esquema para Supabase (PostgreSQL 15+).
--
--  Ejecutar completo en: Supabase > SQL Editor > New query > Run.
--  Es seguro volver a ejecutarlo: actualiza funciones, políticas y
--  disparadores sin borrar datos.
--
--  Los límites coinciden con src/lib/validaciones.js (RNF07).
-- =====================================================================

-- Esquema privado (no expuesto por la API) para funciones auxiliares.
create schema if not exists privado;

-- ---------------------------------------------------------------------
--  1. Usuarios autorizados (clase Usuario del diagrama)
--     La cuenta se crea en Supabase Auth; aquí se autoriza su acceso.
-- ---------------------------------------------------------------------

create table if not exists public.usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null constraint usuarios_nombre_longitud check (char_length(btrim(nombre)) between 2 and 80),
  rol        text not null default 'consulta' constraint usuarios_rol_valido
             check (rol in ('administrador', 'supervisor', 'cajero', 'consulta')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Niveles de seguridad: 1 administrador · 2 supervisor · 3 cajero · 4 consulta
-- (misma matriz que src/lib/permisos.js). Actualiza bases de la versión anterior.
alter table public.usuarios drop constraint if exists usuarios_rol_valido;
update public.usuarios set rol = 'cajero' where rol not in ('administrador', 'supervisor', 'cajero', 'consulta');
alter table public.usuarios add constraint usuarios_rol_valido
  check (rol in ('administrador', 'supervisor', 'cajero', 'consulta'));

-- ---------------------------------------------------------------------
--  2. Tablas de negocio
-- ---------------------------------------------------------------------

create table if not exists public.categorias (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null constraint categorias_nombre_longitud check (char_length(btrim(nombre)) between 2 and 60),
  descripcion  text not null default '' constraint categorias_descripcion_longitud check (char_length(descripcion) <= 120),
  creado_en    timestamptz not null default now()
);
create unique index if not exists categorias_nombre_unico on public.categorias (lower(btrim(nombre)));

create table if not exists public.productos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null constraint productos_nombre_longitud check (char_length(btrim(nombre)) between 2 and 120),
  codigo_barras  text constraint productos_codigo_formato check (codigo_barras is null or codigo_barras ~ '^[A-Za-z0-9-]{4,40}$'),
  categoria_id   uuid references public.categorias (id) on delete set null,
  precio_compra  numeric(14,2) not null default 0 constraint productos_precio_compra_rango check (precio_compra between 0 and 100000000),
  precio_venta   numeric(14,2) not null constraint productos_precio_venta_rango check (precio_venta > 0 and precio_venta <= 100000000),
  cantidad       integer not null default 0 constraint productos_cantidad_rango check (cantidad between 0 and 1000000),
  stock_minimo   integer not null default 0 constraint productos_stock_minimo_rango check (stock_minimo between 0 and 100000),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);
-- Un código de barras no puede repetirse entre productos activos.
create unique index if not exists productos_codigo_unico
  on public.productos (codigo_barras)
  where activo and codigo_barras is not null;
create index if not exists productos_categoria_idx on public.productos (categoria_id);

create table if not exists public.ventas (
  id          uuid primary key default gen_random_uuid(),
  fecha       timestamptz not null default now(),
  total       numeric(14,2) not null default 0 constraint ventas_total_rango check (total >= 0),
  estado      text not null default 'registrada' constraint ventas_estado_valido check (estado in ('registrada', 'anulada')),
  usuario_id  uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index if not exists ventas_fecha_idx on public.ventas (fecha);

create table if not exists public.detalle_venta (
  id               uuid primary key default gen_random_uuid(),
  venta_id         uuid not null references public.ventas (id) on delete cascade,
  producto_id      uuid references public.productos (id) on delete set null,
  nombre_producto  text not null,
  cantidad         integer not null constraint detalle_cantidad_rango check (cantidad between 1 and 1000000),
  precio_unitario  numeric(14,2) not null constraint detalle_precio_rango check (precio_unitario between 0 and 100000000),
  subtotal         numeric(14,2) not null,
  constraint detalle_subtotal_correcto check (subtotal = cantidad * precio_unitario)
);
create index if not exists detalle_venta_venta_idx on public.detalle_venta (venta_id);

create table if not exists public.movimientos_inventario (
  id                uuid primary key default gen_random_uuid(),
  fecha             timestamptz not null default now(),
  producto_id       uuid references public.productos (id) on delete set null,
  nombre_producto   text not null,
  tipo              text not null constraint movimientos_tipo_valido check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad          integer not null constraint movimientos_cantidad_no_cero check (cantidad <> 0),  -- + entra, - sale
  stock_resultante  integer not null constraint movimientos_stock_rango check (stock_resultante between 0 and 1000000),
  motivo            text not null default '' constraint movimientos_motivo_longitud check (char_length(motivo) <= 120),
  referencia_id     uuid,
  constraint movimientos_signo_coherente check (
    (tipo = 'entrada' and cantidad > 0) or (tipo = 'salida' and cantidad < 0) or tipo = 'ajuste'
  )
);
create index if not exists movimientos_fecha_idx on public.movimientos_inventario (fecha);
create index if not exists movimientos_producto_idx on public.movimientos_inventario (producto_id);

create table if not exists public.ingresos (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null default current_date constraint ingresos_fecha_minima check (fecha >= date '2000-01-01'),
  concepto    text not null constraint ingresos_concepto_longitud check (char_length(btrim(concepto)) between 3 and 140),
  monto       numeric(14,2) not null constraint ingresos_monto_rango check (monto > 0 and monto <= 1000000000),
  tipo        text not null default 'otro' constraint ingresos_tipo_valido check (tipo in ('venta', 'aporte', 'otro')),
  venta_id    uuid references public.ventas (id) on delete set null,
  usuario_id  uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index if not exists ingresos_fecha_idx on public.ingresos (fecha);
create index if not exists ingresos_venta_idx on public.ingresos (venta_id);

create table if not exists public.egresos (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null default current_date constraint egresos_fecha_minima check (fecha >= date '2000-01-01'),
  concepto       text not null constraint egresos_concepto_longitud check (char_length(btrim(concepto)) between 3 and 140),
  monto          numeric(14,2) not null constraint egresos_monto_rango check (monto > 0 and monto <= 1000000000),
  tipo           text not null default 'otros' constraint egresos_tipo_valido
                 check (tipo in ('compra_mercancia', 'servicios_publicos', 'arriendo', 'nomina', 'transporte', 'otros')),
  referencia_id  uuid,
  usuario_id     uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists egresos_fecha_idx on public.egresos (fecha);

-- ---------------------------------------------------------------------
--  3. Funciones auxiliares (esquema privado)
-- ---------------------------------------------------------------------

-- ¿El usuario de la sesión está autorizado y activo?
create or replace function privado.es_usuario_activo()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo)
$$;

-- ¿La sentencia se ejecuta dentro de una operación del sistema (venta,
-- entrada, conteo, restauración)? Solo las funciones de este archivo
-- activan la marca; la API no permite modificarla.
create or replace function privado.en_operacion()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(current_setting('britnymax.operacion', true), '') = 'si'
$$;

-- Nivel del usuario de la sesión (null si no está autorizado o está inactivo).
create or replace function privado.rol_actual()
returns text
language sql stable security definer
set search_path = ''
as $$
  select u.rol from public.usuarios u where u.id = auth.uid() and u.activo
$$;

-- ¿El usuario de la sesión tiene alguno de estos niveles?
create or replace function privado.tiene_rol(variadic p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(privado.rol_actual() = any (p_roles), false)
$$;

create or replace function privado.nombre_rol(p_rol text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_rol
    when 'administrador' then 'Administrador'
    when 'supervisor' then 'Supervisor'
    when 'cajero' then 'Cajero'
    when 'consulta' then 'Consulta'
    else 'Sin nivel'
  end
$$;

-- Corta la operación si el usuario no está autorizado o si su nivel no alcanza.
-- Cada función pública activa la marca de operación con set_config(..., true)
-- y la apaga antes de terminar.
create or replace function privado.exigir_rol(variadic p_roles text[])
returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_rol text := privado.rol_actual();
begin
  if v_rol is null then
    raise exception 'Tu usuario no está autorizado para usar Britny Max' using errcode = '42501';
  end if;
  if not (v_rol = any (p_roles)) then
    raise exception 'Tu nivel de acceso (%) no permite esta operación', privado.nombre_rol(v_rol) using errcode = '42501';
  end if;
end $$;

create or replace function privado.validar_fecha_operacion(p_fecha timestamptz)
returns timestamptz
language plpgsql stable
set search_path = ''
as $$
declare
  v timestamptz := coalesce(p_fecha, now());
begin
  if v > now() + interval '5 minutes' then raise exception 'La fecha no puede ser posterior a hoy'; end if;
  if v < timestamptz '2000-01-01 00:00:00-05' then raise exception 'La fecha es demasiado antigua'; end if;
  return v;
end $$;

create or replace function privado.dia_bogota(p_momento timestamptz)
returns date
language sql immutable
set search_path = ''
as $$
  select (p_momento at time zone 'America/Bogota')::date
$$;

grant usage on schema privado to authenticated;
revoke all on all functions in schema privado from public, anon;
grant execute on function privado.es_usuario_activo() to authenticated;
grant execute on function privado.en_operacion() to authenticated;
grant execute on function privado.rol_actual() to authenticated;
grant execute on function privado.tiene_rol(text[]) to authenticated;
grant execute on function privado.nombre_rol(text) to authenticated;
grant execute on function privado.exigir_rol(text[]) to authenticated;
grant execute on function privado.validar_fecha_operacion(timestamptz) to authenticated;
grant execute on function privado.dia_bogota(timestamptz) to authenticated;

-- ---------------------------------------------------------------------
--  4. Disparadores de integridad
-- ---------------------------------------------------------------------

-- Las existencias solo cambian con ventas, entradas, conteos o restauraciones.
create or replace function privado.proteger_existencias()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not privado.en_operacion() then
    if tg_op = 'INSERT' and new.cantidad <> 0 then
      raise exception 'Las existencias iniciales se registran con la función crear_producto';
    elsif tg_op = 'UPDATE' and new.cantidad is distinct from old.cantidad then
      raise exception 'Las existencias solo cambian con ventas, entradas de mercancía o conteos físicos';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists productos_proteger_existencias on public.productos;
create trigger productos_proteger_existencias
  before insert or update on public.productos
  for each row execute function privado.proteger_existencias();

-- Normaliza textos (sin espacios sobrantes; código vacío = sin código).
create or replace function privado.normalizar_producto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := btrim(new.nombre);
  new.codigo_barras := nullif(btrim(new.codigo_barras), '');
  return new;
end $$;

drop trigger if exists productos_normalizar on public.productos;
create trigger productos_normalizar
  before insert or update on public.productos
  for each row execute function privado.normalizar_producto();

create or replace function privado.normalizar_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := btrim(new.nombre);
  new.descripcion := btrim(coalesce(new.descripcion, ''));
  return new;
end $$;

drop trigger if exists categorias_normalizar on public.categorias;
create trigger categorias_normalizar
  before insert or update on public.categorias
  for each row execute function privado.normalizar_categoria();

-- No se elimina una categoría con productos activos.
create or replace function privado.validar_eliminar_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.productos p where p.categoria_id = old.id and p.activo) then
    raise exception 'No se puede eliminar: la categoría tiene productos activos';
  end if;
  return old;
end $$;

drop trigger if exists categorias_validar_eliminar on public.categorias;
create trigger categorias_validar_eliminar
  before delete on public.categorias
  for each row execute function privado.validar_eliminar_categoria();

-- Ingresos y egresos: concepto sin espacios sobrantes y fecha no futura.
create or replace function privado.validar_movimiento_economico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.concepto := btrim(new.concepto);
  if new.fecha > privado.dia_bogota(now()) and not privado.en_operacion() then
    raise exception 'La fecha no puede ser posterior a hoy';
  end if;
  return new;
end $$;

drop trigger if exists ingresos_validar on public.ingresos;
create trigger ingresos_validar
  before insert or update on public.ingresos
  for each row execute function privado.validar_movimiento_economico();

drop trigger if exists egresos_validar on public.egresos;
create trigger egresos_validar
  before insert or update on public.egresos
  for each row execute function privado.validar_movimiento_economico();

-- ---------------------------------------------------------------------
--  5. Seguridad (RNF02): Row Level Security con 4 niveles de acceso
--     1 administrador · 2 supervisor · 3 cajero · 4 consulta
--     · Solo usuarios autorizados y activos ven datos.
--     · Ventas, detalles y movimientos solo se escriben desde las
--       funciones de la sección 6, que verifican el nivel.
-- ---------------------------------------------------------------------

alter table public.usuarios               enable row level security;
alter table public.categorias             enable row level security;
alter table public.productos              enable row level security;
alter table public.ventas                 enable row level security;
alter table public.detalle_venta          enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.ingresos               enable row level security;
alter table public.egresos                enable row level security;

-- Elimina las políticas anteriores para poder re-ejecutar este archivo.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('usuarios', 'categorias', 'productos', 'ventas', 'detalle_venta',
                        'movimientos_inventario', 'ingresos', 'egresos')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Cada usuario ve su perfil; el administrador ve todos. Los cambios se hacen
-- solo con las funciones de la sección 7.
create policy usuarios_ver on public.usuarios
  for select to authenticated
  using (id = (select auth.uid()) or (select privado.tiene_rol('administrador')));

-- Inventario: todos los niveles consultan; administrador y supervisor editan.
create policy categorias_ver on public.categorias
  for select to authenticated using ((select privado.es_usuario_activo()));
create policy categorias_crear on public.categorias
  for insert to authenticated with check ((select privado.tiene_rol('administrador', 'supervisor')));
create policy categorias_editar on public.categorias
  for update to authenticated
  using ((select privado.tiene_rol('administrador', 'supervisor')))
  with check ((select privado.tiene_rol('administrador', 'supervisor')));
create policy categorias_eliminar on public.categorias
  for delete to authenticated using ((select privado.tiene_rol('administrador', 'supervisor')));

-- Productos: sin eliminación física (se retiran con activo = false). Las
-- existencias de una venta del cajero se descuentan dentro de registrar_venta.
create policy productos_ver on public.productos
  for select to authenticated using ((select privado.es_usuario_activo()));
create policy productos_crear on public.productos
  for insert to authenticated with check ((select privado.tiene_rol('administrador', 'supervisor')));
create policy productos_editar on public.productos
  for update to authenticated
  using ((select privado.tiene_rol('administrador', 'supervisor'))
         or ((select privado.es_usuario_activo()) and (select privado.en_operacion())))
  with check ((select privado.tiene_rol('administrador', 'supervisor'))
         or ((select privado.es_usuario_activo()) and (select privado.en_operacion())));

-- Ventas, detalles y movimientos: lectura para todos los niveles; escritura
-- solo dentro de las funciones de la sección 6.
create policy ventas_ver on public.ventas
  for select to authenticated using ((select privado.es_usuario_activo()));
create policy ventas_operacion_crear on public.ventas
  for insert to authenticated with check ((select privado.es_usuario_activo()) and (select privado.en_operacion()));
create policy ventas_operacion_editar on public.ventas
  for update to authenticated using ((select privado.es_usuario_activo()) and (select privado.en_operacion()));

create policy detalle_ver on public.detalle_venta
  for select to authenticated using ((select privado.es_usuario_activo()));
create policy detalle_operacion_crear on public.detalle_venta
  for insert to authenticated with check ((select privado.es_usuario_activo()) and (select privado.en_operacion()));

create policy movimientos_ver on public.movimientos_inventario
  for select to authenticated using ((select privado.es_usuario_activo()));
create policy movimientos_operacion_crear on public.movimientos_inventario
  for insert to authenticated with check ((select privado.es_usuario_activo()) and (select privado.en_operacion()));

-- Finanzas: administrador, supervisor y consulta las ven; solo administrador
-- y supervisor las modifican. El ingreso de una venta lo crea registrar_venta
-- (también para el cajero) y solo se retira al anularla.
create policy ingresos_ver on public.ingresos
  for select to authenticated using ((select privado.tiene_rol('administrador', 'supervisor', 'consulta')));
create policy ingresos_crear on public.ingresos
  for insert to authenticated
  with check (
    ((select privado.tiene_rol('administrador', 'supervisor')) and venta_id is null)
    or ((select privado.es_usuario_activo()) and (select privado.en_operacion()))
  );
create policy ingresos_editar on public.ingresos
  for update to authenticated
  using ((select privado.tiene_rol('administrador', 'supervisor')) and (venta_id is null or (select privado.en_operacion())))
  with check ((select privado.tiene_rol('administrador', 'supervisor')) and (venta_id is null or (select privado.en_operacion())));
create policy ingresos_eliminar on public.ingresos
  for delete to authenticated
  using ((select privado.tiene_rol('administrador', 'supervisor')) and (venta_id is null or (select privado.en_operacion())));

create policy egresos_ver on public.egresos
  for select to authenticated using ((select privado.tiene_rol('administrador', 'supervisor', 'consulta')));
create policy egresos_crear on public.egresos
  for insert to authenticated with check ((select privado.tiene_rol('administrador', 'supervisor')));
create policy egresos_editar on public.egresos
  for update to authenticated
  using ((select privado.tiene_rol('administrador', 'supervisor')))
  with check ((select privado.tiene_rol('administrador', 'supervisor')));
create policy egresos_eliminar on public.egresos
  for delete to authenticated using ((select privado.tiene_rol('administrador', 'supervisor')));

-- Privilegios: los visitantes anónimos no acceden a nada.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------
--  6. Operaciones transaccionales (RNF07 – integridad de los datos)
--     Cada función se ejecuta completa o no aplica ningún cambio.
-- ---------------------------------------------------------------------

-- RF02: crea el producto y registra su inventario inicial.
create or replace function public.crear_producto(p_producto jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id       uuid;
  v_cantidad integer;
begin
  perform privado.exigir_rol('administrador', 'supervisor');
  perform set_config('britnymax.operacion', 'si', true);
  if jsonb_typeof(p_producto) is distinct from 'object' then raise exception 'Datos del producto inválidos'; end if;

  v_cantidad := coalesce((p_producto ->> 'cantidad')::integer, 0);
  if v_cantidad < 0 or v_cantidad > 1000000 then raise exception 'La cantidad inicial no es válida'; end if;
  if nullif(p_producto ->> 'categoria_id', '') is null then raise exception 'Selecciona una categoría'; end if;

  insert into public.productos (nombre, codigo_barras, categoria_id, precio_compra, precio_venta, cantidad, stock_minimo)
  values (
    p_producto ->> 'nombre',
    p_producto ->> 'codigo_barras',
    (p_producto ->> 'categoria_id')::uuid,
    coalesce((p_producto ->> 'precio_compra')::numeric, 0),
    (p_producto ->> 'precio_venta')::numeric,
    v_cantidad,
    coalesce((p_producto ->> 'stock_minimo')::integer, 0)
  )
  returning id into v_id;

  if v_cantidad > 0 then
    insert into public.movimientos_inventario (producto_id, nombre_producto, tipo, cantidad, stock_resultante, motivo, referencia_id)
    select v_id, p.nombre, 'entrada', v_cantidad, v_cantidad, 'Inventario inicial', v_id
    from public.productos p where p.id = v_id;
  end if;
  perform set_config('britnymax.operacion', '', true);
  return v_id;
end $$;

-- RF07: registra la venta, descuenta existencias y genera el ingreso.
-- p_items: [{ "producto_id": uuid, "cantidad": int, "precio_unitario": numeric }]
create or replace function public.registrar_venta(p_fecha timestamptz, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_fecha  timestamptz;
  v_venta  uuid;
  v_total  numeric := 0;
  v_cant   integer;
  v_precio numeric;
  it       jsonb;
  p        public.productos%rowtype;
begin
  perform privado.exigir_rol('administrador', 'supervisor', 'cajero');
  perform set_config('britnymax.operacion', 'si', true);
  v_fecha := privado.validar_fecha_operacion(p_fecha);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Una venta admite máximo 200 productos'; end if;

  insert into public.ventas (fecha, total) values (v_fecha, 0) returning id into v_venta;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from public.productos where id = (it ->> 'producto_id')::uuid and activo for update;
    if not found then raise exception 'Uno de los productos ya no existe en el catálogo'; end if;

    v_cant := (it ->> 'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida para %', p.nombre; end if;
    if p.cantidad < v_cant then
      raise exception 'Stock insuficiente para % (disponible: %)', p.nombre, p.cantidad;
    end if;
    v_precio := coalesce((it ->> 'precio_unitario')::numeric, p.precio_venta);
    if v_precio < 0 then raise exception 'Precio inválido para %', p.nombre; end if;

    update public.productos set cantidad = cantidad - v_cant where id = p.id;

    insert into public.detalle_venta (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
    values (v_venta, p.id, p.nombre, v_cant, v_precio, v_cant * v_precio);

    insert into public.movimientos_inventario (fecha, producto_id, nombre_producto, tipo, cantidad, stock_resultante, motivo, referencia_id)
    values (v_fecha, p.id, p.nombre, 'salida', -v_cant, p.cantidad - v_cant, 'Venta', v_venta);

    v_total := v_total + v_cant * v_precio;
  end loop;

  update public.ventas set total = v_total where id = v_venta;

  if v_total > 0 then
    insert into public.ingresos (fecha, concepto, monto, tipo, venta_id)
    values (privado.dia_bogota(v_fecha), 'Venta de productos', v_total, 'venta', v_venta);
  end if;
  perform set_config('britnymax.operacion', '', true);
  return v_venta;
end $$;

-- Anula una venta: devuelve existencias y retira el ingreso asociado.
create or replace function public.anular_venta(p_venta uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v       public.ventas%rowtype;
  d       public.detalle_venta%rowtype;
  v_stock integer;
begin
  perform privado.exigir_rol('administrador', 'supervisor');
  perform set_config('britnymax.operacion', 'si', true);
  select * into v from public.ventas where id = p_venta for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.estado = 'anulada' then raise exception 'La venta ya fue anulada'; end if;

  for d in select * from public.detalle_venta where venta_id = p_venta loop
    if d.producto_id is not null then
      update public.productos set cantidad = cantidad + d.cantidad where id = d.producto_id
      returning cantidad into v_stock;
      insert into public.movimientos_inventario (producto_id, nombre_producto, tipo, cantidad, stock_resultante, motivo, referencia_id)
      values (d.producto_id, d.nombre_producto, 'entrada', d.cantidad, v_stock, 'Anulación de venta', p_venta);
    end if;
  end loop;

  update public.ventas set estado = 'anulada' where id = p_venta;
  delete from public.ingresos where venta_id = p_venta;
  perform set_config('britnymax.operacion', '', true);
end $$;

-- Entrada de mercancía: suma existencias y, si se indica, registra el egreso.
-- p_items: [{ "producto_id": uuid, "cantidad": int, "costo_unitario": numeric }]
create or replace function public.registrar_entrada(
  p_fecha timestamptz,
  p_concepto text,
  p_items jsonb,
  p_registrar_egreso boolean,
  p_actualizar_precio boolean
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_fecha    timestamptz;
  v_ref      uuid := gen_random_uuid();
  v_concepto text := btrim(coalesce(p_concepto, ''));
  v_total    numeric := 0;
  v_cant     integer;
  v_costo    numeric;
  it         jsonb;
  p          public.productos%rowtype;
begin
  perform privado.exigir_rol('administrador', 'supervisor');
  perform set_config('britnymax.operacion', 'si', true);
  v_fecha := privado.validar_fecha_operacion(p_fecha);
  if char_length(v_concepto) > 120 then raise exception 'El concepto admite máximo 120 caracteres'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Una entrada admite máximo 200 productos'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from public.productos where id = (it ->> 'producto_id')::uuid and activo for update;
    if not found then raise exception 'Uno de los productos ya no existe en el catálogo'; end if;

    v_cant := (it ->> 'cantidad')::integer;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida para %', p.nombre; end if;
    v_costo := coalesce((it ->> 'costo_unitario')::numeric, 0);
    if v_costo < 0 or v_costo > 100000000 then raise exception 'Costo inválido para %', p.nombre; end if;

    update public.productos
       set cantidad = cantidad + v_cant,
           precio_compra = case when p_actualizar_precio and v_costo > 0 then v_costo else precio_compra end
     where id = p.id;

    insert into public.movimientos_inventario (fecha, producto_id, nombre_producto, tipo, cantidad, stock_resultante, motivo, referencia_id)
    values (v_fecha, p.id, p.nombre, 'entrada', v_cant, p.cantidad + v_cant,
            case when v_concepto = '' then 'Entrada de mercancía' else v_concepto end, v_ref);

    v_total := v_total + v_cant * v_costo;
  end loop;

  if coalesce(p_registrar_egreso, false) and v_total > 0 then
    insert into public.egresos (fecha, concepto, monto, tipo, referencia_id)
    values (privado.dia_bogota(v_fecha),
            case when char_length(v_concepto) >= 3 then v_concepto else 'Compra de mercancía' end,
            v_total, 'compra_mercancia', v_ref);
  end if;
  perform set_config('britnymax.operacion', '', true);
  return v_ref;
end $$;

-- Conteo físico: fija la cantidad contada y deja el ajuste registrado.
-- p_items: [{ "producto_id": uuid, "cantidad_fisica": int }]
create or replace function public.ajustar_inventario(p_fecha timestamptz, p_motivo text, p_items jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_fecha   timestamptz;
  v_ref     uuid := gen_random_uuid();
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_fisica  integer;
  v_dif     integer;
  v_ajustes integer := 0;
  it        jsonb;
  p         public.productos%rowtype;
begin
  perform privado.exigir_rol('administrador', 'supervisor');
  perform set_config('britnymax.operacion', 'si', true);
  v_fecha := privado.validar_fecha_operacion(p_fecha);
  if char_length(v_motivo) < 3 then v_motivo := 'Conteo físico'; end if;
  if char_length(v_motivo) > 120 then raise exception 'El motivo admite máximo 120 caracteres'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'Datos del conteo inválidos'; end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into p from public.productos where id = (it ->> 'producto_id')::uuid and activo for update;
    if not found then raise exception 'Uno de los productos ya no existe en el catálogo'; end if;

    v_fisica := (it ->> 'cantidad_fisica')::integer;
    if v_fisica is null or v_fisica < 0 or v_fisica > 1000000 then
      raise exception 'Cantidad inválida para %', p.nombre;
    end if;

    v_dif := v_fisica - p.cantidad;
    if v_dif <> 0 then
      update public.productos set cantidad = v_fisica where id = p.id;
      insert into public.movimientos_inventario (fecha, producto_id, nombre_producto, tipo, cantidad, stock_resultante, motivo, referencia_id)
      values (v_fecha, p.id, p.nombre, 'ajuste', v_dif, v_fisica, v_motivo, v_ref);
      v_ajustes := v_ajustes + 1;
    end if;
  end loop;
  perform set_config('britnymax.operacion', '', true);
  return v_ajustes;
end $$;

-- RNF09: restaura un bloque de registros desde un archivo de respaldo.
-- Se llama tabla por tabla, en este orden: categorias, productos, ventas,
-- detalle_venta, movimientos, ingresos, egresos. Es idempotente.
create or replace function public.importar_respaldo(p_tabla text, p_filas jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_filas integer := 0;
begin
  perform privado.exigir_rol('administrador');
  perform set_config('britnymax.operacion', 'si', true);
  if jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Formato de respaldo inválido'; end if;
  if jsonb_array_length(p_filas) > 1000 then raise exception 'Bloque de respaldo demasiado grande'; end if;

  case p_tabla
    when 'categorias' then
      insert into public.categorias (id, nombre, descripcion, creado_en)
      select r.id, r.nombre, coalesce(r.descripcion, ''), coalesce(r.creado_en, now())
      from jsonb_populate_recordset(null::public.categorias, p_filas) r
      on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

    when 'productos' then
      insert into public.productos (id, nombre, codigo_barras, categoria_id, precio_compra, precio_venta, cantidad, stock_minimo, activo, creado_en)
      select r.id, r.nombre, r.codigo_barras, r.categoria_id, coalesce(r.precio_compra, 0), r.precio_venta,
             coalesce(r.cantidad, 0), coalesce(r.stock_minimo, 0), coalesce(r.activo, true), coalesce(r.creado_en, now())
      from jsonb_populate_recordset(null::public.productos, p_filas) r
      on conflict (id) do update set
        nombre = excluded.nombre, codigo_barras = excluded.codigo_barras, categoria_id = excluded.categoria_id,
        precio_compra = excluded.precio_compra, precio_venta = excluded.precio_venta, cantidad = excluded.cantidad,
        stock_minimo = excluded.stock_minimo, activo = excluded.activo;

    when 'ventas' then
      insert into public.ventas (id, fecha, total, estado, creado_en)
      select r.id, r.fecha, coalesce(r.total, 0), coalesce(r.estado, 'registrada'), coalesce(r.creado_en, now())
      from jsonb_populate_recordset(null::public.ventas, p_filas) r
      on conflict (id) do update set total = excluded.total, estado = excluded.estado;

    when 'detalle_venta' then
      insert into public.detalle_venta (id, venta_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
      select r.id, r.venta_id, r.producto_id, r.nombre_producto, r.cantidad, r.precio_unitario, r.subtotal
      from jsonb_populate_recordset(null::public.detalle_venta, p_filas) r
      on conflict (id) do nothing;

    when 'movimientos' then
      insert into public.movimientos_inventario (id, fecha, producto_id, nombre_producto, tipo, cantidad, stock_resultante, motivo, referencia_id)
      select r.id, r.fecha, r.producto_id, r.nombre_producto, r.tipo, r.cantidad, r.stock_resultante, coalesce(r.motivo, ''), r.referencia_id
      from jsonb_populate_recordset(null::public.movimientos_inventario, p_filas) r
      on conflict (id) do nothing;

    when 'ingresos' then
      insert into public.ingresos (id, fecha, concepto, monto, tipo, venta_id, creado_en)
      select r.id, r.fecha, r.concepto, r.monto, coalesce(r.tipo, 'otro'), r.venta_id, coalesce(r.creado_en, now())
      from jsonb_populate_recordset(null::public.ingresos, p_filas) r
      on conflict (id) do update set fecha = excluded.fecha, concepto = excluded.concepto, monto = excluded.monto, tipo = excluded.tipo;

    when 'egresos' then
      insert into public.egresos (id, fecha, concepto, monto, tipo, referencia_id, creado_en)
      select r.id, r.fecha, r.concepto, r.monto, coalesce(r.tipo, 'otros'), r.referencia_id, coalesce(r.creado_en, now())
      from jsonb_populate_recordset(null::public.egresos, p_filas) r
      on conflict (id) do update set fecha = excluded.fecha, concepto = excluded.concepto, monto = excluded.monto, tipo = excluded.tipo;

    else
      raise exception 'Tabla de respaldo desconocida: %', p_tabla;
  end case;

  get diagnostics v_filas = row_count;
  perform set_config('britnymax.operacion', '', true);
  return v_filas;
end $$;

-- Solo usuarios autenticados ejecutan las operaciones (y dentro de ellas se
-- verifica que estén autorizados en public.usuarios).
revoke execute on function public.crear_producto(jsonb) from public, anon;
revoke execute on function public.registrar_venta(timestamptz, jsonb) from public, anon;
revoke execute on function public.anular_venta(uuid) from public, anon;
revoke execute on function public.registrar_entrada(timestamptz, text, jsonb, boolean, boolean) from public, anon;
revoke execute on function public.ajustar_inventario(timestamptz, text, jsonb) from public, anon;
revoke execute on function public.importar_respaldo(text, jsonb) from public, anon;

grant execute on function public.crear_producto(jsonb) to authenticated;
grant execute on function public.registrar_venta(timestamptz, jsonb) to authenticated;
grant execute on function public.anular_venta(uuid) to authenticated;
grant execute on function public.registrar_entrada(timestamptz, text, jsonb, boolean, boolean) to authenticated;
grant execute on function public.ajustar_inventario(timestamptz, text, jsonb) to authenticated;
grant execute on function public.importar_respaldo(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  7. Gestión de usuarios (nivel 1: administrador)
--     La cuenta se crea en Supabase Auth; estas funciones la autorizan,
--     cambian su nivel o la desactivan. Son SECURITY DEFINER porque leen
--     auth.users, y por eso verifican el nivel antes de cualquier cosa.
-- ---------------------------------------------------------------------

create or replace function public.listar_usuarios()
returns table (id uuid, nombre text, correo text, rol text, activo boolean, creado_en timestamptz, ultimo_ingreso timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform privado.exigir_rol('administrador');
  return query
    select u.id, u.nombre, a.email::text, u.rol, u.activo, u.creado_en, a.last_sign_in_at
    from public.usuarios u
    join auth.users a on a.id = u.id
    order by u.activo desc, u.nombre;
end $$;

create or replace function public.autorizar_usuario(p_correo text, p_nombre text, p_rol text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform privado.exigir_rol('administrador');
  if p_rol is null or p_rol not in ('administrador', 'supervisor', 'cajero', 'consulta') then
    raise exception 'Selecciona un nivel de acceso válido';
  end if;
  select a.id into v_id from auth.users a where lower(a.email) = lower(btrim(p_correo));
  if v_id is null then
    raise exception 'No existe una cuenta con el correo %. Créala primero en Supabase → Authentication → Users', btrim(p_correo);
  end if;
  if exists (select 1 from public.usuarios u where u.id = v_id) then
    raise exception 'Esa cuenta ya está registrada en el sistema';
  end if;
  insert into public.usuarios (id, nombre, rol) values (v_id, btrim(p_nombre), p_rol);
  return v_id;
end $$;

create or replace function public.actualizar_usuario(p_id uuid, p_nombre text, p_rol text, p_activo boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actual public.usuarios%rowtype;
  v_activo boolean := coalesce(p_activo, true);
begin
  perform privado.exigir_rol('administrador');
  if p_rol is null or p_rol not in ('administrador', 'supervisor', 'cajero', 'consulta') then
    raise exception 'Selecciona un nivel de acceso válido';
  end if;
  select * into v_actual from public.usuarios u where u.id = p_id for update;
  if not found then raise exception 'Usuario no encontrado'; end if;

  if p_id = auth.uid() and (p_rol <> v_actual.rol or not v_activo) then
    raise exception 'No puedes cambiar tu propio nivel de acceso ni desactivarte';
  end if;
  if v_actual.rol = 'administrador' and v_actual.activo
     and (p_rol <> 'administrador' or not v_activo)
     and (select count(*) from public.usuarios u where u.rol = 'administrador' and u.activo) <= 1 then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;

  update public.usuarios u set nombre = btrim(p_nombre), rol = p_rol, activo = v_activo where u.id = p_id;
end $$;

revoke execute on function public.listar_usuarios() from public, anon;
revoke execute on function public.autorizar_usuario(text, text, text) from public, anon;
revoke execute on function public.actualizar_usuario(uuid, text, text, boolean) from public, anon;
grant execute on function public.listar_usuarios() to authenticated;
grant execute on function public.autorizar_usuario(text, text, text) to authenticated;
grant execute on function public.actualizar_usuario(uuid, text, text, boolean) to authenticated;

-- Función de la versión anterior, reemplazada por privado.exigir_rol.
drop function if exists privado.exigir_autorizacion();

-- =====================================================================
--  Después de ejecutar este archivo por primera vez, autoriza a la
--  propietaria como administradora (ver README):
--
--    insert into public.usuarios (id, nombre, rol)
--    select id, 'Britny Romero', 'administrador'
--    from auth.users where email = 'admin@britnymax.app';
--
--  Luego, desde la app (Usuarios y niveles) ella autoriza a las demás
--  cuentas con su nivel: supervisor, cajero o consulta.
-- =====================================================================
