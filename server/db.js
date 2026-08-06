// Capa de datos. SQLite viene incluido en Node 22 (node:sqlite), así que no
// hace falta ninguna dependencia nativa.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.env.ARI_DB || './data/clic-control.db');
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

CREATE TABLE IF NOT EXISTS notas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_citas_inicio  ON citas(inicio);
CREATE INDEX IF NOT EXISTS idx_rec_vence     ON recordatorios(vence_en);
CREATE INDEX IF NOT EXISTS idx_cot_cliente   ON cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cob_cliente   ON cobros(cliente_id);
`);

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
};

const all = (sql, params = []) => db.prepare(sql).all(...params);
const one = (sql, params = []) => db.prepare(sql).get(...params);
const run = (sql, params = []) => db.prepare(sql).run(...params);

export const hoy = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

/** Une el nombre del cliente a cualquier fila que tenga cliente_id. */
function selectConCliente(tabla) {
  if (tabla === 'clientes') return 'SELECT * FROM clientes';
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
    where.push(entidad === 'clientes' ? 'id = ?' : `${t}cliente_id = ?`);
    params.push(filtros.cliente_id);
  }

  if (filtros.estado && entidad !== 'clientes' && entidad !== 'notas') {
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
    }[entidad];
    where.push(`(${campos.map((c) => `${t}${c} LIKE ? COLLATE NOCASE`).join(' OR ')})`);
    campos.forEach(() => params.push(`%${filtros.texto}%`));
  }

  // Campo de fecha relevante por entidad
  const campoFecha = { citas: 'inicio', recordatorios: 'vence_en', cobros: 'vence_en', cotizaciones: 'vence_en' }[entidad];

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

  return {
    fecha: d,
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
    },
  };
}
