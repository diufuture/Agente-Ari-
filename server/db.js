// Capa de datos. SQLite viene incluido en Node 22 (node:sqlite), así que no
// hace falta ninguna dependencia nativa.

/**
 * La zona horaria del negocio, fijada antes de tocar una sola fecha.
 *
 * El hosting corre en UTC. Con eso, a partir de las 7 de la tarde en Colombia
 * el servidor ya cree que es el día siguiente, y todo lo que dependa de "hoy"
 * se corre un día: agendar "para mañana" caía pasado mañana, y una cita de
 * mañana aparecía contada en "citas hoy". Un error de fecha silencioso, que
 * sólo se nota de noche.
 *
 * Afecta a Date, a Intl y al 'localtime' de SQLite, que es todo lo que usa
 * este archivo. No se hereda la zona del hosting a propósito: esa es justo la
 * que está mal. Si el negocio estuviera en otra parte, se cambia con ARI_ZONA.
 */
process.env.TZ = process.env.ARI_ZONA || 'America/Bogota';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Las rutas relativas se resuelven contra la carpeta del proyecto, no contra el
// directorio desde el que se ejecutó el proceso: al desplegar en un servidor
// (Passenger, systemd, PM2) el directorio de trabajo suele ser otro, y la base
// de datos terminaría creándose en un lugar inesperado.
const RAIZ = resolve(fileURLToPath(new URL('../', import.meta.url)));
const DB_PATH = resolve(RAIZ, process.env.ARI_DB || './data/clic-control.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
-- Si otro proceso tiene la base tomada, se espera en vez de fallar en el acto.
-- Sin esto, cualquier escritura que coincidiera con otra —incluidas las de
-- arranque— tiraba "database is locked" y la aplicación no levantaba.
PRAGMA busy_timeout = 8000;

CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  empresa    TEXT,
  telefono   TEXT,
  email      TEXT,
  direccion  TEXT,
  notas      TEXT,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS citas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo       TEXT NOT NULL,
  cliente_id   INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  inicio       TEXT NOT NULL,               -- 'YYYY-MM-DDTHH:MM'
  duracion_min INTEGER NOT NULL DEFAULT 60,
  lugar        TEXT,
  notas        TEXT,
  estado       TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | completada | cancelada
  creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS recordatorios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  texto      TEXT NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  vence_en   TEXT,                          -- 'YYYY-MM-DDTHH:MM' o 'YYYY-MM-DD'
  prioridad  TEXT NOT NULL DEFAULT 'media', -- alta | media | baja
  estado     TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | completada | cancelada
  creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS cotizaciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  titulo      TEXT NOT NULL,
  descripcion TEXT,
  monto       REAL NOT NULL DEFAULT 0,
  moneda      TEXT NOT NULL DEFAULT 'COP',
  estado      TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada
  vence_en    TEXT,
  -- Porcentajes que se aplican sobre la suma de los renglones. Arrancan en
  -- cero: se ponen por cotización, según lo que se esté ofertando.
  porcentaje_servicio REAL NOT NULL DEFAULT 0,
  porcentaje_iva      REAL NOT NULL DEFAULT 0,
  -- Con cuál de los tres precios del catálogo se agregan los productos.
  nivel_precio        TEXT NOT NULL DEFAULT 'cliente', -- canal | constructor | cliente
  -- Lo que va impreso al pie y puede cambiar de una oferta a otra.
  validez     TEXT,
  condiciones TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS cobros (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  concepto   TEXT NOT NULL,
  monto      REAL NOT NULL DEFAULT 0,
  moneda     TEXT NOT NULL DEFAULT 'COP',
  vence_en   TEXT,
  estado     TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagado | vencido
  creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS abonos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  monto         REAL NOT NULL,
  fecha         TEXT,                        -- 'YYYY-MM-DD'
  nota          TEXT,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Catálogo de productos: lo que se sube desde las listas de precios de los
-- proveedores. Trae hasta tres niveles de precio porque así vienen esas
-- listas (canal / constructor / cliente final); una cotización puede tomar
-- cualquiera de los tres como punto de partida y después ajustarlo a mano.
CREATE TABLE IF NOT EXISTS productos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria          TEXT,
  referencia         TEXT,
  descripcion        TEXT NOT NULL,
  marca              TEXT,
  unidad             TEXT NOT NULL DEFAULT 'UND',
  precio_canal       REAL,
  precio_constructor REAL,
  precio_cliente     REAL NOT NULL DEFAULT 0,
  foto               TEXT,
  proveedor          TEXT,
  notas              TEXT,
  activo             INTEGER NOT NULL DEFAULT 1,
  maneja_inventario  INTEGER NOT NULL DEFAULT 0,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Datos que encabezan y cierran las cotizaciones impresas: la empresa, el
-- representante de ventas y las condiciones comerciales por defecto. Es una
-- tabla clave/valor porque son un puñado de textos que se editan de vez en
-- cuando, no entidades con vida propia.
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

-- Renglones de una cotización. Los datos del producto se copian acá al
-- agregarlo (descripción, precio, marca…) en vez de leerse del catálogo cada
-- vez: una cotización ya enviada no puede cambiar sola porque después se
-- actualizó una lista de precios. Por eso producto_id es sólo una referencia
-- y queda en NULL si el producto se borra del catálogo, sin perder el renglón.
CREATE TABLE IF NOT EXISTS cotizacion_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cotizacion_id   INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id     INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  seccion         TEXT,
  descripcion     TEXT NOT NULL,
  referencia      TEXT,
  marca           TEXT,
  unidad          TEXT NOT NULL DEFAULT 'UND',
  foto            TEXT,
  cantidad        REAL NOT NULL DEFAULT 1,
  precio_unitario REAL NOT NULL DEFAULT 0,
  -- Queda en 1 cuando el precio lo escribió una persona, no la lista. Es el
  -- único dato con el que se puede saber si un renglón fuera de lista está así
  -- porque alguien lo decidió o porque la lista del proveedor cambió después.
  precio_manual   INTEGER NOT NULL DEFAULT 0,
  orden           INTEGER NOT NULL DEFAULT 0,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Entradas y salidas de inventario. Sólo tiene sentido para los productos
-- propios de Clic Control (maneja_inventario = 1): los que vienen de listas
-- de precios de otros proveedores se cotizan pero no se guardan en bodega.
-- El stock actual nunca se guarda como número aparte: se calcula sumando
-- estos movimientos, igual que el saldo de una cotización con sus abonos.
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad     REAL NOT NULL,     -- positiva = entrada, negativa = salida
  motivo       TEXT,
  -- Cuando la salida la causó aprobar una cotización, queda anotado cuál: así
  -- se sabe cuáles son automáticos y se pueden rehacer si la cotización
  -- cambia de estado o de cantidades.
  cotizacion_id INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
  creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- El catálogo público: quien se registra queda acá, no en clientes —
-- todavía no compró nada, así que no es un cliente—. El dueño lo aprueba (o
-- lo rechaza) y le asigna un nivel de precio; recién con la primera cotización
-- que arme desde la tienda se le crea (o se le engancha) el cliente de verdad.
CREATE TABLE IF NOT EXISTS clientes_portal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  empresa     TEXT,
  telefono    TEXT,
  email       TEXT NOT NULL,
  clave_hash  TEXT NOT NULL,
  -- pendiente | aprobado | rechazado. Sólo "aprobado" puede entrar a mirar el
  -- catálogo; los otros dos se lo dicen al intentar iniciar sesión.
  estado      TEXT NOT NULL DEFAULT 'pendiente',
  -- Con cuál de los tres precios ve el catálogo. Se define al aprobar, no
  -- antes: mientras está pendiente no hay nada que mostrarle todavía.
  nivel_precio TEXT,
  -- El cliente de la tabla clientes al que quedaron sus pedidos, una vez que
  -- hizo el primero. Null hasta entonces.
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  aprobado_en TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_email ON clientes_portal(email COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_citas_inicio  ON citas(inicio);
CREATE INDEX IF NOT EXISTS idx_rec_vence     ON recordatorios(vence_en);
CREATE INDEX IF NOT EXISTS idx_cot_cliente   ON cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cob_cliente   ON cobros(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abo_cot       ON abonos(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_prod_categoria ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_items_cot ON cotizacion_items(cotizacion_id);

-- Estos cuatro cubren los filtros por estado que hace consultar() en cada
-- pantalla (citas de hoy, recordatorios pendientes, cobros vencidos...): sin
-- índice, cada uno recorre la tabla entera para descartar lo que no aplica.
-- Van con la fecha como segunda columna porque casi siempre se filtra por
-- estado Y se ordena (o se acota) por fecha en la misma consulta.
CREATE INDEX IF NOT EXISTS idx_citas_estado  ON citas(estado, inicio);
CREATE INDEX IF NOT EXISTS idx_rec_estado    ON recordatorios(estado, vence_en);
CREATE INDEX IF NOT EXISTS idx_cob_estado    ON cobros(estado, vence_en);
CREATE INDEX IF NOT EXISTS idx_cot_estado    ON cotizaciones(estado);
-- Un producto descontinuado se filtra en casi cualquier consulta al catálogo.
CREATE INDEX IF NOT EXISTS idx_prod_activo   ON productos(activo);
-- sincronizarInventario() borra por cotizacion_id en cada aprobación o
-- cambio de renglón; sólo había índice por producto_id, no por este lado.
CREATE INDEX IF NOT EXISTS idx_mov_cotizacion ON movimientos_stock(cotizacion_id);
`);

// Migraciones suaves: CREATE TABLE IF NOT EXISTS no agrega columnas nuevas a
// una tabla que ya existía, así que las bases creadas con versiones
// anteriores se completan acá sin perder datos.
//
// Ninguna de éstas puede impedir que la aplicación arranque. Si una falla
// —porque otro proceso tiene la base tomada, por ejemplo— se anota y se sigue:
// lo peor que pasa es que una función nueva no ande hasta el próximo arranque,
// que es muchísimo mejor que quedarse sin sistema. Una vez esto tumbó el
// servidor entero por un UPDATE que no tenía nada que actualizar.
try {
  const columnasDe = (tabla) => db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);

  const prod = columnasDe('productos');
  if (!prod.includes('maneja_inventario')) {
    db.exec('ALTER TABLE productos ADD COLUMN maneja_inventario INTEGER NOT NULL DEFAULT 0');
  }
  // Cómo se llama el producto en la jerga del negocio: "Display", "Switch EU",
  // "Switch US". Es lo que se usa para filtrar cuando hay que mostrarle algo
  // puntual a un cliente en el momento. Va aparte de la categoría, que la
  // manda el proveedor en su lista.
  if (!prod.includes('tipo')) db.exec('ALTER TABLE productos ADD COLUMN tipo TEXT');
  // La ficha técnica del fabricante, en PDF.
  if (!prod.includes('ficha')) db.exec('ALTER TABLE productos ADD COLUMN ficha TEXT');
  if (!prod.includes('ficha_nombre')) db.exec('ALTER TABLE productos ADD COLUMN ficha_nombre TEXT');
  // Fotos de más, para el catálogo público: la lista de precios trae una sola
  // (o ninguna), y ahí no alcanza para que alguien decida comprar sin haberlo
  // visto de cerca. Va como texto con un JSON adentro —un arreglo de
  // direcciones— y no como tabla aparte: son cuando mucho un puñado por
  // producto, y no hace falta consultarlas por separado de su dueño.
  if (!prod.includes('fotos_extra')) db.exec('ALTER TABLE productos ADD COLUMN fotos_extra TEXT');

  const cot = columnasDe('cotizaciones');
  if (!cot.includes('porcentaje_servicio')) {
    db.exec('ALTER TABLE cotizaciones ADD COLUMN porcentaje_servicio REAL NOT NULL DEFAULT 0');
  }
  if (!cot.includes('porcentaje_iva')) {
    db.exec('ALTER TABLE cotizaciones ADD COLUMN porcentaje_iva REAL NOT NULL DEFAULT 0');
  }
  if (!cot.includes('nivel_precio')) {
    db.exec("ALTER TABLE cotizaciones ADD COLUMN nivel_precio TEXT NOT NULL DEFAULT 'cliente'");
  }
  // Lo que va impreso y puede cambiar de una oferta a otra.
  if (!cot.includes('validez')) db.exec('ALTER TABLE cotizaciones ADD COLUMN validez TEXT');
  if (!cot.includes('condiciones')) db.exec('ALTER TABLE cotizaciones ADD COLUMN condiciones TEXT');
  // Una cotización armada por fuera y subida ya lista en PDF: la oferta es el
  // archivo, y acá vive el seguimiento (cliente, saldo, abonos, estado).
  if (!cot.includes('archivo')) db.exec('ALTER TABLE cotizaciones ADD COLUMN archivo TEXT');
  if (!cot.includes('archivo_nombre')) db.exec('ALTER TABLE cotizaciones ADD COLUMN archivo_nombre TEXT');

  // Quién firma esta oferta. Si queda vacío se imprime el de los ajustes.
  if (!cot.includes('representante')) db.exec('ALTER TABLE cotizaciones ADD COLUMN representante TEXT');
  if (!cot.includes('representante_telefono')) db.exec('ALTER TABLE cotizaciones ADD COLUMN representante_telefono TEXT');
  if (!cot.includes('representante_email')) db.exec('ALTER TABLE cotizaciones ADD COLUMN representante_email TEXT');

  // De dónde salió la cotización: null es "la armó alguien de Clic Control",
  // 'portal' es "la mandó un cliente desde el catálogo público". Es lo que
  // permite marcarla en la lista sin tener que adivinar por el título.
  if (!cot.includes('origen')) db.exec('ALTER TABLE cotizaciones ADD COLUMN origen TEXT');

  // "Enviada" era un estado de más: mandarle la oferta al cliente no cambia
  // nada del negocio, sigue estando pendiente de que la apruebe. Las que
  // quedaron así pasan a pendiente.
  //
  // Se pregunta antes de escribir: sin eso, cada arranque hacía un UPDATE
  // aunque no hubiera nada que cambiar, y bastaba con que otro proceso tuviera
  // la base tomada para que la aplicación no levantara.
  if (db.prepare("SELECT 1 FROM cotizaciones WHERE estado = 'enviada' LIMIT 1").get()) {
    db.exec("UPDATE cotizaciones SET estado = 'pendiente' WHERE estado = 'enviada'");
  }

  // Una cotización cerrada sale de la lista de trabajo y queda en el historial
  // del cliente. Es una decisión del usuario, no algo que pase solo: se cierra
  // cuando el negocio terminó, y para eso el saldo tiene que estar en cero.
  if (!cot.includes('archivada')) {
    db.exec('ALTER TABLE cotizaciones ADD COLUMN archivada INTEGER NOT NULL DEFAULT 0');
  }

  // De dónde salió una cita que no se creó acá adentro (el formulario de
  // agendamiento de la web, por ejemplo). Guarda una marca única del turno de
  // origen —"amazonia96:2026-08-21T08:30"— y es lo que evita que el mismo
  // agendamiento entre dos veces si el aviso se reintenta: en vez de insertar
  // a ciegas, se busca por esta marca y se actualiza la que ya estaba.
  const cit = columnasDe('citas');
  if (!cit.includes('origen')) db.exec('ALTER TABLE citas ADD COLUMN origen TEXT');

  // En qué parte de la casa va cada renglón (Sala, Cocina, Habitación...).
  // Es opcional: si nadie la usa, la columna no aparece impresa.
  const item = columnasDe('cotizacion_items');
  if (!item.includes('area')) db.exec('ALTER TABLE cotizacion_items ADD COLUMN area TEXT');
  if (!item.includes('precio_manual')) {
    db.exec('ALTER TABLE cotizacion_items ADD COLUMN precio_manual INTEGER NOT NULL DEFAULT 0');
  }

  const mov = columnasDe('movimientos_stock');
  if (!mov.includes('cotizacion_id')) {
    db.exec('ALTER TABLE movimientos_stock ADD COLUMN cotizacion_id INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL');
  }

  // Estos dos filtros son los que más se repiten (toda lista de cotizaciones
  // pide archivada = 0; todo filtro por tipo de producto es sobre los
  // activos), así que van compuestos en vez de sueltos. Se crean acá, no en
  // el bloque de arriba, porque las columnas recién se crearon en esta misma
  // pasada: si la migración falló y `archivada`/`tipo` no existen, tampoco
  // se llega hasta acá, y el índice sobre una columna que no existe rompería
  // el arranque en vez de simplemente no aplicar.
  db.exec('CREATE INDEX IF NOT EXISTS idx_cot_archivada_estado ON cotizaciones(archivada, estado)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_prod_activo_tipo ON productos(activo, tipo)');
  // Único de verdad, no sólo un índice para buscar rápido: si por lo que sea
  // llegaran dos avisos del mismo turno a la vez, la base rechaza el segundo
  // en lugar de dejar la agenda con la cita repetida.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_citas_origen ON citas(origen) WHERE origen IS NOT NULL');
  // El badge de "hay registros por aprobar" filtra por esto en cada vuelta.
  db.exec("CREATE INDEX IF NOT EXISTS idx_portal_estado ON clientes_portal(estado)");
} catch (err) {
  console.error('[base de datos] no pude aplicar una migración:', err.message);
  console.error('  La aplicación arranca igual. Si algo nuevo no funciona, reiniciala cuando');
  console.error('  no haya otro proceso usando la base.');
}

/**
 * Las columnas reales de cada tabla, para no dejar que un nombre de campo
 * inventado entre a armar el SQL. `actualizar`/`insertar` reciben lo que
 * mandó el navegador, y aunque haya que tener sesión para llegar hasta acá,
 * el nombre de una columna no es algo que se pueda pasar como parámetro: si
 * no se filtra, se está concatenando texto ajeno adentro de la consulta.
 */
const COLUMNAS = new Map();
export function columnasReales(tabla) {
  if (!COLUMNAS.has(tabla)) {
    COLUMNAS.set(tabla, new Set(db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name)));
  }
  return COLUMNAS.get(tabla);
}

/** Deja sólo los campos que la tabla realmente tiene. */
function soloColumnas(tabla, datos) {
  const validas = columnasReales(tabla);
  const limpio = {};
  for (const [k, v] of Object.entries(datos)) {
    if (validas.has(k) && v !== undefined) limpio[k] = v;
  }
  return limpio;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

// `orden` ya viene calificado con el alias `t.` que usa selectConCliente(),
// salvo en clientes, que se consulta sin alias.
export const ENTIDADES = {
  clientes: { tabla: 'clientes', orden: 'nombre COLLATE NOCASE ASC' },
  citas: { tabla: 'citas', orden: 't.inicio ASC' },
  recordatorios: { tabla: 'recordatorios', orden: "COALESCE(t.vence_en,'9999') ASC" },
  cotizaciones: { tabla: 'cotizaciones', orden: 't.id DESC' },
  cobros: { tabla: 'cobros', orden: "COALESCE(t.vence_en,'9999') ASC" },
  notas: { tabla: 'notas', orden: 't.id DESC' },
  abonos: { tabla: 'abonos', orden: "COALESCE(t.fecha, t.creado_en) DESC" },
  productos: { tabla: 'productos', orden: 't.categoria COLLATE NOCASE ASC, t.descripcion COLLATE NOCASE ASC' },
  movimientos_stock: { tabla: 'movimientos_stock', orden: 't.id DESC' },
  cotizacion_items: { tabla: 'cotizacion_items', orden: 't.orden ASC, t.id ASC' },
};

const all = (sql, params = []) => db.prepare(sql).all(...params);

const one = (sql, params = []) => db.prepare(sql).get(...params);

/**
 * Caché de lectura, con invalidación automática.
 *
 * `resumen()` y `leerAjustes()` se piden muchas veces por minuto: el
 * dashboard se refresca solo cada tanto, y encima el navegador lo vuelve a
 * pedir después de cada acción del asistente (crear un cliente, agregar un
 * renglón...) para que la pantalla quede al día enseguida. En una sesión de
 * voz armando una cotización renglón por renglón eso son varios pedidos por
 * minuto, cada uno recalculando media docena de sumas sobre toda la tabla de
 * cotizaciones.
 *
 * En vez de guardar el resultado a mano en cada función y acordarse de
 * borrarlo en cada lugar que escribe, se cuelga de `run()`: como *todas* las
 * escrituras de la aplicación pasan por ahí (insertar/actualizar/eliminar,
 * y hasta escribirAjuste), invalidar ahí es invalidar todo de una vez, sin
 * tener que enumerar cada mutación por separado ni arriesgarse a que una
 * nueva se quede afuera de la lista.
 *
 * El TTL es corto (segundos, no minutos) a propósito: la gracia no es dejar
 * de consultar la base, es absorber ráfagas de pedidos casi seguidos. Un
 * par de segundos de más en el dashboard no lo nota nadie; una cotización
 * que no se actualiza en un minuto sí.
 */
const TTL_CACHE_MS = 4000;
const cache = new Map();

function cachear(clave, calcular) {
  const entrada = cache.get(clave);
  const ahora = Date.now();
  if (entrada && entrada.expira > ahora) return entrada.valor;
  const valor = calcular();
  cache.set(clave, { valor, expira: ahora + TTL_CACHE_MS });
  return valor;
}

const RE_ESCRITURA = /^\s*(INSERT|UPDATE|DELETE)/i;

const run = (sql, params = []) => {
  const r = db.prepare(sql).run(...params);
  if (RE_ESCRITURA.test(sql)) cache.clear();
  return r;
};

export const hoy = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

/** Une el nombre del cliente a cualquier fila que tenga cliente_id. */
const SUMA_ABONOS = "COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.cotizacion_id = t.id), 0)";

const SUMA_STOCK = "COALESCE((SELECT SUM(m.cantidad) FROM movimientos_stock m WHERE m.producto_id = t.id), 0)";

const SUMA_ITEMS =
  "COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM cotizacion_items i WHERE i.cotizacion_id = t.id), 0)";

function selectConCliente(tabla) {
  // Un cliente se lee con la plata que mueve: cuánto se le cotizó en total,
  // cuánto abonó y cuánto falta. Es lo que uno quiere ver de un vistazo en la
  // lista, mucho más que el nombre de su empresa. Las rechazadas no cuentan:
  // no son plata, son ofertas que no prosperaron.
  if (tabla === 'clientes') {
    return `SELECT t.*,
              COALESCE((SELECT SUM(q.monto) FROM cotizaciones q
                         WHERE q.cliente_id = t.id AND q.estado <> 'rechazada'), 0) AS cotizado,
              COALESCE((SELECT SUM(a.monto) FROM abonos a
                          JOIN cotizaciones q ON q.id = a.cotizacion_id
                         WHERE q.cliente_id = t.id AND q.estado <> 'rechazada'), 0) AS abonado,
              COALESCE((SELECT SUM(q.monto) FROM cotizaciones q
                         WHERE q.cliente_id = t.id AND q.estado <> 'rechazada'), 0)
              - COALESCE((SELECT SUM(a.monto) FROM abonos a
                            JOIN cotizaciones q ON q.id = a.cotizacion_id
                           WHERE q.cliente_id = t.id AND q.estado <> 'rechazada'), 0) AS saldo,
              (SELECT COUNT(*) FROM cotizaciones q WHERE q.cliente_id = t.id) AS n_cotizaciones,
              -- Distinto del saldo de arriba: ahí es lo que falta de TODAS las
              -- cotizaciones en negociación, aprobadas o no. Esto es lo que el
              -- cliente ya se comprometió a pagar —los cobros sueltos, más el
              -- saldo de sus cotizaciones APROBADAS—, igual que en Cobros. No
              -- se duplica: una vez aprobada, esa plata sale de "saldo" en el
              -- sentido de "todavía en negociación" y entra acá.
              COALESCE((SELECT SUM(k.monto) FROM cobros k
                         WHERE k.cliente_id = t.id AND k.estado = 'pendiente'), 0)
              + COALESCE((SELECT SUM(q.monto - (SELECT COALESCE(SUM(a.monto), 0) FROM abonos a WHERE a.cotizacion_id = q.id))
                           FROM cotizaciones q
                          WHERE q.cliente_id = t.id AND q.estado = 'aprobada'
                            AND q.monto > (SELECT COALESCE(SUM(a.monto), 0) FROM abonos a WHERE a.cotizacion_id = q.id)), 0)
              AS por_cobrar
            FROM clientes t`;
  }
  if (tabla === 'productos') return `SELECT t.*, ${SUMA_STOCK} AS stock FROM productos t`;
  if (tabla === 'movimientos_stock') {
    return `SELECT t.*, p.descripcion AS producto, p.referencia AS referencia
            FROM movimientos_stock t LEFT JOIN productos p ON p.id = t.producto_id`;
  }

  // Una cotización siempre se lee con lo abonado, lo que falta y el desglose
  // de sus renglones. `monto` es el total final y se recalcula al tocar los
  // ítems (ver recalcularCotizacion), así que sirve de fuente única para el
  // saldo tanto si la cotización se armó con ítems como si se puso a mano.
  if (tabla === 'cotizaciones') {
    return `SELECT t.*, c.nombre AS cliente,
                   ${SUMA_ABONOS} AS abonado,
                   t.monto - ${SUMA_ABONOS} AS saldo,
                   ${SUMA_ITEMS} AS subtotal,
                   (SELECT COUNT(*) FROM cotizacion_items i WHERE i.cotizacion_id = t.id) AS n_items
            FROM cotizaciones t LEFT JOIN clientes c ON c.id = t.cliente_id`;
  }

  if (tabla === 'cotizacion_items') {
    return `SELECT t.*, t.cantidad * t.precio_unitario AS total
            FROM cotizacion_items t`;
  }

  // Un abono cuelga de la cotización, y el cliente se hereda de ella.
  if (tabla === 'abonos') {
    return `SELECT t.*, q.titulo AS cotizacion, q.moneda AS moneda, c.nombre AS cliente
            FROM abonos t
            LEFT JOIN cotizaciones q ON q.id = t.cotizacion_id
            LEFT JOIN clientes c ON c.id = q.cliente_id`;
  }

  return `SELECT t.*, c.nombre AS cliente
          FROM ${tabla} t LEFT JOIN clientes c ON c.id = t.cliente_id`;
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export function crearCliente(datos) {
  const { nombre, empresa, telefono, email, direccion, notas } = datos;
  const r = run(
    `INSERT INTO clientes (nombre, empresa, telefono, email, direccion, notas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nombre, empresa ?? null, telefono ?? null, email ?? null, direccion ?? null, notas ?? null],
  );
  return obtenerCliente(Number(r.lastInsertRowid));
}

export const obtenerCliente = (id) => one('SELECT * FROM clientes WHERE id = ?', [id]);

export const listarClientes = () =>
  all('SELECT * FROM clientes ORDER BY nombre COLLATE NOCASE ASC');

/** Índice mínimo (id + nombre) que se le pasa al modelo. Muy pocos tokens. */
export const indiceClientes = (limite = 60) =>
  all(
    `SELECT id, nombre, empresa FROM clientes
     ORDER BY id DESC LIMIT ?`,
    [limite],
  );

/**
 * Resuelve un cliente a partir de texto libre ("Ferretería El Tornillo",
 * "don Pedro", "3"). Devuelve { id } o { error, sugerencias }.
 */
export function resolverCliente(texto, { crearSiNoExiste = false } = {}) {
  if (texto === null || texto === undefined || texto === '') return { id: null };

  if (typeof texto === 'number' || /^\d+$/.test(String(texto).trim())) {
    const c = obtenerCliente(Number(texto));
    if (c) return { id: c.id, cliente: c };
  }

  const q = String(texto).trim();
  const exacto = one(
    `SELECT * FROM clientes WHERE nombre = ? COLLATE NOCASE
      OR empresa = ? COLLATE NOCASE LIMIT 1`,
    [q, q],
  );
  if (exacto) return { id: exacto.id, cliente: exacto };

  const parecidos = all(
    `SELECT * FROM clientes
      WHERE nombre LIKE ? COLLATE NOCASE OR empresa LIKE ? COLLATE NOCASE
      LIMIT 5`,
    [`%${q}%`, `%${q}%`],
  );
  if (parecidos.length === 1) return { id: parecidos[0].id, cliente: parecidos[0] };
  if (parecidos.length > 1) {
    return {
      error: `Hay varios clientes que coinciden con "${q}".`,
      sugerencias: parecidos.map((c) => c.nombre),
    };
  }

  if (crearSiNoExiste) {
    const nuevo = crearCliente({ nombre: q });
    return { id: nuevo.id, cliente: nuevo, creado: true };
  }
  return { error: `No existe ningún cliente llamado "${q}".`, sugerencias: [] };
}

/**
 * Encuentra una cotización a partir de un id, o de un texto y opcionalmente un
 * cliente ("la del sistema POS"). Devuelve { id } o { error, sugerencias }.
 *
 * `soloConSaldo` distingue las dos formas de adivinar "la cotización de ese
 * cliente" cuando no se nombra ninguna: al registrar un abono interesan las
 * que tienen plata pendiente, pero al armar una cotización interesa la que se
 * está trabajando, que suele valer cero todavía porque no tiene renglones.
 */
export function resolverCotizacion(texto, clienteId = null, { soloConSaldo = true } = {}) {
  const cond = clienteId ? 'AND t.cliente_id = ?' : '';
  const extra = clienteId ? [clienteId] : [];

  if (typeof texto === 'number' || /^\d+$/.test(String(texto ?? '').trim())) {
    const c = one(`${selectConCliente('cotizaciones')} WHERE t.id = ?`, [Number(texto)]);
    if (c) return { id: c.id, cotizacion: c };
  }

  const q = String(texto ?? '').trim();

  // Sin texto pero con cliente: si tiene una sola cotización abierta, es esa.
  if (!q && clienteId) {
    const filtro = soloConSaldo
      ? `t.monto > ${SUMA_ABONOS}`
      : "t.estado = 'pendiente'";
    const abiertas = all(
      `${selectConCliente('cotizaciones')} WHERE t.cliente_id = ? AND ${filtro}
       ORDER BY t.id DESC`,
      [clienteId],
    );
    if (abiertas.length === 1) return { id: abiertas[0].id, cotizacion: abiertas[0] };
    if (abiertas.length > 1) {
      return {
        error: soloConSaldo
          ? 'Ese cliente tiene varias cotizaciones con saldo.'
          : 'Ese cliente tiene varias cotizaciones abiertas.',
        sugerencias: abiertas.map((c) => `#${c.id} ${c.titulo}`),
      };
    }
    // Ninguna abierta, pero puede tener otras. Decir cuáles y en qué estado
    // evita que se termine creando una cotización nueva sin que nadie la haya
    // pedido, que es peor que quedarse sin hacer nada.
    const otras = all(
      `${selectConCliente('cotizaciones')} WHERE t.cliente_id = ? ORDER BY t.id DESC LIMIT 5`,
      [clienteId],
    );
    return {
      error: otras.length
        ? (soloConSaldo
          ? 'Ese cliente no tiene cotizaciones con saldo pendiente.'
          : 'Ese cliente no tiene ninguna cotización abierta; las que tiene ya están cerradas.')
        : 'Ese cliente todavía no tiene ninguna cotización.',
      sugerencias: otras.map((c) => `#${c.id} ${c.titulo} (${c.estado})`),
    };
  }

  const parecidas = all(
    `${selectConCliente('cotizaciones')} WHERE t.titulo LIKE ? COLLATE NOCASE ${cond}
     ORDER BY t.id DESC LIMIT 5`,
    [`%${q}%`, ...extra],
  );
  if (parecidas.length === 1) return { id: parecidas[0].id, cotizacion: parecidas[0] };
  if (parecidas.length > 1) {
    return {
      error: `Hay varias cotizaciones que coinciden con "${q}".`,
      sugerencias: parecidas.map((c) => `#${c.id} ${c.titulo} (${c.cliente ?? 'sin cliente'})`),
    };
  }
  return { error: `No encontré ninguna cotización que coincida con "${q}".`, sugerencias: [] };
}

/**
 * Encuentra un producto del catálogo por id, referencia o descripción.
 * Devuelve { id, producto } o { error, sugerencias }.
 */
/* ------------------------------------------------------------------ */
/* Encontrar un producto por como uno lo nombra                        */
/* ------------------------------------------------------------------ */

/**
 * Nadie dicta una referencia como está escrita en la lista de precios.
 *
 * Uno dice «un interruptor zeta uno» y en el catálogo figura CLICK Z1; dice
 * «una pantalla de cuatro pulgadas» y figura CLICK DP4 con la medida metida
 * en la descripción. Antes se buscaba la frase entera como un solo pedazo de
 * texto —`LIKE '%interruptor z uno%'`—, así que no encontraba nada nunca y
 * había que saberse la referencia de memoria y pronunciarla clavada.
 *
 * Acá se parte la frase en palabras y se busca cada una por su cuenta, con
 * tres arreglos que son los que hacen la diferencia dictando:
 *
 * 1. Los números dichos se pasan a cifra: «zeta uno» → «z 1».
 * 2. Se compara también todo pegado y sin signos: «z 1» → «z1», que sí está
 *    adentro de «CLICKZ1». Es lo que hace que valga decir la referencia
 *    entera, a pedazos, o sólo la parte que uno recuerda.
 * 3. Se perdona una letra de diferencia en palabras largas, porque el dictado
 *    escribe «clic» donde dice CLICK, o «zigbi» donde dice Zigbee.
 *
 * Lo que coincide en la REFERENCIA pesa mucho más que lo que coincide en la
 * descripción: quien dice «z1» está nombrando el producto, no describiéndolo.
 */
const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizar = (s) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pegar = (s) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// El dictado escribe los números con letras. También «zeta», que es como se
// pronuncia la Z de las referencias.
// Ojo con «un» y «una»: no están acá a propósito. Son artículos mucho más
// seguido que números —«una pantalla» son ganas de una pantalla, no de la
// pantalla 1— y traducirlos metía un 1 en la búsqueda que después hacía juego
// con la DP10 y tapaba a la DP4. Se filtran como palabra vacía más abajo.
// «uno» sí queda: eso se dice nombrando, «canal uno», «zeta uno».
const DICHO_A_CIFRA = {
  cero: '0', uno: '1',
  dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7',
  ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', trece: '13',
  catorce: '14', quince: '15', dieciseis: '16', diecisiete: '17',
  dieciocho: '18', diecinueve: '19', veinte: '20', treinta: '30',
};
// Nombres de letra que no son además otra palabra. «ese» y «ele» quedan
// afuera aposta: son el demostrativo y el artículo mucho más seguido que la S
// y la L, y no hay cómo distinguirlos sin adivinar. Igual el dictado suele
// escribir «S» derecho cuando uno deletrea.
const LETRA_DICHA = { zeta: 'z', equis: 'x', hache: 'h' };

// Palabras que no distinguen un producto de otro: si se dejaran, «de» haría
// juego con medio catálogo y arruinaría el conteo.
const PALABRA_VACIA = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo',
  'con', 'para', 'por', 'y', 'o', 'en', 'al', 'a', 'que', 'me', 'le', 'su',
  'sus', 'mas', 'este', 'esta', 'ese', 'esa', 'esos', 'esas', 'referencia',
  'producto', 'articulo', 'item', 'ponele', 'agregale', 'agrega', 'sumale',
]);

/** Distancia de edición, cortada en 1: alcanza para «clic» contra «click». */
function difiereEnUna(a, b) {
  if (a === b) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  if (larga.length - corta.length > 1) return false;
  let i = 0;
  let j = 0;
  let fallos = 0;
  while (i < corta.length && j < larga.length) {
    if (corta[i] === larga[j]) { i += 1; j += 1; continue; }
    fallos += 1;
    if (fallos > 1) return false;
    if (corta.length === larga.length) { i += 1; j += 1; } else { j += 1; }
  }
  return fallos + (larga.length - j) + (corta.length - i) <= 1;
}

/** Parte lo que dijo el usuario en palabras buscables. */
function palabrasDeConsulta(texto) {
  return normalizar(texto)
    .split(' ')
    // Las vacías se van ANTES de traducir números: si no, «una» se volvía un
    // 1 y ya no había forma de reconocerla como el artículo que era.
    .filter((p) => p && !PALABRA_VACIA.has(p))
    .map((p) => DICHO_A_CIFRA[p] ?? LETRA_DICHA[p] ?? p);
}

/**
 * Ordena el catálogo por qué tan bien encaja con lo que dijo el usuario.
 * Devuelve `{ producto, puntos }`, de mejor a peor, sin los que no llegan.
 */
export function buscarProductos(texto, { limite = 5, incluir_inactivos = false } = {}) {
  const palabras = palabrasDeConsulta(texto);
  if (!palabras.length) return [];
  const consultaPegada = palabras.join('');

  const catalogo = consultar('productos', { limite: 5000, incluir_inactivos });

  const puntuados = catalogo.map((p) => {
    const refPegada = pegar(p.referencia);
    const resto = normalizar([p.descripcion, p.categoria, p.marca, p.tipo, p.unidad].filter(Boolean).join(' '));
    const restoPegado = pegar(resto);
    const palabrasResto = resto.split(' ').filter(Boolean);

    let puntos = 0;
    // La referencia clavada, dicha como sea: «click z1», «clic zeta uno».
    if (refPegada && refPegada === consultaPegada) puntos += 1000;
    // O una parte de ella, que es lo normal: «z1» adentro de «clickz1».
    else if (refPegada && consultaPegada.length >= 2 && refPegada.includes(consultaPegada)) puntos += 400;

    let acertadas = 0;
    for (const palabra of palabras) {
      const pegada = pegar(palabra);
      if (refPegada && pegada && refPegada.includes(pegada)) { puntos += 60; acertadas += 1; continue; }
      if (palabrasResto.includes(palabra)) { puntos += 20; acertadas += 1; continue; }
      if (restoPegado && pegada && restoPegado.includes(pegada)) { puntos += 10; acertadas += 1; continue; }
      // Último intento: el dictado escribió casi bien una palabra larga.
      if (palabra.length >= 4 && palabrasResto.some((w) => w.length >= 4 && difiereEnUna(w, palabra))) {
        puntos += 12; acertadas += 1;
      }
    }

    // Que aparezca UNA palabra de cinco no dice nada. Se exige que la mayor
    // parte de lo dicho aparezca en el producto, si no sale cualquier cosa.
    const cobertura = acertadas / palabras.length;
    if (cobertura < 0.6) return { producto: p, puntos: 0 };
    if (acertadas === palabras.length) puntos += 50;

    return { producto: p, puntos };
  });

  return puntuados
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos
      || String(a.producto.referencia ?? '').localeCompare(String(b.producto.referencia ?? '')))
    .slice(0, limite);
}

