// Servidor HTTP de Clic Control / Ari.
// Sin frameworks: Node 22 trae todo lo necesario (http + sqlite + fetch).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga .env si existe (Node >= 20.6, sin dependencias).
try {
  process.loadEnvFile('.env');
} catch {
  /* sin .env: se usan las variables del entorno */
}

const RAIZ = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PUBLICO = join(RAIZ, 'public');
const PUERTO = Number(process.env.PORT) || 3000;

const [db, tools, asistente] = await Promise.all([
  import('./db.js'),
  import('./tools.js'),
  import('./assistant.js'),
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const json = (res, codigo, cuerpo) => {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
};

async function leerJson(req) {
  const trozos = [];
  let bytes = 0;
  for await (const t of req) {
    bytes += t.length;
    if (bytes > 1_000_000) throw new Error('Cuerpo demasiado grande');
    trozos.push(t);
  }
  if (!trozos.length) return {};
  return JSON.parse(Buffer.concat(trozos).toString('utf8'));
}

const ENTIDADES_VALIDAS = new Set(Object.keys(db.ENTIDADES));

/* ------------------------------------------------------------------ */
/* Rutas de API                                                        */
/* ------------------------------------------------------------------ */

async function api(req, res, url) {
  const partes = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [recurso, id] = partes;

  // GET /api/estado
  if (recurso === 'estado' && req.method === 'GET') {
    return json(res, 200, {
      modelo: asistente.modeloEnUso(),
      vozLista: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  }

  // GET /api/resumen  -> tarjetas y listas del dashboard
  if (recurso === 'resumen' && req.method === 'GET') {
    return json(res, 200, db.resumen());
  }

  // POST /api/asistente  -> el cerebro
  if (recurso === 'asistente' && req.method === 'POST') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return json(res, 503, {
        error: 'Falta configurar ANTHROPIC_API_KEY. Copia .env.example a .env y pon tu clave.',
      });
    }
    const cuerpo = await leerJson(req);
    const texto = String(cuerpo.texto || '').trim();
    if (!texto) return json(res, 400, { error: 'No recibí ningún texto.' });

    try {
      const r = await asistente.conversar(texto, cuerpo.historial || []);
      return json(res, 200, r);
    } catch (err) {
      console.error('[asistente]', err);
      return json(res, 502, { error: `El asistente falló: ${err.message}` });
    }
  }

  // CRUD manual sobre las entidades (para editar a mano en la interfaz)
  if (ENTIDADES_VALIDAS.has(recurso)) {
    const tabla = db.ENTIDADES[recurso].tabla;

    if (req.method === 'GET') {
      const f = Object.fromEntries(url.searchParams);
      if (f.cliente) {
        const r = db.resolverCliente(f.cliente);
        if (r.error) return json(res, 200, { filas: [], aviso: r.error });
        f.cliente_id = r.id;
      }
      return json(res, 200, { filas: db.consultar(recurso, f) });
    }

    if (req.method === 'POST') {
      const datos = await leerJson(req);
      if (datos.cliente && !datos.cliente_id) {
        const r = db.resolverCliente(datos.cliente, { crearSiNoExiste: true });
        datos.cliente_id = r.id;
      }
      delete datos.cliente;
      for (const campo of ['inicio', 'vence_en']) {
        if (datos[campo]) datos[campo] = tools.normalizarFecha(datos[campo]) ?? datos[campo];
      }
      try {
        return json(res, 201, db.insertar(tabla, datos));
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const datos = await leerJson(req);
      delete datos.id;
      delete datos.cliente;
      try {
        const fila = db.actualizar(tabla, Number(id), datos);
        if (!fila) return json(res, 404, { error: 'No encontrado' });
        return json(res, 200, fila);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    if (req.method === 'DELETE' && id) {
      return json(res, db.eliminar(tabla, Number(id)) ? 200 : 404, { ok: true });
    }
  }

  return json(res, 404, { error: 'Ruta no encontrada' });
}

/* ------------------------------------------------------------------ */
/* Archivos estáticos                                                  */
/* ------------------------------------------------------------------ */

async function estatico(req, res, url) {
  const ruta = url.pathname === '/' ? '/index.html' : url.pathname;
  const destino = join(PUBLICO, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));

  if (!destino.startsWith(PUBLICO)) {
    res.writeHead(403).end('Prohibido');
    return;
  }

  try {
    const contenido = await readFile(destino);
    res.writeHead(200, {
      'Content-Type': MIME[extname(destino)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(contenido);
  } catch {
    // SPA: cualquier ruta desconocida devuelve el index
    try {
      const html = await readFile(join(PUBLICO, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(html);
    } catch {
      res.writeHead(404).end('No encontrado');
    }
  }
}

/* ------------------------------------------------------------------ */

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api')) await api(req, res, url);
    else await estatico(req, res, url);
  } catch (err) {
    console.error('[servidor]', err);
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
});

servidor.listen(PUERTO, () => {
  console.log(`\n  Clic Control · Ari`);
  console.log(`  ➜  http://localhost:${PUERTO}`);
  console.log(`  ➜  modelo: ${asistente.modeloEnUso()}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠  Falta ANTHROPIC_API_KEY: la voz y el chat no funcionarán.');
  }
  console.log('');
});
