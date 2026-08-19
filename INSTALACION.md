# Guía de instalación paso a paso

Escrita para quien nunca ha puesto a correr un programa así. Son unos 15
minutos la primera vez; después arrancarla toma 10 segundos.

Vas a usar la **Terminal** (en Windows se llama *Terminal* o *Símbolo del
sistema*; en Mac, *Terminal*). Es una ventana donde se escriben órdenes y se
presiona Enter. No hay que saber nada de antemano: acá está exactamente qué
escribir.

---

## Paso 1 · Instalar Node

Node es el motor que hace funcionar la aplicación. Se instala una sola vez.

1. Entrá a <https://nodejs.org>
2. Descargá el botón que dice **LTS** (es la versión estable)
3. Abrí el archivo descargado y dale «Siguiente» a todo, sin cambiar nada

**Comprobá que quedó bien instalado.** Abrí la Terminal y escribí:

```bash
node --version
```

Tiene que responder algo como `v22.11.0` o superior. Si dice «no se reconoce el
comando», cerrá la Terminal, abrila de nuevo y volvé a probar.

> La aplicación necesita **Node 22 o superior**. Si te aparece un número menor
> (por ejemplo `v18`), instalá la versión LTS de nuevo desde el enlace de arriba.

---

## Paso 2 · Descargar la aplicación

1. Entrá a <https://github.com/diufuture/Agente-Ari->
2. Botón verde **Code** → **Download ZIP**
3. Descomprimí el ZIP y movelo a un lugar fácil de encontrar, por ejemplo tu
   carpeta de Documentos

Te queda una carpeta llamada `Agente-Ari--main` (o parecido). Podés renombrarla
a `Ari` si querés.

---

## Paso 3 · Abrir la Terminal dentro de esa carpeta

Este es el paso que más confunde, así que va con detalle.

**En Windows:** abrí la carpeta en el Explorador, hacé clic derecho en un
espacio vacío y elegí **«Abrir en Terminal»**. Si no aparece esa opción, hacé
clic derecho manteniendo presionada la tecla Shift.

**En Mac:** abrí la carpeta en Finder, hacé clic derecho sobre ella y elegí
**Servicios → Nuevo terminal en la carpeta**.

**Si nada de eso te funciona,** abrí la Terminal normal y escribí `cd ` (con el
espacio al final), después arrastrá la carpeta hasta la ventana de la Terminal
—la ruta se escribe sola— y presioná Enter.

**Para verificar que estás en el lugar correcto**, escribí:

```bash
ls
```

(en Windows, `dir`). Tiene que aparecer una lista con `package.json`, `server`
y `public`. Si aparece eso, vas bien.

---

## Paso 4 · Instalar lo que la aplicación necesita

En esa misma Terminal:

```bash
npm install
```

Tarda unos segundos y escribe varias líneas. Cuando termine dirá algo como
`added 7 packages`. Esto se hace **una sola vez**.

---

## Paso 5 · Conseguir tu clave de Anthropic

Es lo que le permite a Ari entender lo que le decís. Se paga por uso, por
centavos: cada orden que le des cuesta una fracción de peso.

1. Entrá a <https://console.anthropic.com> y creá una cuenta
2. En **Billing** (Facturación), cargá saldo — con 5 dólares tenés para
   muchísimo uso
3. Andá a **API Keys** → **Create Key**, ponele cualquier nombre
4. **Copiá la clave** apenas te la muestre. Empieza con `sk-ant-` y **no la vas
   a poder ver de nuevo**; si la perdés, creás otra y listo

> Tratá esa clave como la contraseña de tu banco: no la compartas ni la mandes
> por WhatsApp. Quien la tenga puede gastar de tu saldo.

---

## Paso 6 · Guardar la clave en la aplicación

En la Terminal, dentro de la carpeta, copiá el archivo de ejemplo:

**Windows:**
```bash
copy .env.example .env
notepad .env
```

**Mac:**
```bash
cp .env.example .env
open -e .env
```

Se abre un editor de texto. Buscá la línea que dice:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Borrá `sk-ant-...` y pegá tu clave real en su lugar. Tiene que quedar pegada al
signo igual, sin espacios ni comillas:

```
ANTHROPIC_API_KEY=sk-ant-api03-TuClaveRealAcá
```

Guardá el archivo (Ctrl+S en Windows, Cmd+S en Mac) y cerralo.