const comoSeLlama = (p) => `#${p.id} ${p.referencia ? `${p.referencia} ` : ''}${p.descripcion}`;

export function resolverProducto(texto) {
  if (typeof texto === 'number' || /^\d+$/.test(String(texto ?? '').trim())) {
    const p = obtenerPorId('productos', Number(texto));
    if (p) return { id: p.id, producto: p };
  }

  const q = String(texto ?? '').trim();
  if (!q) return { error: 'No dijiste qué producto.', sugerencias: [] };

  const encontrados = buscarProductos(q);
  if (!encontrados.length) {
    return { error: `No encontré ningún producto que coincida con "${q}".`, sugerencias: [] };
  }

  const [mejor, segundo] = encontrados;
  // Se elige solo cuando hay un ganador claro: o es el único, o le saca
  // bastante al que sigue. Si están parejos conviene preguntar, porque meter
  // el renglón equivocado en una cotización cuesta más que una repregunta.
  const gananciaClara = !segundo || mejor.puntos - segundo.puntos >= 100;
  if (gananciaClara) return { id: mejor.producto.id, producto: mejor.producto };

  return {
    error: `Hay varios productos que coinciden con "${q}".`,
    sugerencias: encontrados.map((x) => comoSeLlama(x.producto)),
  };
}

