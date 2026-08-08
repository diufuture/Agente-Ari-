// Capa de datos. SQLite viene incluido en Node 22 (node:sqlite), así que no
// hace falta ninguna dependencia nativa.
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
  estado      TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | enviada | aprobada | rechazada
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

CREATE INDEX IF NOT EXISTS idx_citas_inicio  ON citas(inicio);
CREATE INDEX IF NOT EXISTS idx_rec_vence     ON recordatorios(vence_en);
CREATE INDEX IF NOT EXISTS idx_cot_cliente   ON cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cob_cliente   ON cobros(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abo_cot       ON abonos(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_prod_categoria ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_items_cot ON cotizacion_items(cotizacion_id);
`);

// Migraciones suaves: CREATE TABLE IF NOT EXISTS no agrega columnas nuevas a
// una tabla que ya existía, así que las bases creadas con versiones
// anteriores se completan acá sin perder datos.
{
  const columnasDe = (tabla) => db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);

  const prod = columnasDe('productos');
  if (!prod.includes('maneja_inventario')) {
    db.exec('ALTER TABLE productos ADD COLUMN maneja_inventario INTEGER NOT NULL DEFAULT 0');
  }

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

  const mov = columnasDe('movimientos_stock');
  if (!mov.includes('cotizacion_id')) {
    db.exec('ALTER TABLE movimientos_stock ADD COLUMN cotizacion_id INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL');
  }
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
const run = (sql, params = []) => db.prepare(sql).run(...params);

export const hoy = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

/** Une el nombre del cliente a cualquier fila que tenga cliente_id. */
const SUMA_ABONOS = "COALESCE((SELECT SUM(a.monto) FROM abonos a WHERE a.cotizacion_id = t.id), 0)";

const SUMA_STOCK = "COALESCE((SELECT SUM(m.cantidad) FROM movimientos_stock m WHERE m.producto_id = t.id), 0)";

const SUMA_ITEMS =
  "COALESCE((SELECT SUM(i.cantidad * i.precio_unitario) FROM cotizacion_items i WHERE i.cotizacion_id = t.id), 0)";

function selectConCliente(tabla) {
  if (tabla === 'clientes') return 'SELECT * FROM clientes';
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
      : "t.estado IN ('pendiente', 'enviada')";
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
    return {
      error: soloConSaldo
        ? 'Ese cliente no tiene cotizaciones con saldo pendiente.'
        : 'Ese cliente no tiene ninguna cotización abierta. Creá una primero.',
      sugerencias: [],
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
export function resolverProducto(texto) {
  if (typeof texto === 'number' || /^\d+$/.test(String(texto ?? '').trim())) {
    const p = obtenerPorId('productos', Number(texto));
    if (p) return { id: p.id, producto: p };
  }

  const q = String(texto ?? '').trim();
  if (!q) return { error: 'No dijiste qué producto.', sugerencias: [] };

  const parecidos = all(
    `${selectConCliente('productos')}
      WHERE t.referencia LIKE ? COLLATE NOCASE OR t.descripcion LIKE ? COLLATE NOCASE
      ORDER BY t.descripcion COLLATE NOCASE LIMIT 5`,
    [`%${q}%`, `%${q}%`],
  );
  if (parecidos.length === 1) return { id: parecidos[0].id, producto: parecidos[0] };
  if (parecidos.length > 1) {
    return {
      error: `Hay varios productos que coinciden con "${q}".`,
      sugerencias: parecidos.map((p) => `#${p.id} ${p.referencia ? `${p.referencia} ` : ''}${p.descripcion}`),
    };
  }
  return { error: `No encontré ningún producto que coincida con "${q}".`, sugerencias: [] };
}

/* ------------------------------------------------------------------ */
/* Inserciones genéricas                                               */
/* ------------------------------------------------------------------ */

