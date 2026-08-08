# Clic Control · Ari 🎙️

Asistente de voz para **Clic Control**. Le hablás normal y él gestiona tu día:
clientes, agenda, recordatorios, cotizaciones y cobros. El dashboard responde
en vivo a lo que le pedís.

```
«Creá un cliente nuevo: Ferretería El Tornillo, teléfono 3105554433»
«Agendame mañana a las 3 la visita a El Tornillo en la bodega norte»
«El Tornillo me quedó de dar 800 mil el viernes»
«Hacele una cotización a la panadería por el sistema POS, 4 millones 200»
«Recordame el lunes llamar al contador»
«Mostrame los cobros vencidos»
«¿Qué tengo hoy?»
```

---

## Arranque rápido

> ¿Primera vez, o no tenés experiencia poniendo a correr proyectos?
> Seguí la **[guía paso a paso](INSTALACION.md)**, que explica todo desde
> instalar Node hasta usarla en el celular.

```bash
npm install
cp .env.example .env      # y pegá tu ANTHROPIC_API_KEY
npm start
```

Abrí <http://localhost:3000>. Tocá el micrófono (o la barra espaciadora) y hablá.

**Requisitos:** Node 20.6+ (probado en 22) y un navegador con dictado por voz —
Chrome, Edge o Safari. En cualquier otro navegador el micrófono se desactiva
solo y podés escribir en la caja de texto: funciona exactamente igual.

### Desde el celular

La interfaz se reorganiza sola: barra de navegación abajo (al alcance del
pulgar), micrófono flotante, y la conversación como hoja deslizante que se
aparta cuando pedís ver algo, para que el resultado quede a la vista. Las
tablas se convierten en fichas legibles y todos los botones son táctiles.

Para usarla en el teléfono con el servidor en tu computador, ambos tienen que
estar en la misma red:

```bash
PORT=3000 npm start
# en el celular: http://<ip-de-tu-computador>:3000
```

Se puede **instalar como app**: en Chrome Android, «Agregar a la pantalla de
inicio»; en iPhone, Compartir → «Agregar a inicio». Queda con ícono propio y
sin barra del navegador.

> ⚠️ Los navegadores sólo dan acceso al micrófono en `localhost` o en sitios con
> HTTPS. Entrando por IP desde el celular vas a poder usar la app y escribirle a
> Ari, pero el dictado por voz sólo funciona si la servís con certificado (por
> ejemplo detrás de Caddy, Cloudflare Tunnel o ngrok).

---

## Qué hace

| Le decís | Ari hace |
|---|---|
| «creá / agregá un cliente…» | Guarda el cliente con teléfono, empresa, correo y notas |
| «agendame / tengo una reunión / visita el jueves» | Crea la cita con fecha, hora, lugar y cliente |
| «recordame / no se me olvide…» | Crea un pendiente con fecha y prioridad |
| «hacele una cotización a…» | Registra la cotización con valor y estado |
| «agregá 2 interruptores de dos canales» | Suma el renglón a la cotización en curso, sin nombrar al cliente |
| «listo, esa es la cotización» | Cierra la cotización y da el total |
| «a ese ítem súbele 15%» · «ponelo en 300 mil» | Ajusta el precio de un renglón |
| «ponele 20% de servicio» · «agregale el IVA» | Aplica los porcentajes a toda la cotización |
| «me abonó / me dio un adelanto sobre…» | Registra el abono y descuenta del saldo de la cotización |
| «me quedó de dar / me debe…» | Registra el cobro con vencimiento |
| «agregá al catálogo un interruptor de 2 canales a 280 mil» | Guarda el producto en el catálogo de precios |
| «cuánto cuesta / buscá en el catálogo…» | Busca en el catálogo y **pinta el resultado en el dashboard** |
| «mostrame / cuáles / cuánto…» | Consulta y **pinta el resultado en el dashboard** |
| «ya me pagó / ya quedó lista» | Cambia el estado del registro |