/* ------------------------------------------------------------------ */
/* Inserciones genéricas                                               */
/* ------------------------------------------------------------------ */

export function insertar(tabla, entrada) {
  const datos = soloColumnas(tabla, entrada);
  const campos = Object.keys(datos);
  if (!campos.length) throw new Error('No recibí ningún dato para guardar.');
  const marcas = campos.map(() => '?').join(', ');
  const r = run(
    `INSERT INTO ${tabla} (${campos.join(', ')}) VALUES (${marcas})`,
    campos.map((k) => datos[k]),
  );
  return obtenerPorId(tabla, Number(r.lastInsertRowid));
}

export function obtenerPorId(tabla, id) {
  return one(`${selectConCliente(tabla)} WHERE ${tabla === 'clientes' ? '' : 't.'}id = ?`, [id]);
}

export function actualizar(tabla, id, entrada) {
  const datos = soloColumnas(tabla, entrada);
  const campos = Object.keys(datos);
  if (!campos.length) return obtenerPorId(tabla, id);
  run(
    `UPDATE ${tabla} SET ${campos.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...campos.map((k) => datos[k]), id],
  );
  return obtenerPorId(tabla, id);
}

export function eliminar(tabla, id) {
  const r = run(`DELETE FROM ${tabla} WHERE id = ?`, [id]);
  return r.changes > 0;
}

/* ------------------------------------------------------------------ */
/* Catálogo de productos                                               */
/* ------------------------------------------------------------------ */

export const categoriasProductos = () =>
  all("SELECT DISTINCT categoria FROM productos WHERE categoria IS NOT NULL AND categoria <> '' ORDER BY categoria COLLATE NOCASE");

/**
 * Todos los productos que tienen foto, incluidos los descontinuados y sin el
 * tope de 100 de `consultar`: el gestor de fotos necesita verlas todas para
 * poder achicar las que quedaron pesadas.
 */
/**
 * Etiqueta con su categoría a los productos que todavía no tienen tipo.
 *
 * Los que ya estaban cargados no se etiquetan solos: el tipo se aplica cuando
 * se vuelve a importar la hoja. Pero al importar, la categoría se llena con el
 * nombre de la pestaña, así que ese nombre ya está guardado en cada producto y
 * alcanza con copiarlo. Así el catálogo entero queda agrupado sin tener que
 * volver a subir nada.
 *
 * Sólo toca los que están sin tipo: uno puesto a mano no se pisa.
 */
export function etiquetarTipoDesdeCategoria() {
  const r = run(`UPDATE productos SET tipo = categoria
                  WHERE (tipo IS NULL OR tipo = '')
                    AND categoria IS NOT NULL AND categoria <> ''`);
  return r.changes;
}

/** Cuántos productos activos siguen sin tipo, y cuántos se podrían etiquetar. */
export const productosSinTipo = () => one(`
  SELECT COUNT(*) AS n,
         COALESCE(SUM(CASE WHEN categoria IS NOT NULL AND categoria <> '' THEN 1 ELSE 0 END), 0) AS conCategoria
    FROM productos WHERE activo = 1 AND (tipo IS NULL OR tipo = '')`);

/** Los tipos que ya se usaron, para ofrecerlos en vez de reescribirlos. */
export const tiposProductos = () =>
  all(`SELECT tipo, COUNT(*) AS n FROM productos
        WHERE tipo IS NOT NULL AND tipo <> '' AND activo = 1
        GROUP BY tipo ORDER BY n DESC, tipo COLLATE NOCASE`);

export const productosConFoto = () =>
  all("SELECT id, descripcion, foto FROM productos WHERE foto IS NOT NULL AND foto <> '' ORDER BY id");

const numeroOn = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Clave con la que se reconoce un producto entre una lista y la siguiente. */
const claveDe = (f) => {
  const ref = String(f.referencia ?? '').trim().toLowerCase();
  if (ref) return `r:${ref}`;
  // Sin referencia sólo queda la descripción, que es peor clave pero es lo que hay.
  return `d:${String(f.descripcion ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
};

/** Campos que manda la lista del proveedor. Lo demás es del usuario. */
const CAMPOS_DE_LISTA = ['descripcion', 'marca', 'unidad', 'precio_canal', 'precio_constructor', 'precio_cliente', 'proveedor'];

/**
 * Cruza una lista de precios contra lo que ya hay en esa categoría y decide
 * qué es nuevo, qué cambió y qué dejó de venir.
 *
 * El problema que resuelve: la primera versión borraba la categoría entera y
 * la volvía a crear. Eso actualizaba los precios, sí, pero se llevaba por
 * delante las fotos, las notas y —lo más grave— el inventario, porque los
 * movimientos de stock cuelgan del producto y se iban con él. Actualizar una
 * lista de precios no puede costar el inventario de la bodega.
 *
 * Ahora los productos se reconocen por su referencia (o por su descripción si
 * no tienen), y de los que ya existen sólo se pisan los campos que manda el
 * proveedor. Foto, notas, inventario y la marca de "producto propio" quedan
 * como estaban.
 *
 * @param {object} opciones
 *   - manejaInventario: la tanda es de productos propios, con existencias.
 *   - descontinuarAusentes: los que ya no vienen en la lista se marcan como
 *     inactivos (no se borran: pueden estar en cotizaciones viejas).
 *   - simular: no escribe nada, sólo devuelve el informe. Sirve para mostrar
 *     qué va a pasar ANTES de tocar el catálogo.
 */
export function conciliarProductos(categoria, filas, opciones = {}) {
  const { manejaInventario = false, descontinuarAusentes = false, simular = false } = opciones;
  // El tipo sale de la pestaña del Excel: cada pestaña es un grupo de
  // productos —los displays, los switch EU, los switch US— y ese nombre es
  // justo la etiqueta con la que después se filtra el catálogo. Se aplica a
  // todos los de la hoja, existan ya o no, que es lo que hace que una sola
  // importación deje el catálogo entero etiquetado.
  const tipo = opciones.tipo != null && String(opciones.tipo).trim()
    ? String(opciones.tipo).trim() : null;

  const existentes = all(
    `${selectConCliente('productos')} WHERE t.categoria IS ? OR (t.categoria = ?)`,
    [categoria ?? null, categoria ?? ''],
  );
  const porClave = new Map(existentes.map((p) => [claveDe(p), p]));
  const vistas = new Set();

  const informe = {
    nuevos: [], actualizados: [], sinCambios: [], ausentes: [], ajustesStock: [], duplicadosEnArchivo: 0,
    // De qué fila del Excel salió cada producto, para poder pegarle la foto
    // que estaba anclada ahí. Se llena para todos, hayan cambiado o no.
    paraFoto: [],
  };

  for (const f of filas) {
    const descripcion = String(f.descripcion ?? '').trim();
    if (!descripcion) continue;

    const clave = claveDe({ ...f, descripcion });
    if (vistas.has(clave)) { informe.duplicadosEnArchivo += 1; continue; }
    vistas.add(clave);

    const existente = porClave.get(clave);

    // Lo que trae la lista, ya normalizado. Un campo vacío en el Excel no
    // borra lo que el usuario tenga cargado a mano: simplemente no se toca.
    const entrantes = {
      descripcion,
      marca: f.marca != null && String(f.marca).trim() ? String(f.marca).trim() : null,
      unidad: f.unidad != null && String(f.unidad).trim() ? String(f.unidad).trim() : null,
      proveedor: f.proveedor != null && String(f.proveedor).trim() ? String(f.proveedor).trim() : null,
      precio_canal: numeroOn(f.precio_canal),
      precio_constructor: numeroOn(f.precio_constructor),
      precio_cliente: numeroOn(f.precio_cliente),
    };
    const referencia = f.referencia != null && String(f.referencia).trim()
      ? String(f.referencia).trim() : null;

    if (!existente) {
      const nuevo = {
        categoria: categoria ?? null,
        tipo,
        referencia,
        descripcion,
        marca: entrantes.marca,
        unidad: entrantes.unidad || 'UND',
        precio_canal: entrantes.precio_canal,
        precio_constructor: entrantes.precio_constructor,
        precio_cliente: entrantes.precio_cliente ?? 0,
        proveedor: entrantes.proveedor,
        maneja_inventario: manejaInventario ? 1 : 0,
      };
      // `fila` es de dónde salió en el Excel: sirve para pegarle después la
      // foto que estaba anclada a esa misma fila.
      const registro = { referencia, descripcion, precio: nuevo.precio_cliente, fila: f.fila ?? null, id: null };
      informe.nuevos.push(registro);

      if (!simular) {
        const creado = insertar('productos', nuevo);
        registro.id = creado.id;
        informe.paraFoto.push({ id: creado.id, fila: f.fila ?? null, tieneFoto: false });
        if (manejaInventario && Number(f.stock) > 0) {
          insertar('movimientos_stock', {
            producto_id: creado.id, cantidad: Number(f.stock), motivo: 'Importación de lista de precios',
          });
        }
      }
      continue;
    }

    if (!simular) {
      informe.paraFoto.push({ id: existente.id, fila: f.fila ?? null, tieneFoto: Boolean(existente.foto) });
    }

    // Ya existe: sólo se cambian los campos que la lista realmente trae.
    const cambios = {};
    for (const campo of CAMPOS_DE_LISTA) {
      const nuevo = entrantes[campo];
      if (nuevo === null || nuevo === undefined) continue;
      if (String(existente[campo] ?? '') !== String(nuevo)) cambios[campo] = nuevo;
    }
    if (referencia && String(existente.referencia ?? '') !== referencia) cambios.referencia = referencia;
    if (manejaInventario && !existente.maneja_inventario) cambios.maneja_inventario = 1;
    // Etiquetar con el nombre de la pestaña también a los que ya estaban: la
    // gracia es que una sola importación deje todo el grupo marcado.
    if (tipo && String(existente.tipo ?? '') !== tipo) cambios.tipo = tipo;
    // Si estaba descontinuado y volvió a aparecer en la lista, revive.
    if (!existente.activo) cambios.activo = 1;

    // Una columna de stock en una lista que se re-sube significa "hoy hay
    // esto": se registra la diferencia como movimiento, para que quede
    // rastro de por qué cambió y se pueda deshacer.
    const stockEnLista = f.stock === null || f.stock === undefined || f.stock === '' ? null : Number(f.stock);
    const manejará = manejaInventario || existente.maneja_inventario;
    const diferencia = stockEnLista !== null && manejará ? stockEnLista - Number(existente.stock ?? 0) : 0;

    if (Object.keys(cambios).length || diferencia) {
      informe.actualizados.push({
        id: existente.id,
        referencia: existente.referencia,
        descripcion: existente.descripcion,
        precioAntes: existente.precio_cliente,
        precioDespues: cambios.precio_cliente ?? existente.precio_cliente,
        campos: Object.keys(cambios),
      });
      if (diferencia) {
        informe.ajustesStock.push({
          referencia: existente.referencia, descripcion: existente.descripcion,
          de: Number(existente.stock ?? 0), a: stockEnLista,
        });
      }
      if (!simular) {
        if (Object.keys(cambios).length) actualizar('productos', existente.id, cambios);
        if (diferencia) {
          insertar('movimientos_stock', {
            producto_id: existente.id, cantidad: diferencia,
            motivo: 'Ajuste por lista de precios',
          });
        }
      }
    } else {
      informe.sinCambios.push({ referencia: existente.referencia, descripcion: existente.descripcion });
    }
  }

  // Los que estaban y ya no vienen. Nunca se borran: pueden estar citados en
  // cotizaciones viejas y tener inventario.
  for (const p of existentes) {
    if (vistas.has(claveDe(p))) continue;
    informe.ausentes.push({ id: p.id, referencia: p.referencia, descripcion: p.descripcion, stock: p.stock });
    if (descontinuarAusentes && !simular && p.activo) {
      actualizar('productos', p.id, { activo: 0 });
    }
  }

  return informe;
}

/* ------------------------------------------------------------------ */
/* Ajustes de la empresa (lo que encabeza y cierra las cotizaciones)   */
/* ------------------------------------------------------------------ */

const AJUSTES_POR_DEFECTO = {
  empresa: 'Click Control',
  // Dirección del logo que encabeza las cotizaciones, subido desde ⚙ Ajustes.
  logo: '',
  nit: '',
  direccion: '',
  telefono: '',
  email: '',
  ciudad: 'Bogotá',
  representante: '',
  representante_telefono: '',
  representante_email: '',
  validez: '8 días',
  // Listas de precios que viven en línea, en JSON. Se editan en su hoja y el
  // sistema las va a buscar; acá sólo queda la dirección y cómo leerlas.
  listas: '[]',
  condiciones: [
    'Tiempo de entrega: según cronograma de obra.',
    'Garantía: 1 año.',
    'Forma de pago: a convenir.',
  ].join('\n'),
};

export function leerAjustes() {
  return cachear('ajustes', () => {
    const filas = all('SELECT clave, valor FROM ajustes');
    const guardados = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    return { ...AJUSTES_POR_DEFECTO, ...guardados };
  });
}

export function guardarAjustes(datos = {}) {
  for (const [clave, valor] of Object.entries(datos)) {
    if (clave in AJUSTES_POR_DEFECTO) escribirAjuste(clave, valor);
  }
  return leerAjustes();
}

/* ---- Listas de precios en línea ---------------------------------- */

/** Las listas configuradas, ya como objetos. */
export function leerListas() {
  try {
    const v = JSON.parse(leerAjustes().listas);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function guardarListas(listas) {
  escribirAjuste('listas', JSON.stringify(listas));
  return leerListas();
}

/** Agrega una lista y devuelve la que quedó guardada. */
export function agregarLista(datos) {
  const listas = leerListas();
  const lista = {
    id: Math.max(0, ...listas.map((l) => Number(l.id) || 0)) + 1,
    nombre: String(datos.nombre || datos.categoria || 'Lista').trim(),
    url: String(datos.url || '').trim(),
    categoria: String(datos.categoria || '').trim() || null,
    tipo: String(datos.tipo || '').trim() || null,
    hoja: Number(datos.hoja) || 0,
    manejaInventario: Boolean(datos.manejaInventario),
    descontinuarAusentes: Boolean(datos.descontinuarAusentes),
    mapeo: datos.mapeo ?? null,
    ultima: null,
    ultimoInforme: null,
  };
  guardarListas([...listas, lista]);
  return lista;
}

export function actualizarLista(id, cambios) {
  const listas = leerListas();
  const i = listas.findIndex((l) => Number(l.id) === Number(id));
  if (i < 0) return null;
  listas[i] = { ...listas[i], ...cambios, id: listas[i].id };
  guardarListas(listas);
  return listas[i];
}

export function eliminarLista(id) {
  const listas = leerListas();
  const quedan = listas.filter((l) => Number(l.id) !== Number(id));
  if (quedan.length === listas.length) return false;
  guardarListas(quedan);
  return true;
}

const escribirAjuste = (clave, valor) =>
  run(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    [clave, valor == null ? '' : String(valor)],
  );

/* ------------------------------------------------------------------ */
/* Cotización en curso                                                 */
/* ------------------------------------------------------------------ */

// Armar una cotización dictándola es un ida y vuelta largo: "agregá dos
// interruptores", "ahora tres de tres canales", "sumale la mano de obra". Sin
// memoria habría que nombrar al cliente en cada frase. Se guarda cuál es la
// cotización en curso para que el asistente sepa a dónde va cada renglón, y
// se guarda en la base (no en el navegador) para poder empezarla en el
// celular recorriendo la casa y terminarla en el computador.

const CLAVE_ACTIVA = 'cotizacion_activa';

export function activarCotizacion(id) {
  escribirAjuste(CLAVE_ACTIVA, String(id));
  return obtenerPorId('cotizaciones', id);
}

export function cerrarCotizacionActiva() {
  escribirAjuste(CLAVE_ACTIVA, '');
}

/** La cotización en curso, o null. Si la borraron, se olvida sola. */
export function cotizacionActiva() {
  const fila = one('SELECT valor FROM ajustes WHERE clave = ?', [CLAVE_ACTIVA]);
  const id = Number(fila?.valor);
  if (!id) return null;
  const cot = obtenerPorId('cotizaciones', id);
  if (!cot) {
    cerrarCotizacionActiva();
    return null;
  }
  return cot;
}

/* ------------------------------------------------------------------ */
/* Renglones de una cotización                                         */
/* ------------------------------------------------------------------ */

/** Los tres precios del catálogo, según con cuál se esté cotizando. */
export function precioSegunNivel(producto, nivel = 'cliente') {
  const p = {
    canal: producto.precio_canal,
    constructor: producto.precio_constructor,
    cliente: producto.precio_cliente,
  }[nivel];
  // Si ese nivel viene vacío en la lista del proveedor, se cae al de cliente.
  return Number(p ?? producto.precio_cliente) || 0;
}

/**
 * Cambia con qué lista de precios está armada una cotización, y vuelve a
 * ponerle precio a los renglones que ya tenía.
 *
 * Antes el nivel sólo mandaba sobre los renglones NUEVOS: se cambiaba a
 * "constructor", se apretaba aplicar, y la cotización seguía valiendo lo
 * mismo. Servía para empezar una oferta, no para pasarla de un cliente final
 * a un constructor, que es justo cuando uno lo necesita.
 *
 * Lo que se tocó a mano no se pisa: si a un renglón se le escribió el precio
 * —por voz o a mano— ya no vale el de la lista, y volver a ponérselo sería
 * borrar una decisión sin avisar. Eso se sabe por la marca `precio_manual`,
 * que se pone al escribir el precio, y NO comparando contra lo que decía el
 * catálogo. Compararlo era lo que hacía antes y estaba mal: al reimportar una
 * lista de precios los renglones viejos quedan legítimamente desalineados del
 * catálogo, así que TODOS parecían tocados a mano y no se cambiaba ninguno.
 * Los que se dejan quietos se devuelven para poder decirlo, no para esconderlo.
 *
 * Los renglones libres ("Mano de obra", "Obra civil") tampoco cambian: no
 * salieron del catálogo, así que no tienen precio de canal ni de constructor.
 *
 * @returns {{cotizacion: object, actualizados: number, respetados: Array}}
 */
export function cambiarNivelPrecio(id, nivel) {
  const cot = one('SELECT * FROM cotizaciones WHERE id = ?', [id]);
  if (!cot) throw new Error('Esa cotización no existe.');
  if (!['canal', 'constructor', 'cliente'].includes(nivel)) {
    throw new Error('El nivel de precio tiene que ser canal, constructor o cliente.');
  }

  const anterior = cot.nivel_precio || 'cliente';
  run('UPDATE cotizaciones SET nivel_precio = ? WHERE id = ?', [nivel, id]);

  let actualizados = 0;
  const respetados = [];

  if (nivel !== anterior) {
    for (const item of all('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?', [id])) {
      if (!item.producto_id) continue;                  // renglón libre
      const producto = one('SELECT * FROM productos WHERE id = ?', [item.producto_id]);
      if (!producto) continue;                          // ya no está en el catálogo

      if (item.precio_manual) {
        respetados.push({ descripcion: item.descripcion.split('\n')[0], precio: item.precio_unitario });
        continue;
      }

      // Con céntimos de por medio, comparar con === deja pasar diferencias que
      // no existen. Un peso de margen alcanza y sobra para plata colombiana.
      const nuevo = precioSegunNivel(producto, nivel);
      if (Math.abs(nuevo - Number(item.precio_unitario)) > 1) {
        run('UPDATE cotizacion_items SET precio_unitario = ? WHERE id = ?', [nuevo, item.id]);
        actualizados += 1;
      }
    }
  }

  recalcularCotizacion(id);
  return { cotizacion: obtenerPorId('cotizaciones', id), actualizados, respetados };
}

/**
 * Borra una cotización entera, con sus renglones y sus abonos.
 *
 * Hace falta poder deshacer: una oferta que se abrió por error, o que quedó
 * mal armada, no tenía forma de salir de la lista y quedaba estorbando para
 * siempre.
 *
 * Lo que no puede pasar es que se lleve el inventario por delante. Si estaba
 * aprobada, sus productos ya habían salido de bodega; al borrarla esa salida
 * deja de tener motivo, así que primero se deshace y las existencias vuelven.
 * Sin esto, la bodega quedaría descontada por una cotización que ya no existe
 * y nadie podría averiguar por qué.
 *
 * @returns {{borrada: boolean, abonos: number, devueltosAlInventario: number}}
 */
export function eliminarCotizacion(id) {
  const cot = obtenerPorId('cotizaciones', id);
  if (!cot) return { borrada: false, abonos: 0, devueltosAlInventario: 0 };

  const abonos = one('SELECT COUNT(*) n FROM abonos WHERE cotizacion_id = ?', [id]).n;
  const movimientos = one(
    'SELECT COUNT(*) n FROM movimientos_stock WHERE cotizacion_id = ?', [id],
  ).n;
  run('DELETE FROM movimientos_stock WHERE cotizacion_id = ?', [id]);

  // Los renglones y los abonos se van solos: cuelgan de la cotización con
  // ON DELETE CASCADE.
  run('DELETE FROM cotizaciones WHERE id = ?', [id]);
  cerrarSiEsLaActiva(id);
  return { borrada: true, abonos, devueltosAlInventario: movimientos };
}

/**
 * Todo lo que cuelga de un cliente, contado antes de borrarlo.
 *
 * Sirve para poder avisar de verdad qué se va a llevar por delante, con
 * números y no con un «¿seguro?» genérico. Borrar un cliente es de las pocas
 * cosas de acá que no tienen vuelta atrás.
 */
export function loQueCuelgaDelCliente(id) {
  const cuantos = (tabla) =>
    one(`SELECT COUNT(*) n FROM ${tabla} WHERE cliente_id = ?`, [id]).n;
  return {
    cotizaciones: cuantos('cotizaciones'),
    citas: cuantos('citas'),
    cobros: cuantos('cobros'),
    recordatorios: cuantos('recordatorios'),
    notas: cuantos('notas'),
    abonos: one(
      `SELECT COUNT(*) n FROM abonos a
        JOIN cotizaciones q ON q.id = a.cotizacion_id
       WHERE q.cliente_id = ?`, [id],
    ).n,
  };
}

/**
 * Borra un cliente y TODO lo suyo.
 *
 * Antes las cotizaciones, citas, cobros y recordatorios tenían el cliente en
 * `ON DELETE SET NULL`: borrar al cliente los dejaba a todos vivos y sin
 * dueño, apareciendo como «Sin cliente» en las listas y sumando a los totales
 * de la empresa. Nadie podía saber de quién habían sido, ni por qué estaban
 * ahí, y limpiarlos a mano era imposible.
 *
 * Las cotizaciones se borran una por una a propósito, con la misma función
 * que las borra sueltas: es la que devuelve a la bodega lo que había salido
 * por las aprobadas. Un DELETE en bloque se llevaría los renglones pero
 * dejaría el inventario descontado por ventas que ya no existen.
 */
export function eliminarClienteYLoSuyo(id) {
  const cliente = obtenerPorId('clientes', id);
  if (!cliente) return { borrado: false };

  const resumen = loQueCuelgaDelCliente(id);
  let devueltosAlInventario = 0;

  // Todo o nada: si algo falla a mitad de camino, un cliente a medio borrar
  // —sin cotizaciones pero todavía en la lista— sería peor que no haberlo
  // tocado. `node:sqlite` no trae envoltorio de transacciones, así que van
  // las tres órdenes a mano.
  db.exec('BEGIN');
  try {
    for (const { id: idCot } of all('SELECT id FROM cotizaciones WHERE cliente_id = ?', [id])) {
      devueltosAlInventario += eliminarCotizacion(idCot).devueltosAlInventario;
    }
    // Las notas ya caen solas (van con ON DELETE CASCADE); el resto no.
    run('DELETE FROM citas WHERE cliente_id = ?', [id]);
    run('DELETE FROM cobros WHERE cliente_id = ?', [id]);
    run('DELETE FROM recordatorios WHERE cliente_id = ?', [id]);
    run('DELETE FROM clientes WHERE id = ?', [id]);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { borrado: true, nombre: cliente.nombre, ...resumen, devueltosAlInventario };
}

/**
 * Saca de Clientes a los residentes que había creado el formulario web.
 *
 * Antes, cada agendamiento de la web daba de alta un cliente. Una torre de
 * cincuenta apartamentos dejaba cincuenta nombres con los que no se factura
 * nada, tapando a los clientes de verdad —que es la constructora, la que
 * tiene la cotización—. Eso ya no pasa, pero los que se crearon siguen ahí.
 *
 * Se borra sólo lo que con seguridad salió del formulario. Un cliente entra
 * en la lista únicamente si cumple TODO esto:
 *
 *   · tiene al menos una cita venida de la web (las que llevan `origen`);
 *   · no tiene NINGUNA cita cargada a mano —si la tiene, alguien lo trató
 *     como cliente de verdad y no se toca—;
 *   · no tiene cotizaciones, ni cobros, ni abonos, ni pendientes, ni notas.
 *
 * O sea: sólo los que no existirían si el formulario no los hubiera creado.
 * Sus datos no se pierden: el nombre, el teléfono y el correo del residente
 * ya viven dentro de la cita, que es donde sirven el día de la entrega.
 *
 * Con `simular` no borra nada y sólo devuelve a quiénes se llevaría, para
 * poder mostrarlo antes de preguntar.
 */
export function limpiarClientesDelFormulario({ simular = false } = {}) {
  if (!columnasReales('citas').has('origen')) return { candidatos: [], borrados: 0 };

  const candidatos = all(`
    SELECT c.id, c.nombre, c.email,
           (SELECT COUNT(*) FROM citas a WHERE a.cliente_id = c.id AND a.origen IS NOT NULL) AS citas_web
      FROM clientes c
     WHERE (SELECT COUNT(*) FROM citas a WHERE a.cliente_id = c.id AND a.origen IS NOT NULL) > 0
       AND (SELECT COUNT(*) FROM citas a WHERE a.cliente_id = c.id AND a.origen IS NULL) = 0
       AND (SELECT COUNT(*) FROM cotizaciones q WHERE q.cliente_id = c.id) = 0
       AND (SELECT COUNT(*) FROM cobros k WHERE k.cliente_id = c.id) = 0
       AND (SELECT COUNT(*) FROM recordatorios r WHERE r.cliente_id = c.id) = 0
       AND (SELECT COUNT(*) FROM notas n WHERE n.cliente_id = c.id) = 0
     ORDER BY c.nombre COLLATE NOCASE`);

  if (simular || !candidatos.length) return { candidatos, borrados: 0 };

  // Primero se despegan las citas y recién después se borra el cliente. Al
  // revés, el borrado en cascada se llevaría puestas las entregas, que es
  // justamente lo único que hay que conservar.
  db.exec('BEGIN');
  try {
    for (const c of candidatos) {
      run('UPDATE citas SET cliente_id = NULL WHERE cliente_id = ? AND origen IS NOT NULL', [c.id]);
      run('DELETE FROM clientes WHERE id = ?', [c.id]);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { candidatos, borrados: candidatos.length };
}

/** Si la que se borró era la que se estaba dictando, se deja de apuntar a ella. */
function cerrarSiEsLaActiva(id) {
  const fila = one('SELECT valor FROM ajustes WHERE clave = ?', [CLAVE_ACTIVA]);
  if (Number(fila?.valor) === Number(id)) cerrarCotizacionActiva();
}

/**
 * Vuelve a calcular el total de una cotización a partir de sus renglones y
 * guarda el resultado en `monto`.
 *
 * `monto` es un valor derivado, pero se guarda a propósito: es la columna que
 * ya usaban el saldo, los abonos y el dashboard, y también es lo único que
 * tienen las cotizaciones viejas cargadas a mano (sin ítems). Guardarlo
 * mantiene una sola fuente de verdad para todo eso; a cambio, hay que llamar
 * a esta función cada vez que cambia un renglón o un porcentaje — que es lo
 * que hacen las funciones de acá abajo, único camino que los modifica.
 */
export function recalcularCotizacion(id) {
  const cot = one('SELECT * FROM cotizaciones WHERE id = ?', [id]);
  if (!cot) return null;

  const n = one('SELECT COUNT(*) n FROM cotizacion_items WHERE cotizacion_id = ?', [id]).n;
  // Sin renglones no se toca el monto: puede ser una cotización puesta a mano.
  if (!n) return obtenerPorId('cotizaciones', id);

  const subtotal = one(
    'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) s FROM cotizacion_items WHERE cotizacion_id = ?',
    [id],
  ).s;
  const conServicio = subtotal * (1 + (Number(cot.porcentaje_servicio) || 0) / 100);
  const total = conServicio * (1 + (Number(cot.porcentaje_iva) || 0) / 100);

  run('UPDATE cotizaciones SET monto = ? WHERE id = ?', [Math.round(total), id]);
  return obtenerPorId('cotizaciones', id);
}

/** Desglose para mostrar y para imprimir: subtotal, servicio, IVA y total. */
export function totalesCotizacion(id) {
  const cot = obtenerPorId('cotizaciones', id);
  if (!cot) return null;
  const subtotal = Number(cot.subtotal) || 0;
  const servicio = subtotal * (Number(cot.porcentaje_servicio) || 0) / 100;
  const iva = (subtotal + servicio) * (Number(cot.porcentaje_iva) || 0) / 100;
  return {
    subtotal,
    servicio,
    iva,
    total: cot.n_items ? subtotal + servicio + iva : Number(cot.monto) || 0,
  };
}

/**
 * Agrega un renglón. Si viene `producto_id`, copia sus datos del catálogo
 * (descripción, referencia, marca, unidad, foto y el precio del nivel que
 * use la cotización); si no, se toman los que se pasen sueltos, para
 * renglones libres como "Mano de obra" o "Obra civil".
 */
export function agregarItem(cotizacionId, datos = {}) {
  const cot = one('SELECT * FROM cotizaciones WHERE id = ?', [cotizacionId]);
  if (!cot) throw new Error('Esa cotización no existe.');

  let base = {};
  if (datos.producto_id) {
    const p = obtenerPorId('productos', Number(datos.producto_id));
    if (!p) throw new Error('Ese producto no está en el catálogo.');
    base = {
      producto_id: p.id,
      descripcion: p.descripcion,
      referencia: p.referencia,
      marca: p.marca,
      unidad: p.unidad,
      foto: p.foto,
      seccion: p.categoria,
      precio_unitario: precioSegunNivel(p, cot.nivel_precio),
    };
  }

  const descripcion = String(datos.descripcion ?? base.descripcion ?? '').trim();
  if (!descripcion) throw new Error('El renglón necesita una descripción.');

  const cantidad = Number(datos.cantidad) > 0 ? Number(datos.cantidad) : 1;
  const precio = datos.precio_unitario !== undefined && datos.precio_unitario !== null
    ? Number(datos.precio_unitario)
    : (base.precio_unitario ?? 0);
  const seccion = datos.seccion ?? base.seccion ?? null;
  const area = datos.area ?? null;

  // Un producto del catálogo al que se le dicta otro precio al agregarlo ya
  // nace con el precio tocado a mano: cambiar de lista después no lo pisa.
  const precioDictado = base.producto_id
    && Math.abs(precio - Number(base.precio_unitario ?? 0)) > 1 ? 1 : 0;

  // Agregar dos veces el mismo producto suma la cantidad en vez de repetir el
  // renglón: "agregá dos cámaras… agregá dos cámaras más" son cuatro cámaras,
  // no dos renglones de dos. Se exige que coincidan también la sección, el
  // área y el precio, porque ahí sí son cosas distintas: las mismas cámaras
  // para la cocina van aparte, y un renglón al que ya se le tocó el precio no
  // puede tragarse unidades nuevas a ese precio sin que nadie lo pida.
  if (base.producto_id) {
    const igual = one(
      `SELECT * FROM cotizacion_items
        WHERE cotizacion_id = ? AND producto_id = ? AND precio_unitario = ?
          AND COALESCE(seccion,'') = COALESCE(?,'') AND COALESCE(area,'') = COALESCE(?,'')
        ORDER BY id DESC LIMIT 1`,
      [cotizacionId, base.producto_id, precio, seccion, area],
    );
    if (igual) {
      const item = actualizar('cotizacion_items', igual.id, { cantidad: igual.cantidad + cantidad });
      recalcularCotizacion(cotizacionId);
      sincronizarInventario(cotizacionId);
      return { ...item, sumadoA: igual.id, cantidadAnterior: igual.cantidad };
    }
  }

  const siguiente = one(
    'SELECT COALESCE(MAX(orden), 0) + 1 n FROM cotizacion_items WHERE cotizacion_id = ?',
    [cotizacionId],
  ).n;

  const item = insertar('cotizacion_items', {
    cotizacion_id: cotizacionId,
    producto_id: base.producto_id ?? null,
    seccion,
    area,
    descripcion,
    referencia: datos.referencia ?? base.referencia ?? null,
    marca: datos.marca ?? base.marca ?? null,
    unidad: datos.unidad ?? base.unidad ?? 'UND',
    foto: base.foto ?? null,
    cantidad,
    precio_unitario: precio,
    precio_manual: precioDictado,
    orden: datos.orden ?? siguiente,
  });

  recalcularCotizacion(cotizacionId);
  sincronizarInventario(cotizacionId); // si ya estaba aprobada, el renglón nuevo también sale de bodega
  return item;
}

/**
 * Encuentra un renglón dentro de una cotización por cómo lo nombra el usuario.
 *
 * Al dictar nadie dice "el ítem 47": dice "los interruptores de tres canales".
 * Se busca por referencia y por descripción, y si hay más de uno que encaja se
 * devuelven las opciones en vez de elegir por adivinanza.
 */
export function resolverItemDeCotizacion(cotizacionId, texto) {
  const q = String(texto ?? '').trim().toLowerCase();
  const items = consultar('cotizacion_items', { cotizacion_id: cotizacionId, limite: 300 });
  if (!items.length) return { error: 'Esa cotización todavía no tiene renglones.' };
  if (!q) return { error: 'Decime cuál renglón.' };

  const coincide = (i) => `${i.referencia ?? ''} ${i.descripcion ?? ''}`.toLowerCase();
  let candidatos = items.filter((i) => coincide(i).includes(q));

  // Si nada encaja entero, se prueba palabra por palabra: "interruptores de 3
  // canales" contra "Interruptor 3 canales".
  if (!candidatos.length) {
    const palabras = q.split(/\s+/).filter((p) => p.length > 2);
    candidatos = items.filter((i) => palabras.every((p) => coincide(i).includes(p)));
  }

  if (!candidatos.length) {
    return {
      error: `No encontré ningún renglón que diga "${texto}".`,
      sugerencias: items.slice(0, 8).map((i) => i.descripcion.split('\n')[0]),
    };
  }
  if (candidatos.length > 1) {
    return {
      error: `Hay ${candidatos.length} renglones que encajan con "${texto}".`,
      sugerencias: candidatos.slice(0, 8).map((i) => `#${i.id} ${i.descripcion.split('\n')[0]}`),
    };
  }
  return { id: candidatos[0].id, item: candidatos[0] };
}

/**
 * Encuentra un registro que ya existe, por cómo lo nombra el usuario.
 *
 * "Agregale a esa reunión que lleve el catálogo" tiene que dar con la reunión
 * que se acaba de crear, no con una nueva. Se prueba en este orden:
 *
 *   1. Un número: es el id.
 *   2. Un texto: se busca entre los campos de esa entidad.
 *   3. Sin texto: la última que se creó (que es a la que uno se refiere
 *      cuando dice "esa"), o la próxima pendiente del cliente que se nombró.
 *
 * Si hay más de una que encaja, se devuelven las opciones. Elegir por
 * adivinanza es peor que preguntar.
 */
export function resolverRegistro(entidad, texto, clienteId = null) {
  const meta = ENTIDADES[entidad];
  if (!meta) return { error: `No sé qué es "${entidad}".` };

  const q = String(texto ?? '').trim();

  if (/^\d+$/.test(q)) {
    const fila = obtenerPorId(meta.tabla, Number(q));
    if (fila) return { id: fila.id, fila };
  }

  const filtros = { limite: 50 };
  if (clienteId) filtros.cliente_id = clienteId;
  if (q) filtros.texto = q;

  let candidatos = consultar(entidad, filtros);

  // Sin resultados con la frase entera, se busca por palabras y gana el que
  // más comparta. "Editá la reunión con el ingeniero Javier" contra un título
  // que dice "Reunión Ingeniero Javier Forero": no coincide la frase, pero
  // coinciden tres palabras, y ninguna otra cita coincide en tres.
  //
  // Antes se probaba palabra por palabra y se paraba en la primera que
  // devolviera algo, así que "reunión" sola traía todas las reuniones y el
  // resultado era "hay varias que encajan" en vez de la que era.
  if (q && !candidatos.length) {
    const IRRELEVANTES = new Set(['para', 'con', 'del', 'los', 'las', 'que', 'una', 'este', 'esta', 'esa', 'ese']);
    const palabras = q.toLowerCase().split(/\s+/)
      .map((p) => p.replace(/[^\wáéíóúñü]/gi, ''))
      .filter((p) => p.length > 2 && !IRRELEVANTES.has(p));

    const puntos = new Map();
    for (const palabra of palabras) {
      for (const fila of consultar(entidad, { ...filtros, texto: palabra })) {
        puntos.set(fila.id, { fila, n: (puntos.get(fila.id)?.n ?? 0) + 1 });
      }
    }
    const mejor = Math.max(0, ...[...puntos.values()].map((v) => v.n));
    // Sólo se acepta si comparte más de una palabra, o si es la única: una
    // sola palabra en común es demasiado poco para dar algo por sentado.
    if (mejor > 0) {
      const empatados = [...puntos.values()].filter((v) => v.n === mejor);
      if (mejor > 1 || empatados.length === 1) candidatos = empatados.map((v) => v.fila);
    }
  }

  if (!candidatos.length) {
    return { error: q ? `No encontré nada que diga "${texto}".` : 'No hay ninguna todavía.', sugerencias: [] };
  }
  if (candidatos.length === 1) return { id: candidatos[0].id, fila: candidatos[0] };

  // Varias: si no dijo texto, se queda con la última creada, que es a la que
  // uno se refiere cuando dice "esa" justo después de haberla hecho.
  if (!q) {
    const ultima = [...candidatos].sort((a, b) => b.id - a.id)[0];
    return { id: ultima.id, fila: ultima };
  }

  const nombrar = (f) => f.titulo ?? f.texto ?? f.concepto ?? f.nombre ?? `#${f.id}`;
  return {
    error: `Hay ${candidatos.length} que encajan con "${texto}".`,
    sugerencias: candidatos.slice(0, 6).map((f) => `#${f.id} ${nombrar(f)}`),
  };
}

/* ------------------------------------------------------------------ */
/* Citas que llegan de afuera (el formulario de la web)                */
/* ------------------------------------------------------------------ */

/** '8:30' -> '08:30'. Sin esto una cita de las 8:30 se ordena después de las 10:00. */
function horaDeDosDigitos(hora) {
  const m = String(hora ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** La marca del turno: proyecto + día + hora, que es lo que lo hace único. */
const claveDeTurno = (proyecto, fecha, hora) =>
  [proyecto || 'web', `${fecha}T${hora}`].join(':').toLowerCase();

/**
 * Revisa un agendamiento y lo deja listo para guardar, o explica qué le falta.
 *
 * Va separado de la escritura porque al sincronizar la agenda entera hay que
 * revisar TODOS los turnos antes de tocar nada: si se validara sobre la
 * marcha, un turno con la fecha mal escrita se saltearía, y al no aparecer en
 * la lista de vigentes su cita terminaría cancelada por error.
 */
function revisarAgendamiento(datos = {}) {
  const nombre = String(datos.nombre ?? '').trim();
  const fecha = String(datos.fecha ?? '').trim();
  const hora = horaDeDosDigitos(datos.hora);

  if (!nombre) throw new Error('Falta el nombre de quien agendó.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha tiene que venir como AAAA-MM-DD.');
  if (!hora) throw new Error('La hora tiene que venir como HH:MM (por ejemplo 8:30).');

  const proyecto = String(datos.proyecto ?? '').trim();
  const apto = String(datos.apto ?? '').trim();
  const telefono = String(datos.telefono ?? '').trim();
  const correo = String(datos.correo ?? '').trim();
  const asunto = String(datos.asunto ?? '').trim() || 'Entrega domótica';

  return {
    nombre,
    telefono,
    correo,
    clave: claveDeTurno(proyecto, fecha, hora),
    cita: {
      titulo: apto ? `${asunto} · Apto ${apto}` : asunto,
      inicio: `${fecha}T${hora}`,
      // Las franjas del formulario van de media hora.
      duracion_min: Number(datos.duracion_min) > 0 ? Number(datos.duracion_min) : 30,
      lugar: [proyecto, apto && `Apto ${apto}`].filter(Boolean).join(' · ') || null,
      // El residente va acá adentro y no como cliente: quien agenda una
      // entrega es el dueño de un apartamento, no un cliente de Clic Control
      // —el cliente es la constructora, que es la que tiene la cotización—.
      // Metiéndolos en Clientes, una torre de cincuenta apartamentos llenaba
      // la lista de cincuenta nombres con los que no se factura nada y que
      // tapaban a los clientes de verdad. Su nombre, teléfono y correo quedan
      // en la cita, que es donde hacen falta el día de la entrega.
      notas: [
        `Residente: ${nombre}`,
        telefono && `Teléfono: ${telefono}`,
        correo && `Correo: ${correo}`,
        'Agendado desde el formulario de la web.',
      ].filter(Boolean).join('\n'),
      // Vuelve a 'pendiente' a propósito: si el turno se había cancelado y
      // alguien lo tomó de nuevo, la cita revive en vez de quedar tachada.
      estado: 'pendiente',
    },
  };
}

/** Guarda un agendamiento ya revisado, actualizando si ese turno ya existía. */
function guardarAgendamiento(revisado) {
  // Sin cliente a propósito: ver la nota en revisarAgendamiento(). El
  // `cliente_id: null` va explícito para que, si un turno cambia de dueño, la
  // cita que ya existía se despegue del cliente que tenía de antes.
  const cita = { ...revisado.cita, cliente_id: null, origen: revisado.clave };

  // Si la columna `origen` no llegó a crearse (su migración falló porque otro
  // proceso tenía la base tomada), se agenda igual: perder la protección
  // contra duplicados es molesto, no agendar es peor.
  if (!columnasReales('citas').has('origen')) {
    delete cita.origen;
    return { cita: insertar('citas', cita), creada: true };
  }

  const yaEstaba = one('SELECT id FROM citas WHERE origen = ?', [revisado.clave]);
  if (yaEstaba) {
    return { cita: actualizar('citas', yaEstaba.id, cita), creada: false };
  }
  return { cita: insertar('citas', cita), creada: true };
}

/**
 * Anota en la agenda una cita agendada desde afuera, sin duplicar.
 *
 * La marca `origen` identifica el turno de origen —proyecto + día + hora—, que
 * es justamente lo que el formulario garantiza único: no puede haber dos
 * personas en la franja de las 8:30 de un mismo viernes. Si ese turno ya
 * estaba anotado, se actualiza en vez de volver a insertarlo. Eso cubre los
 * dos casos que en la práctica pasan: que el aviso se reintente (queda una
 * sola cita, no dos), y que alguien libere su turno y lo tome otro (la cita
 * pasa a ser del nuevo, que es lo correcto: el turno es el mismo).
 *
 * @returns {{cita: object, creada: boolean}}
 */
export function registrarCitaExterna(datos = {}) {
  return guardarAgendamiento(revisarAgendamiento(datos));
}

/**
 * Pone la agenda a tono con la lista de turnos que hay hoy en la hoja.
 *
 * El formulario no tiene botón de cancelar: cuando alguien avisa que no puede,
 * la fila se borra (o se vacía) en la hoja de Google, y ahí se acaba. Nada de
 * eso le llega a Ari, así que la cita quedaría en la agenda para siempre.
 *
 * Por eso la hoja manda cada tanto la lista completa de los turnos que siguen
 * en pie, y acá se comparan contra lo que hay anotado: lo que está en la lista
 * se agenda o se actualiza, y lo que ya no está se marca como cancelado. Es la
 * misma idea que la sincronización de listas de precios: comparar contra lo
 * que hay, en vez de pedirle a alguien que avise cada cambio.
 *
 * Tres cosas que NO toca, a propósito:
 *
 *  - Las citas que no salieron de este proyecto. Se filtra por la marca de
 *    origen, así que una reunión que cargaste a mano nunca se cancela sola.
 *  - Lo que ya pasó. Sólo mira de `desde` en adelante (hoy, salvo que se pida
 *    otra cosa): si la hoja se limpia de vez en cuando, las entregas viejas no
 *    tienen por qué desaparecer de la agenda.
 *  - Las que ya se completaron. Que se borre la fila después de hacer la
 *    entrega no puede reescribir lo que ya pasó.
 *
 * @returns {{agendadas: number, nuevas: number, canceladas: Array}}
 */
export function sincronizarAgendaExterna(datos = {}) {
  const proyecto = String(datos.proyecto ?? '').trim();
  const turnos = datos.turnos;
  if (!Array.isArray(turnos)) throw new Error('Falta la lista de turnos.');

  if (!columnasReales('citas').has('origen')) {
    throw new Error(
      'No puedo sincronizar la agenda: falta la columna que marca de dónde viene '
      + 'cada cita. Reiniciá la aplicación cuando no haya otro proceso usando la base.',
    );
  }

  // Todo se revisa antes de escribir nada: un turno mal formado tiene que
  // frenar la sincronización entera, no colarse como una cancelación.
  const revisados = turnos.map((t, i) => {
    try {
      return revisarAgendamiento({ ...t, proyecto });
    } catch (err) {
      throw new Error(`El turno ${i + 1} de la lista no sirve: ${err.message}`);
    }
  });

  const prefijo = `${(proyecto || 'web').toLowerCase()}:`;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(datos.desde ?? '')) ? datos.desde : hoy();

  const enPie = all(
    `SELECT id, origen, inicio, titulo FROM citas
      WHERE origen IS NOT NULL AND substr(origen, 1, ?) = ?
        AND substr(inicio, 1, 10) >= ? AND estado = 'pendiente'`,
    [prefijo.length, prefijo, desde],
  );

  // Una lista vacía puede ser verdad (se cancelaron todas) o el síntoma de que
  // algo se rompió del otro lado. Como la diferencia no se puede saber desde
  // acá y equivocarse significa vaciarle la agenda al negocio, se frena y se
  // avisa; para vaciarla de verdad hay que pedirlo con todas las letras.
  if (!revisados.length && enPie.length && !datos.permitir_vaciar) {
    throw new Error(
      `La lista llegó vacía y hay ${enPie.length} cita(s) agendada(s). No cancelé nada: `
      + 'puede que la hoja no se haya podido leer. Si de verdad se cancelaron todas, '
      + 'mandá permitir_vaciar.',
    );
  }

  let nuevas = 0;
  for (const revisado of revisados) {
    if (guardarAgendamiento(revisado).creada) nuevas += 1;
  }

  const vigentes = new Set(revisados.map((r) => r.clave));
  const canceladas = [];
  for (const cita of enPie) {
    if (vigentes.has(cita.origen)) continue;
    actualizar('citas', cita.id, { estado: 'cancelada' });
    canceladas.push({ id: cita.id, titulo: cita.titulo, inicio: cita.inicio });
  }

  return { agendadas: revisados.length, nuevas, canceladas };
}

/**
 * Lo que hay que hacer después de registrar un abono.
 *
 * Si el cliente ya puso plata, la oferta está aprobada: no hay que acordarse
 * de marcarla aparte para que aparezca en los cobros pendientes. Antes, una
 * cotización con abonos pero sin marcar quedaba fuera de "por cobrar", que es
 * justo donde uno la va a buscar.
 *
 * No toca las rechazadas: un abono sobre algo que se rechazó es una
 * contradicción que conviene mirar a mano, no arreglar por lo bajo.
 */
export function trasAbono(cotizacionId) {
  const cot = obtenerPorId('cotizaciones', cotizacionId);
  if (!cot || cot.estado === 'aprobada' || cot.estado === 'rechazada') return cot;

  const conAbonos = one(
    'SELECT COUNT(*) n FROM abonos WHERE cotizacion_id = ?', [cotizacionId],
  ).n > 0;
  if (!conAbonos) return cot;

  const actualizada = actualizar('cotizaciones', cotizacionId, { estado: 'aprobada' });
  sincronizarInventario(cotizacionId);   // aprobada = sale de bodega
  return actualizada;
}

export function actualizarItem(itemId, datos = {}) {
  const item = obtenerPorId('cotizacion_items', itemId);
  if (!item) return null;
  const limpio = { ...datos };
  delete limpio.id;
  delete limpio.cotizacion_id;

  // Si por acá pasa un precio distinto del que tenía, lo escribió una persona:
  // se anota, y de ahí en adelante cambiar de lista de precios no lo pisa.
  // Sin esta marca no hay manera de distinguirlo de un renglón que quedó
  // desalineado porque después se reimportó la lista del proveedor.
  if (limpio.precio_unitario != null
      && Math.abs(Number(limpio.precio_unitario) - Number(item.precio_unitario)) > 1) {
    limpio.precio_manual = 1;
  }

  const actualizado = actualizar('cotizacion_items', itemId, limpio);
  recalcularCotizacion(item.cotizacion_id);
  sincronizarInventario(item.cotizacion_id);
  return actualizado;
}

export function eliminarItem(itemId) {
  const item = obtenerPorId('cotizacion_items', itemId);
  if (!item) return false;
  const ok = eliminar('cotizacion_items', itemId);
  recalcularCotizacion(item.cotizacion_id);
  sincronizarInventario(item.cotizacion_id);
  return ok;
}

/**
 * Deja el inventario a tono con el estado de una cotización.
 *
 * Aprobar una cotización es la señal de que esos productos salen de bodega,
 * así que se descuentan los que sean propios. Si después cambia de estado o
 * se le tocan las cantidades, hay que rehacerlo: por eso los movimientos que
 * genera quedan marcados con la cotización y se rehacen enteros cada vez, en
 * vez de intentar calcular diferencias.
 *
 * Los movimientos automáticos se borran al desaprobar en lugar de compensarse
 * con una entrada: no son hechos que hayan pasado en la bodega, son
 * consecuencia del estado de la cotización. Anotar +7 y -7 cada vez que se
 * corrige un estado sólo llenaría el historial de ruido.
 *
 * @returns {{descontados: Array<{descripcion: string, cantidad: number, stock: number}>}}
 */
export function sincronizarInventario(cotizacionId) {
  const cot = one('SELECT * FROM cotizaciones WHERE id = ?', [cotizacionId]);
  if (!cot) return { descontados: [] };

  run('DELETE FROM movimientos_stock WHERE cotizacion_id = ?', [cotizacionId]);
  if (cot.estado !== 'aprobada') return { descontados: [] };

  // Se suman las cantidades por producto: un mismo producto puede estar en
  // varios renglones de la misma cotización.
  const porProducto = all(
    `SELECT i.producto_id, SUM(i.cantidad) AS cantidad
       FROM cotizacion_items i
       JOIN productos p ON p.id = i.producto_id
      WHERE i.cotizacion_id = ? AND p.maneja_inventario = 1
      GROUP BY i.producto_id`,
    [cotizacionId],
  );

  const descontados = [];
  for (const fila of porProducto) {
    if (!(Number(fila.cantidad) > 0)) continue;
    insertar('movimientos_stock', {
      producto_id: fila.producto_id,
      cantidad: -Number(fila.cantidad),
      motivo: `Cotización #${cotizacionId} aprobada`,
      cotizacion_id: cotizacionId,
    });
    const p = obtenerPorId('productos', fila.producto_id);
    descontados.push({ descripcion: p.descripcion, cantidad: Number(fila.cantidad), stock: p.stock });
  }
  return { descontados };
}

/* ------------------------------------------------------------------ */
/* Consultas con filtros (lo que usa el dashboard y el asistente)      */
/* ------------------------------------------------------------------ */

/**
 * @param {string} entidad  clientes | citas | recordatorios | cotizaciones | cobros | notas
 * @param {object} filtros  { cliente_id, estado, texto, desde, hasta, rango, limite }
 */
export function consultar(entidad, filtros = {}) {
  const meta = ENTIDADES[entidad];
  if (!meta) throw new Error(`Entidad desconocida: ${entidad}`);

  const t = entidad === 'clientes' ? '' : 't.';
  const where = [];
  const params = [];

  if (filtros.cliente_id) {
    if (entidad === 'clientes') where.push('id = ?');
    else if (entidad === 'abonos') where.push('q.cliente_id = ?');
    // Un renglón no guarda el cliente: se llega a él por su cotización.
    else if (entidad === 'cotizacion_items') {
      where.push('t.cotizacion_id IN (SELECT id FROM cotizaciones WHERE cliente_id = ?)');
    } else where.push(`${t}cliente_id = ?`);
    params.push(filtros.cliente_id);
  }
  if (filtros.cotizacion_id) {
    where.push(`${t}cotizacion_id = ?`);
    params.push(filtros.cotizacion_id);
  }
  if (filtros.producto_id) {
    where.push(`${t}producto_id = ?`);
    params.push(filtros.producto_id);
  }

  // Un producto descontinuado (dejó de venir en la lista del proveedor) no se
  // borra, pero tampoco estorba al cotizar: sólo aparece si se lo pide.
  if (entidad === 'productos' && !filtros.incluir_inactivos) {
    where.push('t.activo = 1');
  }
  // Las cerradas no estorban en la lista de trabajo; se piden aparte para ver
  // el historial de un cliente.
  //
  // Se comprueba que la columna exista: si su migración no se pudo aplicar
  // —la base estaba tomada por otro proceso—, la aplicación tiene que seguir
  // funcionando sin esa función, no romperse al listar cotizaciones.
  if (entidad === 'cotizaciones' && !filtros.incluir_archivadas
      && columnasReales('cotizaciones').has('archivada')) {
    where.push(filtros.solo_archivadas ? 't.archivada = 1' : 't.archivada = 0');
  }
  // Filtrar por tipo: "mostrame los displays", "los switch EU"
  if (entidad === 'productos' && filtros.tipo && columnasReales('productos').has('tipo')) {
    where.push('t.tipo = ? COLLATE NOCASE');
    params.push(filtros.tipo);
  }

  const SIN_ESTADO = new Set(['clientes', 'notas', 'productos', 'movimientos_stock', 'cotizacion_items']);
  if (filtros.estado && !SIN_ESTADO.has(entidad)) {
    where.push(`${t}estado = ?`);
    params.push(filtros.estado);
  }

  if (filtros.texto) {
    const camposDe = {
      clientes: ['nombre', 'empresa', 'telefono', 'email', 'notas'],
      citas: ['titulo', 'lugar', 'notas'],
      recordatorios: ['texto'],
      cotizaciones: ['titulo', 'descripcion'],
      cobros: ['concepto'],
      notas: ['texto'],
      abonos: ['nota'],
      productos: ['categoria', 'referencia', 'descripcion', 'marca', 'proveedor', 'tipo'],
      movimientos_stock: ['motivo'],
      cotizacion_items: ['descripcion', 'referencia', 'marca', 'seccion'],
    }[entidad];
    // En cotizaciones, cobros y citas se busca también por el nombre del
    // cliente: es como uno las busca de verdad ("las de la señora Ruth"), no
    // por el asunto que se le puso.
    const porCliente = ['cotizaciones', 'cobros', 'citas', 'recordatorios'].includes(entidad);
    // Igual que arriba: si una columna nueva no llegó a crearse, se busca sin
    // ella en vez de que reviente el buscador entero.
    const reales = columnasReales(meta.tabla);
    const campos = camposDe.filter((c) => reales.has(c));
    const trozos = campos.map((c) => `${t}${c} LIKE ? COLLATE NOCASE`);
    if (porCliente) trozos.push('c.nombre LIKE ? COLLATE NOCASE');

    where.push(`(${trozos.join(' OR ')})`);
    campos.forEach(() => params.push(`%${filtros.texto}%`));
    if (porCliente) params.push(`%${filtros.texto}%`);
  }

  // Campo de fecha relevante por entidad
  const campoFecha = { citas: 'inicio', recordatorios: 'vence_en', cobros: 'vence_en', cotizaciones: 'vence_en', abonos: 'fecha' }[entidad];

  if (campoFecha) {
    const d = hoy();
    if (filtros.rango === 'hoy') {
      where.push(`substr(${t}${campoFecha}, 1, 10) = ?`);
      params.push(d);
    } else if (filtros.rango === 'semana') {
      const fin = new Date();
      fin.setDate(fin.getDate() + 7);
      where.push(`substr(${t}${campoFecha}, 1, 10) BETWEEN ? AND ?`);
      params.push(d, fin.toLocaleDateString('sv-SE'));
    } else if (filtros.rango === 'mes') {
      where.push(`substr(${t}${campoFecha}, 1, 7) = ?`);
      params.push(d.slice(0, 7));
    } else if (filtros.rango === 'vencidos') {
      where.push(`${t}${campoFecha} IS NOT NULL AND substr(${t}${campoFecha}, 1, 10) < ?`);
      params.push(d);
    } else if (filtros.rango === 'proximos') {
      where.push(`(${t}${campoFecha} IS NULL OR substr(${t}${campoFecha}, 1, 10) >= ?)`);
      params.push(d);
    }
    if (filtros.desde) {
      where.push(`substr(${t}${campoFecha}, 1, 10) >= ?`);
      params.push(filtros.desde);
    }
    if (filtros.hasta) {
      where.push(`substr(${t}${campoFecha}, 1, 10) <= ?`);
      params.push(filtros.hasta);
    }
  }

  const limite = Math.min(Number(filtros.limite) || 100, 300);
  const sql = `${selectConCliente(meta.tabla)}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${meta.orden}
    LIMIT ${limite}`;

  return all(sql, params);
}

/* ------------------------------------------------------------------ */
/* Resumen del dashboard                                               */
/* ------------------------------------------------------------------ */

/**
 * Cierra una cotización: sale de la lista de trabajo y queda en el historial
 * del cliente.
 *
 * Sólo se puede cerrar si no falta plata. Cerrar algo con saldo sería perderlo
 * de vista justo cuando todavía hay que cobrarlo, que es lo contrario de lo
 * que uno quiere.
 */
export function cerrarCotizacion(id) {
  const cot = obtenerPorId('cotizaciones', id);
  if (!cot) throw new Error('Esa cotización no existe.');
  if (Number(cot.saldo) > 0) {
    throw new Error(
      `Todavía le faltan ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: cot.moneda || 'COP', maximumFractionDigits: 0 }).format(cot.saldo)} por cobrar. `
      + 'Registrá los abonos que falten y ahí sí se puede cerrar.',
    );
  }
  return actualizar('cotizaciones', id, { archivada: 1 });
}

/** La devuelve a la lista de trabajo. */
export const reabrirCotizacion = (id) => actualizar('cotizaciones', id, { archivada: 0 });

/** Lo que falta cobrar de las cotizaciones ya aprobadas. */
export const saldoAprobadas = () => one(`
  SELECT COALESCE(SUM(saldo), 0) n FROM (
    SELECT t.monto - ${SUMA_ABONOS} AS saldo
    FROM cotizaciones t WHERE t.estado = 'aprobada'
  ) WHERE saldo > 0`).n;

/**
 * Las cotizaciones aprobadas a las que todavía les falta plata, con la misma
 * forma que un cobro, para poder mostrarlas juntas.
 *
 * No se crean cobros de verdad al aprobar a propósito: serían una copia del
 * saldo que quedaría desactualizada apenas se registre un abono. Acá se
 * calculan en el momento, así que un abono sobre la cotización se ve
 * enseguida en la pantalla de cobros.
 */
export function cobrosDeCotizaciones() {
  return all(`
    SELECT t.id, t.cliente_id, c.nombre AS cliente, t.titulo AS concepto,
           t.vence_en, t.moneda, t.archivo,
           t.monto - ${SUMA_ABONOS} AS monto,
           ${SUMA_ABONOS} AS abonado,
           t.monto AS total
      FROM cotizaciones t LEFT JOIN clientes c ON c.id = t.cliente_id
     WHERE t.estado = 'aprobada' AND t.monto > ${SUMA_ABONOS}
     ORDER BY COALESCE(t.vence_en, '9999') ASC, t.id DESC`)
    .map((f) => ({ ...f, estado: 'pendiente', origen: 'cotizacion' }));
}

export function resumen() {
  return cachear('resumen', calcularResumen);
}

function calcularResumen() {
  const d = hoy();
  const contar = (sql, params = []) => one(sql, params).n;
  const activa = cotizacionActiva();

  return {
    fecha: d,
    // Para el aviso de "cotización en curso" mientras se dicta.
    enCurso: activa ? { ...activa, totales: totalesCotizacion(activa.id) } : null,
    citasHoy: consultar('citas', { rango: 'hoy', estado: 'pendiente' }),
    // Todo lo que está pendiente y todavía no venció, no sólo lo de hoy: un
    // recordatorio para el jueves también hay que tenerlo a la vista. Los
    // vencidos van en su propio bloque, arriba.
    pendientesHoy: consultar('recordatorios', { rango: 'proximos', estado: 'pendiente', limite: 10 }),
    vencidos: consultar('recordatorios', { rango: 'vencidos', estado: 'pendiente' }),
    cobrosVencidos: [
      ...consultar('cobros', { rango: 'vencidos', estado: 'pendiente' }),
      ...cobrosDeCotizaciones().filter((c) => c.vence_en && String(c.vence_en).slice(0, 10) < d),
    ],
    proximasCitas: consultar('citas', { rango: 'proximos', estado: 'pendiente', limite: 8 }),
    contadores: {
      clientes: contar('SELECT COUNT(*) n FROM clientes'),
      citasHoy: contar("SELECT COUNT(*) n FROM citas WHERE substr(inicio,1,10) = ? AND estado='pendiente'", [d]),
      recordatorios: contar("SELECT COUNT(*) n FROM recordatorios WHERE estado='pendiente'"),
      cotizaciones: contar("SELECT COUNT(*) n FROM cotizaciones WHERE estado = 'pendiente'"),
      portalPendientes: contar("SELECT COUNT(*) n FROM clientes_portal WHERE estado = 'pendiente'"),
      // Plata que el cliente ya se comprometió a pagar: los cobros sueltos
      // más el saldo de las cotizaciones aprobadas. Una cotización aprobada
      // es una venta cerrada, así que lo que falte de ella es cobranza; antes
      // sólo se miraba la tabla de cobros y por eso una oferta aprobada no
      // aparecía por ningún lado.
      porCobrar: one("SELECT COALESCE(SUM(monto),0) n FROM cobros WHERE estado='pendiente'").n
        + saldoAprobadas(),
      // Y esto es lo que todavía se está negociando: lo ofertado que aún no
      // dijeron que sí. Aprobar una cotización la mueve de acá para allá.
      saldoCotizado: one(`
        SELECT COALESCE(SUM(saldo), 0) n FROM (
          SELECT t.monto - ${SUMA_ABONOS} AS saldo
          FROM cotizaciones t WHERE t.estado = 'pendiente'
        ) WHERE saldo > 0`).n,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════
   Catálogo público: registro, aprobación, pedidos
   ══════════════════════════════════════════════════════════════════ */

const PORTAL_PUBLICO = (u) => ({
  id: u.id, nombre: u.nombre, empresa: u.empresa, telefono: u.telefono, email: u.email,
  estado: u.estado, nivel_precio: u.nivel_precio, cliente_id: u.cliente_id, creado_en: u.creado_en,
});

/**
 * Da de alta un pedido de registro. Cualquiera puede llegar hasta acá —no
 * hace falta sesión de ningún tipo—, así que lo único que se guarda es lo
 * mínimo para poder aprobarlo o rechazarlo después: nadie entra a mirar el
 * catálogo por este camino, sólo queda pedido.
 */
export function registrarPortalUsuario({ nombre, empresa, telefono, email, clave_hash }) {
  const correo = String(email ?? '').trim().toLowerCase();
  if (!correo || !correo.includes('@')) throw new Error('Ese correo no parece válido.');
  if (!String(nombre ?? '').trim()) throw new Error('Falta el nombre.');

  const yaEsta = one('SELECT id, estado FROM clientes_portal WHERE email = ? COLLATE NOCASE', [correo]);
  if (yaEsta) {
    throw new Error(
      yaEsta.estado === 'pendiente'
        ? 'Ya hay un registro con ese correo, esperando aprobación.'
        : 'Ese correo ya está registrado. Iniciá sesión, o escribinos si no podés entrar.',
    );
  }

  const r = run(
    `INSERT INTO clientes_portal (nombre, empresa, telefono, email, clave_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [String(nombre).trim(), empresa || null, telefono || null, correo, clave_hash],
  );
  return PORTAL_PUBLICO(obtenerPortalUsuario(Number(r.lastInsertRowid)));
}

export const obtenerPortalUsuario = (id) => one('SELECT * FROM clientes_portal WHERE id = ?', [id]);

/** Con el hash incluido: sólo para la propia comprobación de la clave al iniciar sesión. */
export const portalUsuarioPorEmail = (email) =>
  one('SELECT * FROM clientes_portal WHERE email = ? COLLATE NOCASE', [String(email ?? '').trim().toLowerCase()]);

export const listarPortalUsuarios = (estado = null) => all(
  estado
    ? 'SELECT * FROM clientes_portal WHERE estado = ? ORDER BY creado_en DESC'
    : 'SELECT * FROM clientes_portal ORDER BY creado_en DESC',
  estado ? [estado] : [],
).map(PORTAL_PUBLICO);

const NIVELES_PRECIO = new Set(['canal', 'constructor', 'cliente']);

export function aprobarPortalUsuario(id, nivel_precio) {
  if (!NIVELES_PRECIO.has(nivel_precio)) throw new Error('El nivel de precio tiene que ser canal, constructor o cliente.');
  const u = obtenerPortalUsuario(id);
  if (!u) throw new Error('Ese registro no existe.');
  run(
    "UPDATE clientes_portal SET estado='aprobado', nivel_precio=?, aprobado_en=datetime('now','localtime') WHERE id=?",
    [nivel_precio, id],
  );
  return PORTAL_PUBLICO(obtenerPortalUsuario(id));
}

export function rechazarPortalUsuario(id) {
  const u = obtenerPortalUsuario(id);
  if (!u) throw new Error('Ese registro no existe.');
  run("UPDATE clientes_portal SET estado='rechazado' WHERE id=?", [id]);
  return PORTAL_PUBLICO(obtenerPortalUsuario(id));
}

export function eliminarPortalUsuario(id) {
  return eliminar('clientes_portal', id);
}

/**
 * El catálogo tal como lo ve un cliente aprobado: un solo precio —el de su
 * nivel—, nunca los otros dos. Mostrarle el de canal a un cliente final sería
 * enseñarle el margen con el que se trabaja con los distribuidores.
 */
export function catalogoPublico(nivel_precio) {
  // Los tres precios SÍ se traen —precioSegunNivel() los necesita para elegir
  // el que corresponde—; lo que no viaja después en la respuesta son los
  // otros dos, sólo el que le toca a este cliente. Faltaban acá y por eso el
  // catálogo entero salía en $0 y desaparecía: el filtro de abajo descarta
  // justamente lo que no tiene precio.
  const filas = all(
    `SELECT id, categoria, tipo, referencia, descripcion, marca, unidad, foto, fotos_extra,
            precio_canal, precio_constructor, precio_cliente
       FROM productos WHERE activo = 1
       ORDER BY categoria COLLATE NOCASE ASC, descripcion COLLATE NOCASE ASC`,
  );
  return filas.map((p) => ({
    id: p.id,
    categoria: p.categoria,
    tipo: p.tipo,
    referencia: p.referencia,
    descripcion: p.descripcion,
    marca: p.marca,
    unidad: p.unidad,
    foto: p.foto,
    fotos: fotosDeProducto(p),
    precio: precioSegunNivel(p, nivel_precio),
  })).filter((p) => p.precio > 0);   // sin precio para ese nivel, no se ofrece
}

/** Las fotos de un producto, la principal primero, sin repetir ni vacíos. */
function fotosDeProducto(p) {
  let extra = [];
  try { extra = JSON.parse(p.fotos_extra || '[]'); } catch { extra = []; }
  return [p.foto, ...extra].filter(Boolean).filter((f, i, arr) => arr.indexOf(f) === i);
}

export function agregarFotoProducto(id, url) {
  const p = obtenerPorId('productos', id);
  if (!p) throw new Error('Ese producto no existe.');
  let extra = [];
  try { extra = JSON.parse(p.fotos_extra || '[]'); } catch { extra = []; }
  extra.push(url);
  return actualizar('productos', id, { fotos_extra: JSON.stringify(extra) });
}

export function quitarFotoProducto(id, url) {
  const p = obtenerPorId('productos', id);
  if (!p) throw new Error('Ese producto no existe.');
  let extra = [];
  try { extra = JSON.parse(p.fotos_extra || '[]'); } catch { extra = []; }
  extra = extra.filter((f) => f !== url);
  return actualizar('productos', id, { fotos_extra: JSON.stringify(extra) });
}

/**
 * Encuentra al cliente de un pedido del portal, o lo crea.
 *
 * El registro y la aprobación NO crean cliente —son sólo el permiso para
 * mirar—; recién acá, con el primer pedido de verdad, hace falta uno. Se
 * busca primero por el correo con el que se registró: si ya es cliente de
 * Clic Control por otro lado (alguien le cotizó por voz, por ejemplo), el
 * pedido se cuelga de ESE cliente en vez de crear uno repetido.
 */
function clienteDelPedido(portalUsuario) {
  if (portalUsuario.cliente_id) return portalUsuario.cliente_id;

  const porCorreo = one(
    `SELECT * FROM clientes WHERE email = ? COLLATE NOCASE
       AND email IS NOT NULL AND email <> '' ORDER BY id LIMIT 1`,
    [portalUsuario.email],
  );
  const cliente = porCorreo ?? crearCliente({
    nombre: portalUsuario.nombre,
    empresa: portalUsuario.empresa || null,
    telefono: portalUsuario.telefono || null,
    email: portalUsuario.email,
  });

  run('UPDATE clientes_portal SET cliente_id = ? WHERE id = ?', [cliente.id, portalUsuario.id]);
  return cliente.id;
}

/**
 * El carrito que arma un cliente en la tienda se convierte en una cotización
 * pendiente, exactamente como si Ari la hubiera dictado: mismos renglones,
 * mismo cálculo de totales. La única diferencia es `origen='portal'`, que es
 * lo que la marca en la lista y lo que en algún momento podría distinguir
 * "quién puede tocar esto" si hiciera falta.
 */
export function crearPedidoPortal(portalUsuarioId, { items, notas } = {}) {
  const u = obtenerPortalUsuario(portalUsuarioId);
  if (!u || u.estado !== 'aprobado') throw new Error('No estás autorizado a comprar en el catálogo.');
  if (!Array.isArray(items) || !items.length) throw new Error('El carrito está vacío.');

  const clienteId = clienteDelPedido(u);

  const fecha = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  const cot = insertar('cotizaciones', {
    cliente_id: clienteId,
    titulo: `Pedido del catálogo · ${fecha}`,
    descripcion: notas || null,
    nivel_precio: u.nivel_precio,
    origen: 'portal',
  });

  for (const it of items) {
    const cantidad = Number(it.cantidad) > 0 ? Number(it.cantidad) : 1;
    agregarItem(cot.id, { producto_id: Number(it.producto_id), cantidad });
  }

  return obtenerPorId('cotizaciones', cot.id);
}

/** Los pedidos que hizo un cliente del portal, para que los vea en "Mis pedidos". */
export function pedidosDePortalUsuario(portalUsuarioId) {
  const u = obtenerPortalUsuario(portalUsuarioId);
  if (!u?.cliente_id) return [];
  return all(
    `${selectConCliente('cotizaciones')}
      WHERE t.cliente_id = ? AND t.origen = 'portal'
      ORDER BY t.id DESC`,
    [u.cliente_id],
  );
}
