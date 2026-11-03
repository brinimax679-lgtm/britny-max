# Britny Max · Sistema de gestión de inventarios, ingresos y egresos

Sistema de información web para la tienda **Britny Max** (Rionegro, Santander), construido con
**Vue 3 + Tailwind CSS 4** (Vite) y **Supabase (PostgreSQL)**. Implementa los requerimientos del
trabajo de grado "Desarrollo de un Sistema de Información Web para la Gestión de Inventarios,
Ingresos y Egresos en el Establecimiento Comercial Minorista Britny Max".

- **Sistema publicado:** <https://britny-max.vercel.app> (Vercel + Supabase).
- **Documento del trabajo de grado:** [`documentos/Trabajo Final - corregido.pdf`](documentos/) — incluye el
  plan de pruebas, el modelo entidad-relación, el script de la base de datos y la trazabilidad del código.

## Requerimientos implementados

| Requerimiento | Dónde está en la aplicación |
|---|---|
| **RF01** Autenticación de usuario | Pantalla de inicio de sesión (usuario y contraseña). Todas las rutas exigen sesión. |
| **RF02** Registro de productos | Productos → *Registrar producto*: nombre, código de barras, categoría, precio de compra, precio de venta, cantidad inicial y stock mínimo. |
| **RF03** Consulta y búsqueda | Productos: búsqueda por nombre, categoría o código (sin importar tildes) y filtros por categoría y estado. |
| **RF04** Edición y eliminación | Productos → lápiz / papelera. La eliminación retira el producto del catálogo y conserva su historial. |
| **RF05** Lectura de código de barras | Productos → *Leer código de barras*. Funciona con lector USB/Bluetooth (actúa como teclado) y con la **cámara** del celular o computador. También en ventas, entradas y conteo físico. |
| **RF07** Registro de salidas por venta | Ventas: escanear o buscar productos, cantidades, total y cambio. Descuenta existencias y genera el ingreso automáticamente. Historial con detalle y anulación. |
| **RF11** Registro de ingresos y egresos | Ingresos y Egresos: registrar, editar y eliminar por tipo (servicios públicos, arriendo, compra de mercancía…). |
| **RF15** Generación de reportes | Reportes: inventario (disponibles, agotados, stock bajo, valor), ventas y productos más vendidos, entradas y salidas de mercancía, ingresos y egresos por periodo, y discrepancias. Exporta a Excel (CSV) e imprime. |
| **RNF01** Tiempo de respuesta | Vistas cargadas bajo demanda y datos en memoria tras el primer ingreso. |
| **RNF02** Seguridad | 4 niveles de acceso con **permisos que la administradora pone y quita** desde *Usuarios y niveles*, aplicados en la app y en la base de datos; cierre por 5 minutos de inactividad, URL sin tokens ni identificadores, Row Level Security en todas las tablas y encabezados de seguridad. Ver [Seguridad](#seguridad). |
| **RNF03** Facilidad de uso | Interfaz basada en los mockups de Figma, mensajes claros y confirmaciones. |
| **RNF04 / RNF05** Disponibilidad y compatibilidad | Aplicación web adaptable a computador, tablet y celular (Chrome, Edge, Firefox); en el celular las tablas se muestran como tarjetas y las listas se paginan de 10 en 10. |
| **RNF07** Integridad | Validaciones idénticas en la interfaz (`src/lib/validaciones.js`) y en PostgreSQL; ventas, entradas, anulaciones y ajustes son transaccionales; las existencias no se pueden editar a mano. |
| **RNF08** Escalabilidad | PostgreSQL en Supabase con índices por fecha y lectura paginada. |
| **RNF09** Respaldo | *Respaldo y cuenta*: descarga y restauración de copias en JSON. |

Funciones adicionales que apoyan los objetivos del proyecto: **entrada de mercancía** (control de
entradas y egreso automático por compra), **conteo físico** (detección de discrepancias de inventario),
alertas de stock bajo y categorías.

## Cómo ejecutarlo

Requisitos: Node.js 20 o superior y el archivo `.env` con la conexión a Supabase (ver
[Modo producción con Supabase](#modo-producción-con-supabase)).

```bash
npm install
npm run dev        # con Supabase (.env)
npm run dev:demo   # modo demostración, sin base de datos
```

Abre la dirección que muestra la terminal (por defecto `http://localhost:5173`). Sin `.env`, `npm run dev`
muestra un aviso de configuración en lugar de guardar datos en el navegador.

### Iniciar con doble clic en Windows (uso diario en la tienda)

| Archivo | Qué hace |
|---|---|
| `iniciar-britny-max.bat` | Instala dependencias si faltan, prepara la aplicación, la deja funcionando **en segundo plano sin ventana** en `http://localhost:4173` y abre el navegador. Muestra también la dirección para entrar desde el celular (misma red Wi-Fi). Si ya estaba en ejecución, solo abre el navegador. |
| `detener-britny-max.bat` | Detiene el servidor. Solo cierra el proceso de Britny Max, nunca otros programas. |

- La primera vez, Windows puede preguntar si permite que **Node.js** use la red: acepta en redes
  privadas para poder entrar desde el celular.
- Los mensajes del servidor quedan en la carpeta `logs\` (útil si algo falla).
- Cada inicio vuelve a preparar la aplicación, así que los cambios del archivo `.env` se aplican solos.
- Para que inicie al encender el computador: presiona `Win + R`, escribe `shell:startup` y pega allí
  un acceso directo a `iniciar-britny-max.bat`.

### Modo demostración (`npm run dev:demo`)

Solo para pruebas y presentaciones en el computador de desarrollo: la aplicación guarda la información
**en el navegador** (localStorage) y carga un catálogo de ejemplo con tres semanas de movimientos. Este
modo **no existe en la versión publicada**: una compilación de producción sin las variables de Supabase se
detiene con un error.

Trae una cuenta por nivel de acceso para mostrar qué ve cada uno (también aparecen en la pantalla de acceso):

| Usuario | Contraseña inicial | Nivel |
|---|---|---|
| `admin` | `britny2026` | 1 · Administrador |
| `supervisor` | `super2026` | 2 · Supervisor |
| `cajero` | `cajero2026` | 3 · Cajero |
| `consulta` | `consulta2026` | 4 · Consulta |

En *Respaldo y cuenta* puedes volver a cargar los datos de ejemplo o empezar con el sistema vacío.

### Modo producción con Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (región **São Paulo** o la más cercana).
2. En **SQL Editor → New query** pega y ejecuta completo [`supabase/schema.sql`](supabase/schema.sql).
   Se puede volver a ejecutar sin perder datos (actualiza funciones y políticas).
3. En **Authentication → Sign In / Providers** desactiva *Allow new users to sign up*.
4. En **Authentication → Users → Add user** crea la cuenta con correo y contraseña (mínimo 8
   caracteres, con letras y números) y marca *Auto Confirm User*. Si el correo termina en el dominio
   de `VITE_AUTH_DOMAIN` (en este proyecto, `admin@correo.com` con `VITE_AUTH_DOMAIN=correo.com`),
   podrá ingresar escribiendo solo `admin`.
5. **Autoriza** esa cuenta para usar el sistema (sin este paso no puede entrar aunque la contraseña sea correcta).
   En el SQL Editor:
   ```sql
   insert into public.usuarios (id, nombre, rol)
   select id, 'Britny Romero', 'administrador'
   from auth.users where email = 'admin@britnymax.app';
   ```
   Las demás personas (supervisor, cajero, consulta) se crean igual en *Authentication → Users* y la
   administradora las autoriza desde la app, en **Usuarios y niveles**, escribiendo su correo y su nivel.
   Ahí mismo se cambia el nivel o se desactiva una cuenta.
6. Copia `.env.example` como `.env` y completa `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
   `VITE_AUTH_DOMAIN` (Project Settings → API Keys; usa la clave **anon/publishable**, nunca la
   *service_role/secret*).
7. Comprueba la instalación (no guarda datos; pide el usuario y la contraseña del paso 4):
   ```bash
   npm run verificar:supabase
   ```
8. Reinicia `npm run dev`.

Cuando cambie `supabase/schema.sql` (por ejemplo, al agregar los permisos editables), vuelve a ejecutarlo
completo en el SQL Editor: conserva los datos, las cuentas y los permisos ya configurados.

Para pasar los datos del modo demo a Supabase: en modo demo descarga un respaldo (*Respaldo y cuenta*),
conecta Supabase y restáuralo desde la misma pantalla.

## Seguridad

### Los 4 niveles de acceso y sus permisos

Cada usuario tiene un nivel. El **administrador** tiene siempre todos los permisos; los permisos de
**supervisor, cajero y consulta los pone y los quita la administradora** en *Usuarios y niveles*, marcando
las casillas de la matriz y pulsando *Guardar permisos*.

- La matriz se guarda en la tabla `public.permisos_rol` y la consultan las políticas y funciones de
  [`supabase/schema.sql`](supabase/schema.sql) (`privado.tiene_permiso` / `privado.exigir_permiso`), así que
  un nivel no puede saltarse sus límites aunque intente usar la API directamente. Solo la función
  `guardar_permisos` (nivel administrador) la modifica.
- *Administrar usuarios y niveles* es exclusivo del administrador y no se puede asignar.
- Al marcar un permiso se agregan los que necesita (por ejemplo, *Registrar ventas* exige *Consultar
  productos*); al quitar uno, se quitan los que dependen de él (`REQUISITOS` en
  [`src/lib/permisos.js`](src/lib/permisos.js)).
- Las personas conectadas reciben los cambios al cambiar de pantalla (la app vuelve a leer la matriz como
  máximo cada 30 segundos), sin cerrar sesión.
- *Valores iniciales* restaura la matriz de la tabla siguiente:

| Permiso (matriz inicial) | 1 Administrador | 2 Supervisor | 3 Cajero | 4 Consulta |
|---|:-:|:-:|:-:|:-:|
| Consultar productos y leer códigos | ✓ | ✓ | ✓ | ✓ |
| Registrar, editar y eliminar productos y categorías | ✓ | ✓ | | |
| Entradas de mercancía y conteo físico | ✓ | ✓ | | |
| Registrar ventas | ✓ | ✓ | ✓ | |
| Consultar el historial de ventas | ✓ | ✓ | ✓ | ✓ |
| Anular ventas | ✓ | ✓ | | |
| Consultar ingresos, egresos y reportes | ✓ | ✓ | | ✓ |
| Registrar, editar y eliminar ingresos y egresos | ✓ | ✓ | | |
| Descargar respaldos | ✓ | ✓ | | |
| Restaurar respaldos y borrar datos | ✓ | | | |
| Administrar usuarios y niveles | ✓ | | | |

El menú, los botones y las pantallas se adaptan al nivel; si alguien escribe a mano la dirección de una
pantalla que no le corresponde, vuelve al inicio con un aviso. La administradora gestiona las cuentas en
**Usuarios y niveles**: no puede bajarse de nivel ni desactivarse a sí misma.

### Cierre por inactividad

La sesión se cierra sola tras **5 minutos sin actividad** (teclado, mouse, toque o lector de código).
30 segundos antes aparece un aviso con cuenta regresiva y el botón *Seguir conectado*. Se calcula con la
hora real, así que también se cierra si el computador se suspendió.

### Nada queda guardado en el equipo

La versión publicada **no usa `localStorage`**: la sesión, la hora de la última actividad y la fecha del
último respaldo viven en `sessionStorage` y se borran al cerrar el navegador. No se recuerda el usuario
ni la contraseña. Al abrir la app se eliminan las claves `britnymax:*` y `sb-*` que hubieran dejado
versiones anteriores. El código del modo demo (el único que guarda datos en `localStorage`) se carga
aparte y la versión publicada nunca lo descarga.

### Protección de las URL y los tokens

- Ninguna dirección lleva identificadores: editar un producto abre `/productos/editar` y el producto viaja
  en el estado del historial del navegador, no en la URL.
- Si una URL llega con `access_token`, `refresh_token`, `code`, contraseñas u otros datos sensibles (en la
  consulta o en el `#`), se borran de la barra de direcciones y del historial antes de que la app la lea.
- La app nunca acepta sesiones que lleguen por la URL (Supabase con `detectSessionInUrl: false` y PKCE).
- Al cerrar sesión, el token se revoca también en el servidor.
- La redirección después del login solo acepta rutas internas (evita redirecciones a sitios externos).
- Encabezados de seguridad en `vite preview` (el servidor del `.bat`) y en `vercel.json`:
  `Content-Security-Policy`, `Referrer-Policy: no-referrer` (las URL no se envían a otros sitios),
  `X-Frame-Options: DENY`, `X-Content-Type-Options` y `Permissions-Policy`.

### Qué protege la base de datos

- **Acceso:** solo usuarios autenticados **y** registrados como activos en `public.usuarios`, cada uno
  limitado por los permisos de su nivel (Row Level Security en todas las tablas). Los visitantes anónimos
  no ven nada.
- **Existencias:** la columna `cantidad` solo cambia con ventas, entradas, anulaciones, conteos o
  restauraciones; un `update` directo es rechazado. No hay existencias negativas ni ventas sin stock.
- **Historial:** ventas, detalles y movimientos solo se crean desde las funciones SQL; los ingresos de
  una venta solo desaparecen al anularla; los productos se retiran (`activo = false`) sin borrar su historial.
- **Datos:** los mismos límites de la interfaz (longitudes, precios, montos, fechas no futuras,
  formato del código de barras, nombres de categoría únicos) están como restricciones en PostgreSQL.

### Datos de ejemplo en Supabase (para mostrar el sistema)

Para presentar el sistema funcionando, se puede cargar un catálogo de ejemplo con tres semanas de
ventas, compras y gastos. Lo genera el mismo código del modo demo, así que las existencias siempre
cuadran con sus movimientos:

```bash
npm run datos:ejemplo
```

Eso escribe `supabase/datos-ejemplo.sql`; se pega en **SQL Editor → New query → Run**. El archivo
se regenera con fechas relativas al día actual, así que conviene volver a generarlo antes de usarlo.

**Antes de que la tienda empiece a usarlo de verdad**, hay que borrar esos ejemplos:

```bash
npm run datos:ejemplo -- vaciar
```

y ejecutar `supabase/vaciar-datos.sql` en el SQL Editor. Ambos scripts borran solo los datos del
negocio; las cuentas de usuario no se tocan.

## Pruebas

```bash
npm test            # validaciones, permisos, inactividad, URL y modo demo (37 pruebas)
npm run test:db     # esquema SQL, niveles y permisos editables sobre PostgreSQL en memoria (24 pruebas)
```

`test:db` ejecuta `supabase/schema.sql` dos veces, simula los roles de Supabase y comprueba seguridad,
restricciones, ventas, anulaciones, entradas, conteos, restauración de respaldos y que un permiso que la
administradora quita o pone se respeta en la base de datos. `npm test` comprueba, entre otras cosas, que la
matriz inicial de `src/lib/permisos.js` sea idéntica a la que carga `schema.sql`.

## Despliegue en Vercel

Publicado en <https://britny-max.vercel.app>.

1. Sube el proyecto a GitHub e impórtalo en Vercel (framework: **Vite**). No hace falta subir `dist`,
   `logs` ni `node_modules`, y **nunca** el archivo `.env`.
2. Antes de desplegar, agrega las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clave
   *publishable*) y `VITE_AUTH_DOMAIN`. En **Key** va el nombre y en **Value** el valor. Si falta alguna, la
   compilación se detiene con «Britny Max no se puede compilar: Faltan …» en lugar de publicar una app
   sin base de datos. Las variables solo se aplican en un despliegue nuevo (*Redeploy*).
3. `vercel.json` ya redirige todas las rutas a `index.html` (recargar cualquier página funciona) y agrega
   los encabezados de seguridad.
4. Cada cambio que se sube a GitHub se publica solo. Si el cambio toca la base de datos, ejecuta también
   `supabase/schema.sql` en Supabase.

La lectura con cámara requiere HTTPS (Vercel lo incluye) o `localhost`.

## Estructura

```
src/
  components/   Layout, buscador de productos, cámara, gráficos, modales…
  views/        Una vista por pantalla (login, inicio, productos, ventas, reportes…)
  stores/       Estado con Pinia (sesión, datos de la tienda, notificaciones)
  services/     Acceso a datos: localBackend (modo demo) y supabaseBackend
  lib/          Validaciones, niveles y permisos editables, inactividad, URL seguras, formatos y exportación
  composables/  useValidacion (errores junto a cada campo), useInactividad (cierre a los 5 min)
supabase/
  schema.sql    Tablas (incluida permisos_rol), restricciones, seguridad (RLS) y funciones transaccionales
  tests/        Pruebas del esquema con PGlite
tests/          Pruebas de validaciones, operaciones, permisos y configuración
scripts/
  verificar-supabase.mjs   Revisión del proyecto Supabase ya configurado
documentos/     Trabajo de grado (Word y PDF) y figuras: capturas, arquitectura y modelo entidad-relación
```