> **Importante:** el archivo se llama `.env`, con el punto adelante y sin
> ninguna extensión. Por eso conviene crearlo con el comando de arriba y no a
> mano desde el Explorador, que suele agregarle `.txt` sin avisar.

---

## Paso 7 · Arrancar

```bash
npm start
```

Vas a ver:

```
  Clic Control · Ari
  ➜  http://localhost:3000
  ➜  modelo: claude-opus-5
  ⚠  SIN CONTRASEÑA: cualquiera que llegue a esta dirección ve tus datos.
     Está bien en tu computador; si la publicás, definí ARI_CLAVE.
```

Ese aviso es normal y correcto mientras la uses en tu propio computador: nadie
más llega a `localhost`. Sólo importa cuando la publiques.

Abrí el navegador y entrá a **<http://localhost:3000>**. Ya está funcionando.

La primera vez el navegador te va a pedir permiso para usar el micrófono:
dale **Permitir**. Tocá el micrófono y decile algo como *«creá un cliente nuevo:
Ferretería El Tornillo, teléfono 3105554433»*.

> Si en vez de las líneas de arriba aparece un aviso de que falta tu clave,
> volvé al Paso 6: quedó sin reemplazar o con un espacio de más.

---

## Uso de todos los días

Ya no tenés que repetir la instalación. Cada vez que quieras usarla:

1. Abrí la Terminal en la carpeta (Paso 3)
2. Escribí `npm start`
3. Entrá a <http://localhost:3000>

**Para apagarla:** volvé a la Terminal y presioná `Ctrl + C`. Tus datos quedan
guardados.

**Mientras la Terminal esté abierta, la aplicación está prendida.** Si cerrás
esa ventana, se apaga.

### Ver y corregir a mano

No todo hay que dictarlo. Tocando un **cliente** en la lista se abre su ficha
con sus cifras (cotizado, abonado, saldo y por cobrar), el **historial completo
de abonos** —cada uno con su fecha y sobre qué cotización fue— y sus
cotizaciones, cobros, citas y notas.

Ahí mismo, el botón **Editar datos** abre un formulario para escribir a mano el
teléfono, la empresa, el correo, la dirección o las notas. Guardás y listo. La
ficha de la cotización tiene lo mismo, más el formulario para agregar abonos.

---

## Antes de mandar la primera cotización

Dos cosas que se hacen una sola vez y quedan para siempre:

### 1 · Tu logo

Copiá tu logo dentro de la carpeta **`public`** del proyecto, con el nombre
**`logo.png`**. Aparece en la barra lateral, en la pantalla de acceso y —lo más
importante— **en las cotizaciones que imprimís**. Si no ponés ninguno, se usa
una versión dibujada con los colores de la marca.

### 2 · Los datos de la empresa

Abajo en el menú, **⚙ Datos de la empresa**. Cargá el nombre, NIT, dirección,
teléfono y correo; tu nombre y contacto como representante de ventas; y las
condiciones comerciales (tiempo de entrega, garantía, forma de pago).

Todo eso encabeza y cierra las cotizaciones impresas. Cada cotización puede
llevar sus propias condiciones si esa oferta va distinta.

---

## Armar una cotización

### Primero, el catálogo

En **Productos → Importar lista de precios**, subís el Excel del proveedor tal
como te lo manda. La aplicación:

- Adivina qué columna es cuál y te lo muestra para que lo confirmes.
- **Trae las fotos** que el Excel tenga pegadas sobre cada producto.
- Si es una lista que ya subiste antes, **compara y te muestra qué va a
  cambiar** —qué precios suben, qué productos son nuevos, cuáles ya no vienen—
  antes de tocar nada. Lo que vos hayas cargado a mano (fotos, notas,
  inventario) no se pierde.

Si son productos tuyos y no de un proveedor, marcá *«Son productos propios»*
para llevarles inventario.

### Después, la cotización

Se puede armar **hablando, mientras recorrés el sitio del cliente**:

1. *«Hacele una cotización a Jimmy Forero para la casa»*
2. *«Agregá dos interruptores de dos canales»* — y seguís, ítem por ítem, **sin
   repetir el nombre del cliente**
3. *«Sumale la mano de obra, un millón ochocientos»*
4. *«Ponele 19 de IVA»*
5. *«Listo, esa es la cotización»*

