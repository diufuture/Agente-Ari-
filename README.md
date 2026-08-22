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

Por defecto usa `claude-sonnet-5`: el punto óptimo para esta tarea (entender
la orden y encadenar herramientas), a una fracción del costo de Opus. Si
querés bajar el costo todavía más, en `.env`:

```bash
ARI_MODEL=claude-haiku-4-5    # el más económico y rápido: $1 / $5 por millón
```

`claude-opus-5` sigue disponible si en algún caso hace falta más
razonamiento. El código detecta el modelo y ajusta los parámetros que cada
uno soporta, así que no hay que tocar nada más.

---

## Estructura

```
server/
  index.js      Servidor HTTP + API REST (sin framework)
  db.js         Esquema y consultas SQLite
  tools.js      Las 15 herramientas de Ari y su ejecución
  xlsx.js       Lector mínimo de archivos .xlsx (sin dependencias)
  remoto.js     Listas de precios que viven en línea (CSV/xlsx por dirección)
  imprimir.js   Página A4 de una cotización, para «Guardar como PDF»
  assistant.js  El bucle de conversación con Claude
public/
  index.html    Interfaz
  styles.css    Estilos (claro y oscuro automáticos)
  app.js        Dashboard, voz y conversación
  foto.js       Achica las fotos antes de guardarlas
prueba.js       Recorrido completo del sistema (npm test)
```

Sin build, sin bundler, sin framework. Una sola dependencia: el SDK de
Anthropic. SQLite viene incluido en Node 22.

### Probar que todo sigue funcionando

```bash
npm test
```

`prueba.js` recorre el sistema entero como lo usaría el negocio en una semana:
arma el catálogo, dicta una cotización renglón por renglón, le cobra un abono,
mueve inventario, importa una lista de precios actualizada y genera la página
imprimible. Cada paso se compara contra el número que debería dar —los totales,
el IVA, el saldo, el stock—, no sólo contra que no se caiga.

Corre sobre una base de datos temporal que se borra sola: no toca la del
negocio. Conviene pasarlo antes de subir una versión nueva al servidor.

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

**Dos dictados seguidos.** En el celular, con la conversación abierta hay un
micrófono adentro de la hoja, al lado de donde se escribe. El flotante queda
detrás de la hoja, y antes el de adentro estaba escondido: no quedaba ninguno,
así que después de dictar una orden había que esperar a que la hoja se cerrara
sola para poder hablar otra vez.

Además el micrófono se suelta apenas termina el dictado, y no al abrir el
siguiente. Parece lo mismo y no lo es: soltándolo recién al abrir el siguiente,
la sesión vieja se aborta y la nueva arranca en el mismo instante, el teléfono
todavía no alcanzó a soltar el audio, y la nueva nace sorda —dice «Escuchando» y
no le llega nada— hasta que el sistema se desocupa unos segundos después.
Soltándolo al terminar, queda libre mientras Ari contesta y habla, que es justo
el rato en que uno está esperando para volver a hablarle.

**La voz de Ari contra el micrófono.** En el iPhone las dos cosas se pelean el
audio del aparato, y la que pierde siempre es el micrófono: si Ari acaba de
contestar en voz alta, el dictado siguiente *abre* —dice «Escuchando», el botón
se pone en rojo— pero no transcribe, no falla y no termina nunca. De ahí venía
que tomara una sola orden y después hubiera que cerrar y volver a abrir la
aplicación.

Lo primero es no meterse en el problema: **en el iPhone la casilla de voz
arranca apagada**. Se probó de todo para que convivieran y no hay manera —hay
teléfonos que no sueltan el audio ni cortándole la voz, hasta recargar la
página—, y acá lo que se usa todo el día es dictar, no escuchar. En el
computador no pasa nada de esto y la voz sigue viniendo prendida. La elección
se recuerda: el que quiera la voz en el iPhone la prende y queda prendida.

Si está prendida igual, hay tres escalones más, del más suave al más bruto:

1. **No abrir el micrófono mientras el parlante siga tomado.** Si Ari venía
   hablando, se le corta la voz, se le da al teléfono un respiro de milésimas y
   recién ahí se abre el dictado. En el resto de los casos `start()` sigue
   saliendo dentro del mismo toque, que es como el iPhone entrega el micrófono.
2. **Reconocer la sesión muda.** Que el audio abra (`onaudiostart`) no prueba
   que la sesión sirva —justamente en ésta abre—, así que no alcanza con eso
   para darla por buena: sólo la cuentan la voz detectada o el texto. Si a los
   nueve segundos no llegó ni voz, ni error, ni cierre, la sesión está muerta y
   se corta. Un dictado sano que nadie contesta se cierra solo mucho antes. Una
   vez que este teléfono ya mostró que lo hace, el plazo baja a tres segundos y
   medio: no hay por qué hacerlo esperar de nuevo.