Todo lo que se puede hacer por voz también se puede hacer con el mouse: cada
fila tiene botones para marcar como lista/pagada o borrar, y clientes y
cotizaciones se pueden **editar a mano** (teléfono, dirección, correo, monto…)
sin tener que dictarlo.

Si nombrás un cliente que no existe, Ari lo crea sobre la marcha. Si el nombre
es ambiguo («la ferretería» cuando tenés dos), te pregunta cuál.

---

## Consumo de tokens

Pediste que no gastara mucho. La arquitectura está construida alrededor de eso,
y esa es la palanca que más importa —más que el modelo que elijas:

1. **La base de datos nunca entra al contexto.** Cuando consultás algo, la
   consulta corre en SQLite y las filas van *directo a la pantalla*. Al modelo
   sólo le llega un resumen de una línea («12 resultados. Total: $4.300.000»).
   Listar 200 clientes cuesta lo mismo que listar 2.
2. **Caché de prompt.** Las instrucciones y las herramientas son fijas y llevan
   `cache_control`, así que desde la segunda frase esa parte cuesta ~10%.
3. **La parte variable va después del punto de caché** (fecha de hoy + índice de
   clientes), para no invalidarlo.
4. **Historial corto**: los últimos turnos y sólo como texto plano.
5. **`effort: low` y `max_tokens: 1024`** — son órdenes cortas, no ensayos.

En la práctica, una orden típica ronda **1.000–1.500 tokens de entrada** (la
mayoría cacheados) y **50–100 de salida**.

### Cambiar de modelo

Por defecto usa `claude-opus-5`. Si querés bajar el costo por consulta, en `.env`:

```bash
ARI_MODEL=claude-haiku-4-5    # el más económico y rápido: $1 / $5 por millón
```

También sirve `claude-sonnet-5` como punto intermedio. El código detecta el
modelo y ajusta los parámetros que cada uno soporta, así que no hay que tocar
nada más.

---

## Estructura

```
server/
  index.js      Servidor HTTP + API REST (sin framework)
  db.js         Esquema y consultas SQLite
  tools.js      Las 15 herramientas de Ari y su ejecución
  xlsx.js       Lector mínimo de archivos .xlsx (sin dependencias)
  imprimir.js   Página A4 de una cotización, para «Guardar como PDF»
  assistant.js  El bucle de conversación con Claude
public/
  index.html    Interfaz
  styles.css    Estilos (claro y oscuro automáticos)
  app.js        Dashboard, voz y conversación
```

Sin build, sin bundler, sin framework. Una sola dependencia: el SDK de
Anthropic. SQLite viene incluido en Node 22.

