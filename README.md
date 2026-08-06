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
| «me quedó de dar / me debe…» | Registra el cobro con vencimiento |
| «mostrame / cuáles / cuánto…» | Consulta y **pinta el resultado en el dashboard** |
| «ya me pagó / ya quedó lista» | Cambia el estado del registro |

Todo lo que se puede hacer por voz también se puede hacer con el mouse: cada
fila tiene botones para marcar como lista/pagada o borrar.

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
  tools.js      Las 9 herramientas de Ari y su ejecución
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

Entidades: `clientes`, `citas`, `recordatorios`, `cotizaciones`, `cobros`, `notas`.

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