3. **Apagarle la voz a Ari.** Si el micrófono se murió justo después de que Ari
   hablara, la culpable es la voz: se apaga sola —y queda apagada la próxima
   vez que abra—, se dice por qué, y se puede seguir dictando.

Si ni así oye, el navegador quedó con el audio trabado y desde adentro de la
página no hay nada que hacer: aparece un botón para **recargar**. Recargar es
lo mismo que cerrar y volver a abrir la aplicación, salvo que **la
conversación vuelve donde estaba** —se guarda de este lado y se repone del
otro—, así que deja de doler. Los datos nunca corrieron riesgo: viven en el
servidor, incluida la cotización en curso.

**Teléfonos de un solo dictado por carga.** Hay iPhones donde el dictado anda
una vez y no vuelve más, hagas lo que hagas: es el aparato, no la aplicación.
Cuando se detecta uno —la primera vez que el micrófono abre y no oye— queda
anotado en ese teléfono, y de ahí en adelante **la página se renueva sola
apenas Ari termina de contestar**, mientras uno lee la respuesta. Así el
micrófono siempre está nuevo para la orden siguiente y se puede dictar una
atrás de otra sin cerrar nada. La conversación se conserva en cada renovación,
la hoja del chat queda abierta, y si en ese momento uno se puso a escribir o a
dictar, no se renueva nada: primero está lo que se esté haciendo.

Ese reinicio se programa **apenas llega la respuesta**, antes de repintar la
pantalla y antes de leerla en voz alta. Si colgara de que todo eso saliera
bien, un tropiezo dibujando dejaría el micrófono mudo otra vez, que es justo
lo que esto viene a evitar.

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
**Datos de la empresa** (abajo en la barra lateral). La validez, las
condiciones comerciales y el representante salen de ahí, pero cada cotización
puede llevar los suyos si esa oferta va con otra forma de pago, otro plazo o
la atendió otra persona: lo que tenga la cotización manda sobre lo general.

### Subir una cotización ya hecha

No todas las ofertas se arman acá. Muchas salen de otro lado y llegan listas en
PDF, y retipearlas sólo para poder seguirlas no tiene sentido. En
**Cotizaciones → Subir una cotización en PDF** se carga el archivo con el
asunto, el cliente y el valor, y queda registrada como cualquier otra: con su
estado, sus abonos, su saldo y su lugar en el dashboard. Los renglones no hacen
falta.

El cliente se crea solo si no existía. En la ficha, el botón **Ver el PDF** abre
el archivo que subiste —que es el que vio el cliente— y queda igual la opción de
armar una acá, por si después la querés rehacer con renglones.

A una cotización armada acá también se le puede adjuntar un PDF, desde su ficha:
sirve para guardar la versión firmada junto a la que generó el sistema.

Se comprueba que el archivo sea realmente un PDF mirando su contenido, no la
extensión ni lo que diga el navegador, y se sirve con su tipo declarado y
`nosniff`: algo que se descarga desde el mismo dominio de la aplicación no puede
ser cualquier cosa con el nombre cambiado. El tope es 12MB.

### Seguir trabajando por voz sobre una que ya existe

«Agregale dos cámaras a la cotización de Jimmy» agrega a **la que Jimmy ya
tiene abierta**; no abre una nueva. Sólo se crea una cotización nueva cuando se
pide con todas las letras («hacele una cotización nueva a Jimmy»). Ante la duda
se agrega a la existente: deshacer un renglón es fácil, una cotización
duplicada le ensucia el historial al cliente.

Para cambiar algo no hace falta saber ningún número: «cambiale la cantidad de
los interruptores de tres canales a siete», «subile 10% a la mano de obra»,
«quitale las cámaras». El renglón se busca por cómo lo nombraste, y si hay más
de uno que encaja te dice cuáles son en vez de elegir por adivinanza.

Agregar dos veces el mismo producto **suma la cantidad** en vez de repetir el
renglón. Salvo que vaya a otra sección o a otra área —las mismas cámaras para
la cocina son otro renglón— o que le hayas tocado el precio a mano, porque ahí
sí son cosas distintas.

### Retocar la oferta durante la negociación

Una cotización terminada se sigue editando: se abre desde **Cotizaciones →
Abrir y editar** y ahí se le cambian cantidades y precios en la misma tabla, se
quitan renglones, se agregan del catálogo o sueltos, y se ajustan los
porcentajes. Es lo que pasa cuando el cliente pide sacar una cosa y agregar
otra, y lo que quede al aprobarla es lo que se descuenta de la bodega.

Cada renglón se abre con **✎** para cambiarle:

- **La descripción.** El catálogo trae el nombre genérico ("Interruptor 2
  canales") y en la oferta muchas veces hay que llamarlo como lo conoce el
  cliente. La primera línea es el nombre; lo que va debajo sale impreso como
  ficha técnica, más chico y en gris.
- **La sección**, que es cómo se agrupan los renglones y dónde caen los
  subtotales.
- **El área** (Sala, Cocina, Habitación…), opcional. La columna sólo aparece
  impresa si al menos un renglón la tiene, así que las ofertas que no la usan
  salen igual que siempre.

Todo eso vive en la cotización, no en el catálogo: renombrar un renglón acá no
le cambia el nombre al producto ni toca las otras ofertas.

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

### Cotizado y por cobrar no son lo mismo

Aprobar una cotización la mueve de una columna a la otra:

| | Qué cuenta |
|---|---|
| **Saldo cotizado** | Lo que sigue en negociación: cotizaciones pendientes y enviadas |
| **Por cobrar** | Lo que el cliente ya se comprometió a pagar: los cobros sueltos **más el saldo de las cotizaciones aprobadas** |

Una cotización aprobada es una venta cerrada, así que lo que le falte es
cobranza. En **Cobros** aparecen las dos cosas juntas, y las que vienen de una
cotización se marcan como tales y llevan un botón para abrir la ficha y
registrar el abono.

No se crea un cobro de verdad al aprobar, a propósito: sería una copia del
saldo que quedaría vieja apenas se registre un abono. Se calcula en el momento,
así que un abono sobre la cotización baja el «por cobrar» enseguida, y cuando
queda saldada desaparece sola de la lista.

Esta misma cuenta —cobros sueltos más el saldo de las cotizaciones
aprobadas— aparece también en la **lista de clientes**, al lado de total
cotizado, total abonado y saldo total, y en cada renglón de esa lista. Antes se
calculaba distinto en cada pantalla y sólo miraba los cobros sueltos: una
cotización aprobada sin un cobro registrado aparte no contaba como "por
cobrar" en ningún lado salvo en Cobros. Ahora es un solo cálculo, en el
servidor, y las pantallas lo usan igual.

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

En la **lista de clientes**, cada renglón trae además cuántas cotizaciones
tiene ese cliente —el mismo número que dice "Cotizaciones (N)" adentro de la
ficha—, para no tener que entrar a averiguarlo.

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

### Sin subir nada: la lista que vive en línea

Si la lista de precios ya la llevás en una hoja en línea, no hace falta
exportarla ni subirla: se conecta una vez y de ahí en más se trae sola desde
**Productos → Listas en línea**.

1. Pegás la dirección de la hoja y le das **Probar**. Se baja, se muestran las
   primeras filas y qué columna reconoció como cada cosa.
2. Le ponés nombre y categoría, y **Conectar**.
3. Cada vez que quieras, **Ver qué cambiaría** (no toca nada) o **Traer ahora**.

Sirven Google Sheets, OneDrive y Dropbox. La dirección que copiás del navegador
es la de *mirar* la hoja, no la de bajarla; se traduce sola, así que pegás la
que tenés a mano. La hoja tiene que estar compartida por enlace o publicada —lo
cual también quiere decir que cualquiera con la dirección puede leerla, así que
que sea una lista de precios y no algo reservado.

Lee CSV y `.xlsx`, con punto y coma o coma de separador, y entiende los miles
como se escriben acá: `98.500` son noventa y ocho mil quinientos, no noventa y
ocho con cinco (lo que los separa es que el separador de miles agrupa siempre
de a tres dígitos).

Vale lo mismo que al subir el archivo a mano: **lo que cargaste vos —la foto,
las notas, el inventario— no se pisa**, y lo que dejó de venir no se borra
salvo que marques la casilla de descontinuar. Si la hoja llega vacía —porque el
enlace dejó de ser público, por ejemplo— no se aplica nada: vaciar el catálogo
por un archivo que no llegó bien sería el peor final posible.

Lo único que el CSV no trae son las fotos, porque un CSV es sólo texto. Las que
ya tengan los productos se conservan, y las nuevas se suben desde la ficha.

### Armar la cotización tocando el catálogo

Dictar es lo más rápido para uno o dos renglones sueltos. Para veinte no: ahí
conviene ir mirando la lista, y es además donde uno se acuerda de lo que
falta. Por eso, **mientras hay una cotización abierta**, el catálogo se
convierte en la forma de cargarla:

1. Se abre **Productos** —el aviso de arriba recuerda qué se está armando—.
2. Se filtra por tipo o se busca, como siempre.
3. En el producto que sea, **➕ Cotizar** abre un renglón debajo con la
   cantidad y el precio que le va a quedar.
4. **Agregar**, y la lista se queda donde estaba, lista para el siguiente.

El precio que se muestra y el que entra es **el del nivel de esa cotización**
—canal, constructor o cliente final—, no siempre el de cliente. Si el producto
no tiene precio para ese nivel lo avisa antes de agregarlo, en vez de meter un
renglón en $ 0 sin decir nada.

Agregar dos veces el mismo producto **suma la cantidad** en vez de repetir el
renglón, igual que dictando. Y con la cotización cerrada no aparece nada de
esto: el ➕ y el aviso sólo están mientras haya algo que armar.

### Nombrar un producto como uno lo nombra

Nadie dicta una referencia como está escrita en la lista de precios. Uno dice
«un interruptor **zeta uno**» y en el catálogo figura `CLICK Z1`; dice «una
**pantalla de cuatro pulgadas**» y figura `CLICK DP4`, con la medida metida en
la descripción. Antes se buscaba la frase entera como un solo pedazo de texto,
así que no encontraba nada y había que saberse la referencia de memoria **y
pronunciarla clavada**.

Ahora la frase se parte en palabras y se busca cada una por su cuenta, tanto en
la referencia como en la descripción, la categoría, la marca y el tipo. Con
tres arreglos que son los que hacen la diferencia dictando:

1. **Los números dichos se pasan a cifra**: «zeta uno» → `z 1`.
2. **Se compara también todo pegado y sin signos**: `z 1` → `z1`, que sí está
   adentro de `CLICKZ1`. Es lo que hace que valga decir la referencia entera, a
   pedazos, o sólo la parte que uno recuerda.
3. **Se perdona una letra** en palabras largas, porque el dictado escribe
   «clic» donde dice CLICK.

Lo que coincide en la **referencia** pesa mucho más que lo que coincide en la
descripción: quien dice «z1» está nombrando el producto, no describiéndolo.

Todo esto sirve igual escribiendo en el buscador del catálogo: si la frase
entera no da nada, se prueba con el mismo buscador. No tenía sentido que la
pantalla fuera más torpe que Ari.

> **Cuando hay empate, pregunta.** Si dos productos encajan igual de bien
> —«un interruptor de tres canales» cuando hay un `CLICK Z3` y un `G7-3`— no
> elige ninguno: devuelve los candidatos para que Ari pregunte cuál. Meter el
> renglón equivocado en una cotización cuesta mucho más que una repregunta.
>
> Un detalle del español, por si algún día extraña: **«un» y «una» no se leen
> como el número 1**. Son artículos muchísimo más seguido, y traducirlos hacía
> que «una pantalla» buscara un 1 y trajera la DP**10** antes que la DP4. Lo
> mismo con «ese», que es el demostrativo antes que la letra S. «uno» y «zeta»
> sí se traducen: eso se dice nombrando.

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

La vista previa muestra la foto junto a cada fila de ejemplo, para confirmar
que cada una cae sobre el producto que le toca antes de importar nada. Sólo
esas: mandar las demás al navegador sería mandar el Excel entero de vuelta.

Excel ancla las imágenes de tres maneras, y las listas usan las tres: pegadas a
una celda, estiradas de una celda a otra, o puestas sueltas en la hoja. Las dos
primeras se siguen hasta su producto aunque la foto arranque una fila más
arriba o dos fotos empiecen en la misma. Las sueltas no tienen forma de saber a
qué producto pertenecen, así que no se adivinan: se avisa cuántas son.

Una foto que falta no desaparece en silencio. Se ve en tres lugares:

- En la **vista previa**, cuántas imágenes no están ancladas a ninguna fila.
- Al **importar**, qué productos quedaron sin foto, con referencia y nombre.
- En la **tabla de renglones**, los que van a salir sin foto en el PDF quedan
  marcados antes de mandar la oferta.

### Cuando la lista viene sin fotos

Muchas listas traen sólo referencia y precio. Desde la ficha del producto:

- **Buscar en la web** abre una búsqueda de imágenes con la referencia y la
  marca de ese producto.
- La foto que sirva se **copia y se pega en la ficha** (Cmd+V / Ctrl+V), o se
  pega **su dirección** en el campo de abajo y el servidor la descarga.

La foto no se elige sola a propósito. Ari podría inventarse una dirección que
parezca correcta, y terminaría una imagen equivocada —o rota— impresa en una
oferta ya enviada al cliente. La buscás vos, la ves, y recién ahí entra.

La descarga por dirección la hace el servidor, no el navegador, porque muchos
sitios no permiten que otra página lea sus imágenes. Se acepta sólo http/https,
se rechazan las direcciones de la red interna, y se comprueba que lo que llegó
sea realmente una imagen y no la página que la contiene.

De ahí en más las fotos viajan con el producto: se ven en su ficha, al buscarlo
para cotizar, y **salen impresas en el PDF de la cotización**, en su columna,
como en las ofertas en papel.

Al volver a subir una lista, **una foto que hayas puesto vos no se reemplaza**
por la del proveedor. Si querés cambiarla, es desde la ficha del producto.

En un `.xlsx` las imágenes no viven dentro de las celdas: son objetos flotantes
que guardan a qué fila están pegados. El lector sigue ese rastro (hoja →
dibujo → imagen) para saber de qué producto es cada foto.

### Todas del mismo tamaño

Las fotos no llegan parejas: la del celular trae 4000 píxeles y 3 MB, la del
Excel del proveedor puede traer 230 KB, y la de la web viene como esté. En una
cotización todas se ven del tamaño de una uña, así que **se achican a 320
píxeles de lado antes de guardarse** —una foto de 1,2 MB queda en unos 18 KB—
y se convierten a WEBP, que pesa menos y conserva los fondos transparentes.

Eso pasa solo, en los cuatro caminos por los que puede entrar una foto:

| Cómo entra | Cuándo se achica |
| --- | --- |
| Archivo elegido en la ficha | En el navegador, antes de subirla |
| Imagen pegada (Ctrl+V) | En el navegador, antes de subirla |
| Dirección web | La baja el servidor y se achica enseguida |
| Foto del Excel | Al terminar de importar la lista |

Para las que ya estaban guardadas de antes, en **Productos** aparece un botón
—**«Achicar N fotos pesadas»**— que dice cuánto ocupan y las deja todas en
medida. Sólo se muestra si hay alguna arriba de 60 KB; cuando no queda ninguna,
desaparece.

El redimensionado lo hace el navegador con su propio `<canvas>`
(`public/foto.js`): no hace falta ninguna biblioteca de imágenes en el servidor,
y la foto grande ni siquiera llega a viajar por la red. Al reemplazar una foto
se borra el archivo anterior, así que un `.jpg` de 700 KB no queda ocupando
lugar después de convertirse en un `.webp` de 17 KB.

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
- Para poner cuánto hay, alcanza con escribirlo en **Cantidad disponible** al
  editar el producto: se guarda la diferencia como movimiento, así queda
  anotado por qué cambió.

### Los tres estados de una cotización

Tocando la pastilla del estado, en la lista, se va rotando entre tres:

| Estado | Qué quiere decir | Cuenta para el cliente |
|---|---|---|
| **pendiente** | Se presentó y se está esperando respuesta | Sí |
| **aprobada** | El cliente dijo que sí: es una venta | Sí, y pasa a cobranza |
| **no aprobada** | Se cotizó y no pasó nada, o el cliente no la tomó | **No** |

Antes eran dos, y faltaba justamente el caso más común de todos: la oferta que
se manda y queda ahí. Dejarla «pendiente» para siempre inflaba el cotizado del
cliente con plata que nunca iba a entrar; marcarla aprobada era mentir.

Una **no aprobada** no suma al total cotizado ni al saldo del cliente, pero
**no se borra ni se esconde**: sigue en la lista y sigue contando entre las
ofertas que se le presentaron a ese cliente, que es lo que uno quiere mirar
cuando vuelve a negociar con él.

> En la base este estado se llama `rechazada` desde la primera versión, y así
> se queda para no tener que tocar lo ya guardado. En pantalla dice **no
> aprobada**, que es lo que de verdad pasó casi siempre: no es que el cliente
> haya dicho que no, es que no dijo nada.

Ojo con no confundirlo con **Cerrar**, que es otra cosa: cerrar archiva la
cotización en el historial —sale de la lista del día a día— y puede hacerse
con cualquiera de los tres estados.

### Aprobar una cotización descuenta de la bodega

Cotizar no mueve nada —es una oferta—, pero **marcar la cotización como
aprobada** saca sus productos propios del inventario, con el motivo
«Cotización #N aprobada». Los que son de catálogo de un proveedor no se tocan:
no hay bodega detrás.

Si después cambian las cantidades de esa cotización, el descuento se rehace
solo; y si deja de estar aprobada, el stock vuelve. Volver a aprobarla no
descuenta dos veces.

Esos movimientos se rehacen enteros en vez de compensarse con entradas, porque
no son hechos que hayan pasado en la bodega: son consecuencia del estado de la
cotización, y anotar +7 y −7 cada vez que se corrige un estado sólo llenaría el
historial de ruido.

El lector del Excel es propio: no se agregó ninguna librería para esto. El
paquete `xlsx` de npm tiene una vulnerabilidad conocida sin parche, así que
se optó por un lector mínimo (`server/xlsx.js`) hecho a medida para lo que
hace falta acá: texto y números de cada celda. Sigue habiendo una sola
dependencia en todo el proyecto.

### Fichas técnicas

Cada producto puede llevar la ficha técnica del fabricante en PDF, adjunta
desde su ficha (**Subir la ficha**). Aparece un botón de descarga junto al
producto, en cualquier lugar donde se lo mencione.

Para cargar muchas de una: **Productos → Importar fichas técnicas**. Se elige
más de un PDF a la vez y cada uno se empareja con su producto por el
**nombre del archivo, sin la extensión**, que tiene que ser igual a la
referencia del catálogo (`CLICK DM2.pdf` para el producto con referencia
`CLICK DM2`; espacios, mayúsculas y guiones no importan). Al final dice
cuántas quedaron pegadas y, si alguna no encontró con qué producto
emparejar, cuáles fueron —para corregir el nombre y volver a intentar sólo
ésas—.

El contenido de una ficha no lo escribe el sistema por su cuenta. Vive en
`server/fichas-contenido.js`, un objeto por referencia con lo que confirmó
el fabricante o la propia descripción del producto en la lista de precios
—la fuente más confiable, porque es lo que la empresa ya dice de lo suyo—.
Cuando hace falta completar algo que ninguna de las dos dice, se usa el
parámetro típico de ese tipo de dispositivo (protocolo ZigBee a 2.4 GHz, por
ejemplo), nunca un número inventado para ese modelo puntual como un amperaje
o una certificación que nadie confirmó: eso es justo lo que un instalador
necesita que sea cierto. Cada ficha lleva un campo `confianza`
(`'confirmado'` o `'estandar'`); las de `'estandar'` avisan al pie del PDF
que conviene verificar el dato con el fabricante antes de una instalación
donde eso importe.

Para agregar o corregir un producto, se edita ese archivo y se corre:

```bash
node scripts/generar-fichas.mjs
```

Arma el PDF de todas las fichas del catálogo, con el nombre de archivo igual
a la referencia —listos para subirlos por **Importar fichas técnicas**—, en
`dist-fichas/`. El generador (`server/ficha-tecnica-pdf.js`) es del mismo
motor sin dependencias que arma las cotizaciones (`server/pdf.js`).

## Logo

El de las **cotizaciones impresas** se sube desde ⚙ **Datos de la empresa →
Logo de la empresa**. Se achica a 600 píxeles y queda guardado; sirve un PNG
con fondo transparente.

Para la **barra lateral y la pantalla de acceso**, el archivo va en
`public/logo.png` (o `logo.svg`). Si no hay ninguno, se dibuja una versión de
respaldo con los colores de la marca.

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

## Ajustes y tema claro / oscuro

El **piñón ⚙** de arriba a la derecha abre los ajustes. En el celular es el
único camino: la barra de abajo no tiene lugar para ellos, así que antes no se
podía ni poner el representante de ventas ni cambiar el logo desde el teléfono.

Ahí adentro, en **Apariencia**, se elige cómo se ve la aplicación:

- **Automático** — sigue al celular o al computador, y cambia solo si el
  aparato cambia (por ejemplo al anochecer, si lo tiene programado).
- **Claro** / **Oscuro** — siempre así, sin importar lo que diga el aparato.

La elección se guarda **en ese dispositivo**, no en la base: es normal quererla
oscura en el celular y clara en el computador. Se aplica antes de que se dibuje
la pantalla, así que al abrir no se ve el destello del tema anterior.

Debajo están los datos de la empresa que encabezan y cierran las cotizaciones,
**el representante de ventas** incluido. Cada cotización puede además llevar su
propio representante si esa oferta la firma otra persona.

## Cambiar de lista de precios, y borrar una cotización

En **Editar**, dentro de la cotización, está **Precios que se usan**: cliente
final (el de siempre), constructor o canal. La tarjeta de totales deja dicho
cuál está en uso, pero el selector vive en Editar y en un solo lugar: tenerlo
en dos hacía dudar cuál manda.

Cambiarlo **vuelve a ponerle precio a los renglones que ya estaban**, no sólo
a los que se agreguen después: la misma oferta pasa de un cliente final a un
constructor sin rehacerla.

Dos cosas que no toca:

- **Los renglones cuyo precio se escribió a mano.** Si a uno se le escribió el
  precio —tecleado, dictado, o dictado distinto al agregarlo—, ya no vale el
  de la lista, y volver a ponérselo sería borrar una decisión sin avisar. Se
  avisa cuántos quedaron afuera, para que no parezca un olvido.

  Eso se sabe porque al escribir un precio el renglón queda marcado, no
  comparándolo contra el catálogo. Compararlo fue el primer intento y estaba
  mal: al reimportar una lista de precios los renglones ya cotizados quedan
  legítimamente desalineados del catálogo —a propósito, una oferta enviada no
  cambia sola—, así que **todos** parecían tocados a mano y cambiar de lista
  no movía un peso. Las cotizaciones armadas antes de este cambio no tienen la
  marca: en ellas, cambiar de lista repone todos los renglones del catálogo.
- **Los renglones libres** ("Mano de obra", "Obra civil"): no salieron del
  catálogo, así que no tienen precio de canal ni de constructor.

Para **borrar** una cotización hay dos caminos, y los dos preguntan lo mismo:

- **Desde la lista**, con el botón **⋯** del renglón, o deslizándolo hacia la
  izquierda con el dedo como en el correo del teléfono: atrás asoman
  **Editar** (lápiz) y **Eliminar** (caneca), en botones redondeados con su
  dibujo. Deslizar otro cierra el anterior, tocar el renglón abierto lo
  cierra, y un empujoncito corto se devuelve solo. Con teclado se llega con el
  tabulador, o con las flechas ← y → sobre el renglón.

  Lo mismo en **clientes, productos, agenda, cobros y pendientes**: en el
  celular las acciones de cada renglón viven en ese cajón y no en una hilera de
  botones debajo de los datos. Las dos formas salen de la misma lista escrita
  una sola vez, así que no pueden terminar ofreciendo cosas distintas; en el
  computador, donde hay ancho de sobra y nadie desliza, se siguen viendo los
  botones al costado.

  El gesto se escucha con los eventos del dedo (`touchstart`/`touchmove`) y no
  con los de puntero. Con los de puntero andaba en el computador pero no en el
  iPhone: adentro de una lista que se desplaza, Safari se queda con el gesto
  apenas el dedo se mueve y le manda `pointercancel` a la página, así que el
  renglón nunca alcanzaba a correrse. El botón **⋯** está por la misma razón:
  un gesto no se ve, y hay que poder llegar igual.
- **Adentro de la cotización**, en **Editar → Eliminar cotización**.

Antes de preguntar dice qué se lleva puesto —los renglones, y los abonos si los tiene,
con su valor—. Si estaba aprobada, lo que había salido de bodega vuelve al
inventario: si no, la bodega quedaría descontada por una oferta que ya no
existe y no habría forma de averiguar por qué.

## La cotización en PDF, y mandarla por WhatsApp

En la ficha de cada cotización está el botón **Guardar PDF**. El PDF lo arma
el servidor —no el diálogo de impresión del navegador— así que sale igual en
el computador y en el celular.

Antes esto se hacía con «Imprimir → Guardar como PDF». En la aplicación
instalada del celular eso **no funciona**: iOS no le da diálogo de impresión a
una app instalada, así que el botón no hacía absolutamente nada y no había
forma de mandarle la oferta al cliente.

En el celular, ese botón abre el menú de compartir del sistema con el PDF ya
adjunto: desde ahí se guarda en Archivos o se manda por WhatsApp eligiendo el
contacto. Ese menú es el único camino para adjuntar un archivo a WhatsApp —
los enlaces `wa.me` sólo saben mandar texto. En el computador, donde no
existe, el PDF se baja como cualquier descarga.

Es un solo botón a propósito: hubo un rato dos ("Guardar PDF" y "Enviar por
WhatsApp") y en el celular terminaban abriendo la misma pantalla, porque ese
menú ya deja elegir entre las dos cosas.

Las fotos de los productos se guardan en WEBP, que pesa bastante menos, pero
el formato PDF no sabe leerlo. Por eso el navegador las convierte a JPEG antes
de mandarlas: es el único que puede, porque ya las tiene dibujadas en
pantalla. El servidor no podría sin arrastrar una librería de imágenes entera.

El generador (`server/pdf.js`) está escrito a mano, sin dependencias: las
librerías de PDF habituales manejan un navegador entero por dentro y en un
hosting compartido se quedan sin memoria.

### Ver el PDF sin entrar a la cotización

En la **lista de cotizaciones**, el ícono 📄 al lado de "Cerrar" abre la oferta
en PDF sin tener que entrar a la ficha; adentro de la ficha está el botón
**Ver**, al lado de Guardar PDF. La mayoría de las cotizaciones no tienen un
PDF guardado —se arman con renglones, no se suben ya hechas—, así que este
camino la arma al vuelo con lo que tiene hoy. No la guarda ni la sube a ningún
lado: es sólo para mirar. Si la cotización no tiene renglones no hay nada que
mostrar todavía.

Se abre en una **pestaña nueva de verdad**, con el lector de PDF del propio
navegador, no en el visor de la aplicación. Adentro de un `<iframe>` —que es
lo que usa el visor para los PDF ya guardados— Safari en el iPhone no pagina
ni deja hacer scroll dentro de un documento largo: se ve sólo la parte de
arriba, y ahí se corta, sin llegar a los renglones de más abajo ni al total.
Fuera del marco, en su propia pestaña, el mismo Safari sí muestra el
documento entero.

La pestaña se abre en el mismo instante del toque, antes de que el PDF esté
armado, y recién después se le pone la dirección: abrirla más tarde —cuando
ya terminó de armarse— ya no cuenta como algo que pidió la persona, y el
navegador la bloquea como si fuera publicidad.

## Agendamientos que llegan de la web

El formulario de entregas de la web (el que se apoya en una hoja de Google)
puede avisarle a Ari cada vez que alguien toma un turno, y la cita aparece
sola en la agenda con su cliente. Son dos pasos.

**1. Definir el token**, en `.env` o en las variables de entorno de cPanel:

```bash
ARI_TOKEN_ENLACE=una-clave-larga-e-inventada-de-al-menos-16-caracteres
```

Mientras esa variable no exista, la puerta no está abierta: la ruta responde
503 y no hay forma de escribir en la agenda desde afuera.

**2. Pegar el aviso en el Apps Script de la hoja** (Extensiones → Apps Script),
y llamar a `avisarAAri(...)` justo después de guardar la fila:

```js
var ARI_URL   = 'https://ari.clickcontrol.co/api/enlace/cita';
var ARI_TOKEN = 'el mismo valor de ARI_TOKEN_ENLACE';

function avisarAAri(datos) {
  try {
    UrlFetchApp.fetch(ARI_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ARI_TOKEN },
      payload: JSON.stringify({
        proyecto: 'Amazonía 96',
        fecha: datos.fecha, hora: datos.hora,     // '2026-08-21', '8:30'
        nombre: datos.nombre, apto: datos.apto,
        telefono: datos.telefono, correo: datos.correo,
      }),
      muteHttpExceptions: true,   // que un error de Ari no tumbe el agendamiento
    });
  } catch (e) {
    Logger.log('No pude avisarle a Ari: ' + e);
  }
}
```

El aviso lo manda el Apps Script, no el navegador: así el token vive en el
servidor de Google y no en el código de la página, donde cualquiera que mirara
el fuente podría copiarlo y escribir en tu agenda.

### Cancelaciones

El formulario no tiene botón de cancelar: cuando alguien avisa que no puede,
la fila se borra de la hoja y ahí se acaba. Nada de eso llega solo, así que la
cita quedaría en la agenda para siempre.

Para eso está `POST /api/enlace/agenda`: la hoja manda cada tanto la lista
completa de los turnos que siguen en pie, y Ari compara. Lo que está en la
lista se agenda o se actualiza; lo que ya no está se marca como **cancelado**
(no se borra: el registro queda). En el Apps Script es la función
`sincronizarConAri()`, y se deja corriendo sola con un activador de tiempo
(Apps Script → Activadores → cada hora).

Tres cosas que esa sincronización **no** toca, a propósito:

- **Las citas que cargaste a mano.** Se filtra por la marca de origen, así que
  una reunión tuya nunca se cancela sola.
- **Lo que ya pasó.** Sólo mira de hoy en adelante: si limpiás la hoja, las
  entregas viejas siguen en la agenda.
- **Una lista vacía.** Si llega sin ningún turno y hay citas agendadas, frena y
  avisa en vez de vaciarte la agenda: es más probable que la hoja no se haya
  podido leer a que se cancelara todo junto. Para vaciarla de verdad hay que
  pedirlo con `permitir_vaciar`.

Si el turno vuelve a tomarse, la cita revive en vez de duplicarse.

**El aviso no puede duplicar citas.** Cada agendamiento queda marcado con su
turno de origen (proyecto + día + hora), que es justo lo que el formulario ya
garantiza único: no hay dos personas en la franja de las 8:30 de un mismo
viernes. Si el aviso se reintenta, se actualiza la cita que ya estaba en vez
de crear otra; y si alguien libera su turno y lo toma otro, la cita pasa a
nombre del nuevo, que es lo correcto porque el turno es el mismo.

Al cliente se lo reconoce por el correo primero, después por el teléfono y
recién al final por el nombre exacto, así que la misma persona agendando dos
veces no queda duplicada en la lista de clientes. Los datos que ya tuviera
cargados no se pisan: sólo se completan los que estén vacíos.

## Sintetizador de Prompts (app de escritorio para Mac)

En [`escritorio/`](escritorio/) hay una aplicación aparte, que no tiene que ver
con la operación del negocio: convierte un dictado largo —hablado de corrido,
con vueltas y muletillas— en un prompt corto y ordenado para pegar en un
proyecto de Claude.

Corre entera dentro del Mac: **no sale a internet, no llama a ninguna IA y no
gasta un solo token.** Se puede abrir con doble clic
(`escritorio/dist/sintetizador-de-prompts.html`) o instalar como app del Dock.
La guía completa está en [`escritorio/LEEME.md`](escritorio/LEEME.md).

## Datos

Todo queda en `data/clic-control.db` (SQLite), en tu propia máquina o servidor.
Para respaldar, copiá ese archivo. Para empezar de cero, borralo.

## Notas

- La app corre en HTTP local. Si la publicás en internet, ponele HTTPS: los
  navegadores no dan acceso al micrófono en sitios sin certificado.
- Define `ARI_CLAVE` antes de publicarla. Sin esa variable la aplicación no
  pide credenciales.
- Los montos se asumen en pesos colombianos salvo que digas otra moneda.