Arriba te queda un aviso con lo que llevás sumado. El interruptor **manos
libres** (junto al de voz) reabre el micrófono solo después de cada respuesta,
así no tenés que tocar el teléfono entre un ítem y otro.

También se arma con el mouse: buscás en el catálogo y agregás, o escribís una
línea suelta. La cantidad y el precio se editan directamente en la tabla, y el
botón `%` le sube o baja un porcentaje a un renglón.

### Y por último, el PDF

En la cotización, el botón **Imprimir / PDF** la abre ya maquetada. Ahí hacés
**Imprimir → Guardar como PDF** y se lo mandás al cliente por correo o WhatsApp.

---

## Usarla desde el celular

La aplicación está hecha para el teléfono: barra de navegación abajo, micrófono
flotante y las tablas convertidas en fichas.

### La forma rápida (misma red WiFi)

Con el servidor corriendo en tu computador, averiguá su dirección en la red:

**Windows:** `ipconfig` → buscá **Dirección IPv4**, algo como `192.168.1.20`
**Mac:** `ipconfig getifaddr en0`

Después, en el celular —conectado al **mismo WiFi**— entrá a
`http://192.168.1.20:3000` (con tu número).

La primera vez Windows puede preguntar si permitís el acceso en redes privadas:
decí que sí.

> ⚠️ **Así vas a poder ver y escribir todo, pero el micrófono no va a funcionar.**
> No es un error de la aplicación: los navegadores sólo dan acceso al micrófono
> en `localhost` o en direcciones con HTTPS (candado). Para tener voz en el
> celular, seguí con la opción de abajo.

### Con voz en el celular (túnel HTTPS)

Un túnel le da a tu computador una dirección `https://` temporal que funciona
desde cualquier lado. No hay que configurar nada.

1. Instalá `cloudflared` desde
   <https://developers.cloudflare.com/cloudflare-tunnel/downloads/>
2. Con la aplicación ya corriendo (`npm start`), abrí **otra** ventana de
   Terminal y escribí:

```bash
cloudflared tunnel --url http://localhost:3000
```

Te va a mostrar una dirección tipo `https://algo-random.trycloudflare.com`.
Abrila en el celular: ahí el micrófono sí funciona, y podés instalarla en la
pantalla de inicio (Chrome: «Agregar a la pantalla de inicio»; iPhone:
Compartir → «Agregar a inicio»).

> 🔒 **Ojo con esto:** esa dirección es pública, así que conviene ponerle
> contraseña antes. En tu `.env` agregá dos líneas y reiniciá con `npm start`:
>
> ```
> ARI_USUARIO=tu-usuario
> ARI_CLAVE=una-contraseña-larga
> ```
>
> La dirección cambia cada vez que arrancás el túnel y muere cuando cerrás esa
> Terminal.

---

## Publicarla en tu hosting (cPanel)

Esta es la opción definitiva: dirección propia, HTTPS —así **el micrófono
funciona en el celular**— y disponible aunque tu computador esté apagado.

**Requisito:** que tu cPanel tenga **Setup Node.js App** con **Node 22 o
superior**. Si sólo llega a 18 o 20, no sirve tal cual.

### 1 · Crear el subdominio

cPanel → **Dominios** → **Crear un dominio**, y poné `ari.tudominio.com`.
Tu página web actual no se toca: la aplicación vive aparte.

En «Raíz del documento» dejá lo que proponga; no vamos a usar esa carpeta.

### 2 · Crear la aplicación Node

cPanel → **Setup Node.js App** → **CREATE APPLICATION**:

| Campo | Qué poner |
|---|---|
| Node.js version | **22.x** (la más alta disponible) |
| Application mode | **Production** |
| Application root | `ari` |
| Application URL | el subdominio del paso 1 |
| Application startup file | `server/index.js` |

**No pongas `public_html` como Application root.** Ahí vive tu sitio web; la
aplicación va en su propia carpeta.

Dale **CREATE**. Se crea `/home/TU_USUARIO/ari`.

### 3 · Subir los archivos

1. Descargá el ZIP del proyecto desde GitHub (**Code → Download ZIP**)
2. cPanel → **Administrador de archivos** → entrá a la carpeta `ari`
3. **Upload** → subí el ZIP
4. Clic derecho sobre el ZIP → **Extract**
5. Si los archivos quedaron dentro de una subcarpeta (`Agente-Ari--main`),
   entrá, seleccioná todo y movelo un nivel arriba, hasta `ari`