### API

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/asistente` | Manda una frase y devuelve respuesta + acciones + vista |
| `GET` | `/api/resumen` | Métricas y listas del dashboard |
| `GET` | `/api/:entidad` | Lista con filtros (`estado`, `rango`, `cliente`, `texto`, `desde`, `hasta`) |
| `POST` | `/api/:entidad` | Crea a mano |
| `PATCH` | `/api/:entidad/:id` | Edita |
| `DELETE` | `/api/:entidad/:id` | Borra |

Entidades: `clientes`, `citas`, `recordatorios`, `cotizaciones`, `cobros`,
`notas`, `abonos`, `productos`, `movimientos_stock`, `cotizacion_items`.

Además, sólo para el catálogo: `POST /api/productos/analizar` (lee un `.xlsx`
subido en base64 y sugiere el mapeo de columnas), `POST /api/productos/importar`
(guarda en bloque las filas ya confirmadas) y `POST /api/productos/:id/foto`
(sube o reemplaza la foto de un producto).

Para las cotizaciones: `GET|POST /api/cotizaciones/:id/items` (renglones y
totales), `PATCH|DELETE /api/cotizacion_items/:id`, `POST
/api/cotizacion-en-curso` (abre o cierra la que se está dictando) y
`GET|PATCH /api/ajustes` (datos de la empresa). Fuera de la API,
`GET /imprimir/cotizacion/:id` devuelve la página imprimible —pide sesión igual
que todo lo demás—.

## Cotizaciones con renglones

Una cotización se arma jalando productos del catálogo, igual que las ofertas en
papel: renglones agrupados por sección, con cantidad y valor unitario, y al pie
subtotal, servicio, IVA y total.

- **Del catálogo**: se busca por referencia o descripción y se agrega con su
  cantidad. El precio sale del catálogo, según el **nivel** con el que se esté
  cotizando (canal / constructor / cliente final); si ese nivel viene vacío en
  la lista del proveedor, se usa el de cliente.
- **Líneas sueltas**: mano de obra, obra civil, cableado… cualquier cosa que no
  esté en el catálogo, con su propia descripción y valor.
- **Ajustes por renglón**: la cantidad y el valor unitario se editan directo en
  la tabla, y el botón `%` sube o baja el precio un porcentaje («súbele 15%»).
- **Porcentajes generales**: servicio e IVA se aplican sobre el subtotal. Los
  dos arrancan en cero y se ponen por cotización.

Los datos del producto (descripción, referencia, marca, precio) **se copian al
renglón** cuando se agrega, no se leen del catálogo cada vez. Así una cotización
ya enviada no cambia sola porque después se actualizó una lista de precios, y
borrar un producto del catálogo no borra el renglón de una oferta pasada: sólo
se pierde el vínculo.

### Dictarla recorriendo el sitio

La forma en que se arma una cotización en la práctica es caminando por la casa
del cliente y diciendo lo que se va necesitando. Para eso:

1. **«Hacele una cotización a Jimmy Forero para la casa»** — queda *en curso*.
2. **«Agregá dos interruptores de dos canales»**, **«ahora tres de tres
   canales»**, **«sumale la mano de obra, un millón ochocientos»**… Cada
   renglón entra a esa cotización **sin volver a nombrar al cliente**.
3. **«Listo, esa es la cotización»** — se cierra y Ari da el total.

Mientras está en curso, un aviso fijo arriba muestra el título, cuántos
renglones lleva y el total corriendo, con botones para verla o finalizarla a
mano.

El interruptor **manos libres** (junto al de voz) cierra el círculo: después de
cada respuesta el micrófono se reabre solo, así se puede seguir dictando sin
tocar el teléfono. Tolera tres silencios seguidos —el tiempo de pasar de una
pieza a otra— y después se apaga solo para no quedar grabando en el bolsillo.

Cuál es la cotización en curso se guarda en la base, no en el navegador: se
puede empezar en el celular recorriendo la obra y terminarla en el computador.

### Imprimir y mandar el PDF

El botón **Imprimir / PDF** de la ficha abre la cotización en una pestaña
aparte, ya maquetada en A4: logo y datos de la empresa arriba, número de
oferta, fecha, ciudad y validez; los datos del cliente y del representante;
los renglones agrupados por sección con su subtotal; subtotal, servicio, IVA y
total; y las condiciones comerciales al pie. Desde ahí, **Imprimir → Guardar
como PDF** y ya se puede mandar.

El PDF no se genera en el servidor a propósito: haría falta una librería
pesada y el hosting compartido suele quedarse sin memoria con ella. El
navegador ya sabe hacerlo, sale un PDF con el texto buscable, y funciona igual
desde el computador y desde el celular. Si la oferta es larga, el encabezado
de la tabla se repite en cada página y ningún renglón queda partido a la
mitad.

Los datos de la empresa y del representante se cargan una sola vez en
**Datos de la empresa** (abajo en la barra lateral). La validez y las
condiciones comerciales salen de ahí, pero cada cotización puede llevar las
suyas si esa oferta va con otra forma de pago o plazo.

El campo `monto` de la cotización se recalcula solo al tocar un renglón o un
porcentaje. Es un valor derivado que se guarda a propósito: es lo que ya usaban
el saldo, los abonos y el dashboard, y es lo único que tienen las cotizaciones
viejas cargadas a mano, que siguen funcionando igual (si no tiene renglones, su
monto no se toca).

## Cotizaciones y abonos

Cada cotización lleva su propio control de pagos parciales. Al consultarla, el
servidor devuelve tres cifras calculadas sobre la marcha:

| Campo | Qué es |
|---|---|
| `monto` | Lo cotizado |
| `abonado` | La suma de sus abonos |
| `saldo` | Lo que falta por recibir |

Los abonos se registran por voz («la panadería me abonó 500 mil sobre la
cotización del POS») o desde la ficha de la cotización, que los lista con fecha,
nota y monto, y muestra una barra de avance. Si el cliente tiene una sola
cotización con saldo, Ari sabe a cuál aplicar el abono sin que se lo digas.

Borrar una cotización borra sus abonos; el saldo nunca queda desincronizado
porque no se guarda: se calcula al leer.

## Ficha del cliente

Al tocar un cliente en la lista se abre su ficha, que reúne todo lo suyo en una
sola pantalla:

- **Cuatro cifras arriba**: cotizado, abonado, saldo cotizado y por cobrar.
- **Historial de abonos**: cada pago con su fecha, su nota, su monto y sobre
  qué cotización se aplicó. Si el cliente abonó tres veces, ahí están los tres,
  en orden.
- **Sus cotizaciones, cobros, citas y notas**, en tablas compactas.
- **Editar datos**: un formulario para corregir a mano teléfono, empresa,
  correo, dirección y notas. Lo que se deja en blanco se borra del registro.

La ficha de la cotización funciona igual: cifras, barra de avance, lista de
abonos, formulario para agregar uno más y botón de editar.

## Catálogo de productos

Es la base para armar cotizaciones a partir de las listas de precios de los
proveedores, sin retipear nada:

1. En **Productos → Importar lista de precios**, subís el `.xlsx` del
   proveedor (puede tener varias hojas, una por categoría).
2. Ari lee el archivo en el navegador y **adivina** qué columna es cuál
   (referencia, descripción, precio canal / constructor / cliente final) —
   las listas de precios traen hasta esos tres niveles.
3. Revisás el mapeo (podés corregir cualquier columna con el desplegable) y
   confirmás hoja por hoja.

### Volver a subir una lista actualizada

Es lo normal: el proveedor manda la lista nueva, con precios distintos,
referencias nuevas y algunas que ya no vende. La importación **compara contra
lo que ya tenés** y te muestra qué va a pasar antes de tocar nada:

| Caso | Qué hace |
|---|---|
| La referencia ya existe | Actualiza precios y descripción |
| La referencia es nueva | La agrega |
| Es idéntica a lo que hay | La deja quieta |
| Estaba y ya no viene en la lista | Te avisa. Nunca la borra |

Los productos se reconocen por su **referencia** (o por la descripción, si no
tienen). Lo que vos cargaste a mano —**la foto, las notas, el inventario, la
marca de "producto propio"**— no se toca: la lista del proveedor sólo manda
sobre los datos que ella misma trae. Si una columna viene vacía en el Excel, se
conserva lo que ya estaba.

Los que dejaron de venir en la lista **no se borran nunca**: pueden estar
citados en cotizaciones anteriores y tener existencias en bodega. Podés marcar
*«Descontinuar los que ya no vengan»* para que dejen de aparecer al cotizar;
siguen ahí, con su historial, y si vuelven a aparecer en una lista futura se
reactivan solos. Para verlos, el botón **«Ver descontinuados»** de la pantalla
de Productos, que aparece sólo cuando hay alguno; se reactivan desde su ficha
con la casilla *«Disponible en el catálogo»*.

Si la lista trae columna de stock y son productos propios, la diferencia con lo
que había queda registrada como un movimiento de inventario («Ajuste por lista
de precios»), no como un número que cambió sin explicación.

También se puede agregar un producto suelto a mano —por voz o desde el botón
**+ Agregar producto**— y ponerle una foto propia desde su ficha.

### Las fotos del Excel

Las listas de precios traen la foto de cada producto pegada sobre su fila. Esas
fotos se importan solas: si la hoja tiene imágenes, aparece la casilla **«Traer
las fotos del Excel»** (marcada por defecto) y cada producto queda con la que
estaba anclada a su fila.

De ahí en más las fotos viajan con el producto: se ven en su ficha, al buscarlo
para cotizar, y **salen impresas en el PDF de la cotización**, en su columna,
como en las ofertas en papel.

Al volver a subir una lista, **una foto que hayas puesto vos no se reemplaza**
por la del proveedor. Si querés cambiarla, es desde la ficha del producto.

En un `.xlsx` las imágenes no viven dentro de las celdas: son objetos flotantes
que guardan a qué fila están pegados. El lector sigue ese rastro (hoja →
dibujo → imagen) para saber de qué producto es cada foto.

### Inventario de los productos propios

No todo lo que hay en el catálogo se puede descontar: lo que viene de la
lista de precios de un proveedor es sólo para cotizar, no hay bodega detrás.
Pero lo que **es de Clic Control** sí tiene existencias reales.

Por eso cada producto tiene un interruptor **"Maneja inventario propio"**
(al crearlo a mano, al importarlo marcando la hoja entera como propia, o
editándolo después). Sólo esos llevan stock:

- La ficha del producto muestra su **stock actual** y su **historial completo**
  de entradas y salidas, cada una con fecha y motivo.
- Se registra una entrada o salida desde la ficha, o por voz («vendí 3 cámaras
  de las nuestras», «entraron 20 sensores», «se dañó uno»).
- Igual que el saldo de una cotización, el stock **no se guarda como número
  aparte**: se calcula sumando todos sus movimientos, así nunca queda
  desincronizado.
- Pedirle a Ari que ajuste el inventario de un producto que no lo maneja
  (uno de catálogo de proveedor) da un aviso en vez de hacerlo — primero hay
  que marcarlo como propio.

El lector del Excel es propio: no se agregó ninguna librería para esto. El
paquete `xlsx` de npm tiene una vulnerabilidad conocida sin parche, así que
se optó por un lector mínimo (`server/xlsx.js`) hecho a medida para lo que
hace falta acá: texto y números de cada celda. Sigue habiendo una sola
dependencia en todo el proyecto.

## Logo

Si colocás tu logo en `public/logo.png` (o `logo.svg`), la barra lateral y la
pantalla de acceso lo usan automáticamente. Si no hay archivo, se dibuja una
versión de respaldo con los colores de la marca.

---

## Acceso con contraseña

Si defines `ARI_CLAVE` (y opcionalmente `ARI_USUARIO`, que por defecto es
`admin`), la aplicación pide credenciales para entrar. Sin esa variable queda
abierta, que es lo cómodo en tu propio computador.

**En un servidor público es obligatoria.** Sin ella, cualquiera que llegue a la
dirección ve tus clientes, sus teléfonos y cuánto te deben.

La sesión es una cookie firmada (HMAC-SHA256), dura 30 días y se invalida sola
al cambiar la contraseña. Tras 8 intentos fallidos la dirección queda frenada
10 minutos.

## Datos

Todo queda en `data/clic-control.db` (SQLite), en tu propia máquina o servidor.
Para respaldar, copiá ese archivo. Para empezar de cero, borralo.

## Notas

- La app corre en HTTP local. Si la publicás en internet, ponele HTTPS: los
  navegadores no dan acceso al micrófono en sitios sin certificado.
- Define `ARI_CLAVE` antes de publicarla. Sin esa variable la aplicación no
  pide credenciales.
- Los montos se asumen en pesos colombianos salvo que digas otra moneda.