export function insertar(tabla, datos) {
  const campos = Object.keys(datos).filter((k) => datos[k] !== undefined);
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

export function actualizar(tabla, id, datos) {
  const campos = Object.keys(datos).filter((k) => datos[k] !== undefined);
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
  nit: '',
  direccion: '',
  telefono: '',
  email: '',
  ciudad: 'Bogotá',
  representante: '',
  representante_telefono: '',
  representante_email: '',
  validez: '8 días',
  condiciones: [
    'Tiempo de entrega: según cronograma de obra.',
    'Garantía: 1 año.',
    'Forma de pago: a convenir.',
  ].join('\n'),
};

export function leerAjustes() {
  const filas = all('SELECT clave, valor FROM ajustes');
  const guardados = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  return { ...AJUSTES_POR_DEFECTO, ...guardados };
}

export function guardarAjustes(datos = {}) {
  for (const [clave, valor] of Object.entries(datos)) {
    if (clave in AJUSTES_POR_DEFECTO) escribirAjuste(clave, valor);
  }
  return leerAjustes();
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

  const siguiente = one(
    'SELECT COALESCE(MAX(orden), 0) + 1 n FROM cotizacion_items WHERE cotizacion_id = ?',
    [cotizacionId],
  ).n;

  const item = insertar('cotizacion_items', {
    cotizacion_id: cotizacionId,
    producto_id: base.producto_id ?? null,
    seccion: datos.seccion ?? base.seccion ?? null,
    descripcion,
    referencia: datos.referencia ?? base.referencia ?? null,
    marca: datos.marca ?? base.marca ?? null,
    unidad: datos.unidad ?? base.unidad ?? 'UND',
    foto: base.foto ?? null,
    cantidad: Number(datos.cantidad) > 0 ? Number(datos.cantidad) : 1,
    precio_unitario: datos.precio_unitario !== undefined && datos.precio_unitario !== null
      ? Number(datos.precio_unitario)
      : (base.precio_unitario ?? 0),
    orden: datos.orden ?? siguiente,
  });

  recalcularCotizacion(cotizacionId);
  sincronizarInventario(cotizacionId); // si ya estaba aprobada, el renglón nuevo también sale de bodega
  return item;
}

export function actualizarItem(itemId, datos = {}) {
  const item = obtenerPorId('cotizacion_items', itemId);
  if (!item) return null;
  const limpio = { ...datos };
  delete limpio.id;
  delete limpio.cotizacion_id;
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

  const SIN_ESTADO = new Set(['clientes', 'notas', 'productos', 'movimientos_stock', 'cotizacion_items']);
  if (filtros.estado && !SIN_ESTADO.has(entidad)) {
    where.push(`${t}estado = ?`);
    params.push(filtros.estado);
  }

  if (filtros.texto) {
    const campos = {
      clientes: ['nombre', 'empresa', 'telefono', 'email', 'notas'],
      citas: ['titulo', 'lugar', 'notas'],
      recordatorios: ['texto'],
      cotizaciones: ['titulo', 'descripcion'],
      cobros: ['concepto'],
      notas: ['texto'],
      abonos: ['nota'],
      productos: ['categoria', 'referencia', 'descripcion', 'marca', 'proveedor'],
      movimientos_stock: ['motivo'],
      cotizacion_items: ['descripcion', 'referencia', 'marca', 'seccion'],
    }[entidad];
    where.push(`(${campos.map((c) => `${t}${c} LIKE ? COLLATE NOCASE`).join(' OR ')})`);
    campos.forEach(() => params.push(`%${filtros.texto}%`));
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

export function resumen() {
  const d = hoy();
  const contar = (sql, params = []) => one(sql, params).n;
  const activa = cotizacionActiva();

  return {
    fecha: d,
    // Para el aviso de "cotización en curso" mientras se dicta.
    enCurso: activa ? { ...activa, totales: totalesCotizacion(activa.id) } : null,
    citasHoy: consultar('citas', { rango: 'hoy', estado: 'pendiente' }),
    pendientesHoy: consultar('recordatorios', { rango: 'hoy', estado: 'pendiente' }),
    vencidos: consultar('recordatorios', { rango: 'vencidos', estado: 'pendiente' }),
    cobrosVencidos: consultar('cobros', { rango: 'vencidos', estado: 'pendiente' }),
    proximasCitas: consultar('citas', { rango: 'proximos', estado: 'pendiente', limite: 8 }),
    contadores: {
      clientes: contar('SELECT COUNT(*) n FROM clientes'),
      citasHoy: contar("SELECT COUNT(*) n FROM citas WHERE substr(inicio,1,10) = ? AND estado='pendiente'", [d]),
      recordatorios: contar("SELECT COUNT(*) n FROM recordatorios WHERE estado='pendiente'"),
      cotizaciones: contar("SELECT COUNT(*) n FROM cotizaciones WHERE estado IN ('pendiente','enviada')"),
      porCobrar: one(
        "SELECT COALESCE(SUM(monto),0) n FROM cobros WHERE estado='pendiente'",
      ).n,
      // Lo que falta por recibir de las cotizaciones que no fueron rechazadas
      saldoCotizado: one(`
        SELECT COALESCE(SUM(saldo), 0) n FROM (
          SELECT t.monto - ${SUMA_ABONOS} AS saldo
          FROM cotizaciones t WHERE t.estado <> 'rechazada'
        ) WHERE saldo > 0`).n,
    },
  };
}