Al terminar, dentro de `ari` tienen que verse `package.json`, `server` y
`public`.

> **No subas la carpeta `node_modules`.** Se instala en el servidor en el paso 5.
> Tampoco subas tu archivo `.env`: la clave va en el paso siguiente.

### 4 · Las variables (clave y contraseña)

Volvé a **Setup Node.js App**, entrá a tu aplicación con el lápiz de editar y
bajá hasta **Environment variables**. Agregá tres con **ADD VARIABLE**:

| Nombre | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu clave `sk-ant-...` |
| `ARI_USUARIO` | el usuario con el que vas a entrar |
| `ARI_CLAVE` | una contraseña larga, distinta a las que ya usás |

Guardá.

> 🔒 **`ARI_CLAVE` no es opcional acá.** Sin ella la aplicación queda abierta y
> cualquiera que dé con la dirección ve tus clientes, sus teléfonos y cuánto te
> deben. Con ella, pide usuario y contraseña antes de mostrar nada.
>
> Guardar la clave de Anthropic acá es además más seguro que en un archivo
> `.env`: no queda escrita en el disco del sitio.

### 5 · Instalar y arrancar

En la misma pantalla:

1. **Run NPM Install** → esperá a que termine
2. **RESTART**

### 6 · Activar HTTPS

cPanel → **SSL/TLS Status** → marcá el subdominio → **Run AutoSSL**. Es gratis
y tarda unos minutos.

Sin esto el micrófono no funciona en el celular; con esto, sí.

### 7 · Probar

Entrá a `https://ari.tudominio.com`. Te recibe la pantalla de acceso: poné el
usuario y la contraseña del paso 4.

Desde el celular, abrí esa misma dirección y agregala a la pantalla de inicio
(Chrome: «Agregar a la pantalla de inicio»; iPhone: Compartir → «Agregar a
inicio»). Queda con ícono propio, a pantalla completa y con voz.

### Si algo no arranca

En **Setup Node.js App**, la aplicación muestra su estado y hay un enlace a los
registros de error. Lo más común:

| Síntoma | Causa |
|---|---|
| Error 503 o página en blanco | Falta **Run NPM Install**, o el startup file no es `server/index.js` |
| `Cannot find module 'node:sqlite'` | La versión de Node quedó en 18 o 20: cambiala a 22 y reiniciá |
| Pide contraseña y no la acepta | Revisá `ARI_USUARIO` y `ARI_CLAVE` en las variables; después de cambiarlas hay que **RESTART** |
| Ari no responde | Falta `ANTHROPIC_API_KEY`, o tu hosting bloquea las conexiones salientes |

Para los datos: quedan en `/home/TU_USUARIO/ari/data/clic-control.db`. Descargá
ese archivo de vez en cuando como respaldo.

---

## Actualizar a una versión nueva

Cuando se le agreguen funciones, hay que subir los archivos nuevos al servidor.
Son cinco minutos y siempre es el mismo procedimiento.

> ⚠️ **Lo único que no se puede perder es la carpeta `data`**: ahí viven tus
> clientes, cotizaciones y productos. Los pasos de abajo no la tocan, pero el
> paso 1 es para que aunque algo salga mal, tengas de dónde volver.

### 1 · Respaldar la base de datos (siempre)

En el **File Manager**, entrá a `/home/TU_USUARIO/ari/data`, seleccioná
**`clic-control.db`** y usá **Download**. Guardalo en tu computador con la fecha
en el nombre. Si algo sale mal, con volver a subir ese archivo queda todo como
estaba.

### 2 · Bajar la versión nueva

Abrí el repositorio en GitHub, entrá a la rama del proyecto, y usá el botón
verde **Code → Download ZIP**. Se descarga un `.zip` en tu computador.

### 3 · Prepararlo

Descomprimí ese ZIP (doble clic). Queda una carpeta con un nombre largo. **Entrá
a esa carpeta**, seleccioná todo lo de adentro (Cmd+A), clic derecho →
**Comprimir**. Eso genera un `Archive.zip` con los archivos sueltos, que es lo
que entiende cPanel.

