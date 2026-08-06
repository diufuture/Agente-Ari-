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
```

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

> 🔒 **Ojo con esto:** esa dirección es pública. Cualquiera que la tenga puede
> ver tus clientes y tus cobros, porque la aplicación todavía **no tiene
> contraseña**. Sirve perfecto para probar, pero no la dejes abierta ni la
> compartas. La dirección cambia cada vez que arrancás el túnel y muere cuando
> cerrás esa Terminal.

---

## Dejarla prendida todo el tiempo

Hasta acá la aplicación vive en tu computador y funciona mientras esté
encendido. Si querés que esté siempre disponible, estas son las opciones:

| Opción | Cuesta | Sirve para |
|---|---|---|
| **Tu computador** (lo que ya tenés) | Gratis | Probarla y usarla vos solo, en tu escritorio |
| **Tu computador + túnel** | Gratis | Sumarle el celular, mientras el computador esté prendido |
| **Un servidor pequeño en la nube** | ~5 USD al mes | Que esté siempre disponible, desde cualquier lado y para varias personas |

Para la tercera opción sirve cualquier servidor Linux básico (DigitalOcean,
Hetzner, Vultr, Railway, Render). El procedimiento es el mismo de esta guía, más
un dominio con HTTPS y dejar la aplicación corriendo como servicio.

**Antes de dar ese paso, hay que ponerle contraseña.** Hoy cualquiera que llegue
a la dirección entra sin identificarse, y ahí van los datos de tus clientes.

---

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
| La página no carga en el celular | Distinta red, o el firewall bloquea | Verificá que ambos estén en el mismo WiFi y permití el acceso cuando Windows pregunte |

**Para empezar de cero con los datos:** apagá la aplicación y borrá la carpeta
`data`. Se crea vacía al arrancar de nuevo.

**Para respaldar tus datos:** copiá el archivo `data/clic-control.db`. Ahí está
todo: clientes, citas, cotizaciones y cobros.