> Si el ZIP te llegó armado (no bajado de GitHub), fijate **antes de subirlo**
> que al abrirlo se vean `server`, `public`, `package.json`… sueltos. Si en vez
> de eso se ve **una sola carpeta**, y lo extraés así en cPanel, los archivos
> quedan un piso más abajo: la aplicación sigue corriendo los viejos y parece
> que la actualización no hizo nada.

> Es el mismo paso que la primera vez: cPanel no sabe subir carpetas, sólo
> archivos, y el ZIP tiene que traer los archivos en la raíz.

### 4 · Subirlo y extraerlo

En el **File Manager**, parado en `/home/TU_USUARIO/ari`:

1. **Upload** → arrastrá el `Archive.zip`.
2. Cuando termine, clic derecho sobre él → **Extract**.
3. Confirmá que se sobrescriban los archivos existentes.
4. Borrá el `Archive.zip` y, si aparece, la carpeta `__MACOSX`.

Los archivos viejos se reemplazan por los nuevos. `data` no está en el ZIP, así
que queda intacta.

### 5 · Reiniciar

En **Setup Node.js App** → tu aplicación → **RESTART**.

### 6 · Confirmar que entró

Abrí la aplicación, tocá el **piñón ⚙** y bajá hasta el final: ahí dice qué
versión está corriendo. Si es la que subiste, listo. Si sigue siendo la
anterior, los archivos no se reemplazaron —lo más común es que hayan quedado
adentro de una carpeta al extraer el ZIP— o falta el RESTART.

Si la versión nueva trae dependencias nuevas (te lo vamos a avisar), antes de
reiniciar hacé **Run NPM Install**.

### 6 · Comprobar

Entrá a `https://ari.tudominio.com` y fijate que tus clientes y cotizaciones
sigan ahí. La primera vez que arranca, la aplicación acomoda sola la base de
datos para lo que traiga la versión nueva, sin borrar nada.

> Si ves la versión vieja, es el navegador guardando la página. Recargá
> forzando: **Cmd+Shift+R** en Mac, o abrí una ventana privada.

---

## Otras formas de dejarla disponible

| Opción | Cuesta | Sirve para |
|---|---|---|
| **Tu computador** | Gratis | Probarla y usarla en tu escritorio |
| **Tu computador + túnel** | Gratis | Sumarle el celular, mientras el computador esté prendido |
| **Tu hosting cPanel** | Ya lo pagás | Siempre disponible, con tu dominio y HTTPS |
| **Servidor en la nube** | ~5 USD al mes | Si tu hosting no soporta Node 22 |

Si tu cPanel no llega a Node 22, **Railway** o **Render** son la alternativa
simple: conectás el repositorio de GitHub, ponés las mismas variables de
entorno y se despliega solo, con HTTPS incluido.


## Si algo falla

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| `node: no se reconoce el comando` | Node no quedó instalado o la Terminal está desactualizada | Cerrá y abrí la Terminal. Si sigue, reinstalá Node (Paso 1) |
| `Cannot find module` al hacer `npm start` | Faltó instalar las dependencias | Corré `npm install` (Paso 4) |
| `EADDRINUSE` / «puerto en uso» | Ya hay algo usando el puerto 3000 | Arrancá en otro puerto: `PORT=3001 npm start` y entrá a `localhost:3001` |
| Aviso de que falta tu clave | El `.env` quedó mal | Repetí el Paso 6; revisá que no haya espacios ni comillas |
| `401` o `authentication_error` | La clave es inválida o está vencida | Creá una clave nueva en la consola de Anthropic |
| `credit balance is too low` | Se acabó el saldo | Recargá en **Billing** |
| El micrófono no aparece o no escucha | Navegador sin soporte, sin permiso, o sin HTTPS | Usá Chrome, Edge o Safari; revisá el permiso del micrófono; en el celular usá el túnel |
| Pide usuario y contraseña y no las recordás | `ARI_CLAVE` quedó definida | Cambiala en el `.env` (o en las variables del hosting) y reiniciá |
| La página no carga en el celular | Distinta red, o el firewall bloquea | Verificá que ambos estén en el mismo WiFi y permití el acceso cuando Windows pregunte |

**Para empezar de cero con los datos:** apagá la aplicación y borrá la carpeta
`data`. Se crea vacía al arrancar de nuevo.

**Para respaldar tus datos:** copiá el archivo `data/clic-control.db`. Ahí está
todo: clientes, citas, cotizaciones y cobros.
