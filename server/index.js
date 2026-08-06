// Servidor HTTP de Clic Control / Ari.
// Sin frameworks: Node 22 trae todo lo necesario (http + sqlite + fetch).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PUBLICO = join(RAIZ, 'public');

// Carga .env si existe (Node >= 20.6, sin dependencias).
// Se busca junto al proyecto, no en el directorio desde el que se ejecutó:
// los servidores (Passenger, systemd, PM2) suelen arrancar desde otra carpeta.
try {
  process.loadEnvFile(join(RAIZ, '.env'));
} catch {
  /* sin .env: se usan las variables del entorno */
}

// Passenger (el motor que usa cPanel) puede pasar una ruta de socket en vez de
// un número, así que se reenvía tal cual: listen() acepta ambas formas.
const PUERTO = process.env.PORT || 3000;

const [db, tools, asistente, auth] = await Promise.all([
  import('./db.js'),
  import('./tools.js'),
  import('./assistant.js'),
  import('./auth.js'),
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * ¿Hay una clave de verdad? No basta con que la variable exista: si alguien
 * copió .env.example sin reemplazar el valor, queda el marcador de ejemplo.
 */
function claveConfigurada() {
  const k = (process.env.ANTHROPIC_API_KEY || '').trim();
  return k.length > 20 && !k.includes('...');
}

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

  // POST /api/login  -> única ruta abierta cuando hay clave configurada
  if (recurso === 'login' && req.method === 'POST') {
    if (!auth.authActiva()) return json(res, 200, { ok: true });

    const ip = auth.origen(req);
    if (auth.bloqueado(ip)) {
      return json(res, 429, {
        error: 'Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.',
      });
    }

    const { usuario, clave } = await leerJson(req);
    if (!auth.credencialesCorrectas(usuario, clave)) {
      auth.registrarFallo(ip);
      return json(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    }

    auth.limpiarIntentos(ip);
    res.setHeader('Set-Cookie', auth.cookieSesion(req, auth.crearToken()));
    return json(res, 200, { ok: true });
  }

  // POST /api/logout
  if (recurso === 'logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', auth.cookieBorrada(req));
    return json(res, 200, { ok: true });
  }

  // De acá en adelante hace falta sesión
  if (!auth.sesionValida(req)) {
    return json(res, 401, { error: 'Sesión expirada. Volvé a entrar.' });
  }

  // GET /api/estado
  if (recurso === 'estado' && req.method === 'GET') {
    return json(res, 200, {
      modelo: asistente.modeloEnUso(),
      vozLista: claveConfigurada(),
      conAcceso: auth.authActiva(),
    });
  }

  // GET /api/resumen  -> tarjetas y listas del dashboard
  if (recurso === 'resumen' && req.method === 'GET') {
    return json(res, 200, db.resumen());
  }

  // POST /api/asistente  -> el cerebro
  if (recurso === 'asistente' && req.method === 'POST') {
    if (!claveConfigurada()) {
      return json(res, 503, {
        error: 'Falta tu clave de Anthropic. Abrí el archivo .env y reemplazá ANTHROPIC_API_KEY por la clave real (empieza con sk-ant-).',
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

    if (req.method === 'GET' && id) {
      const fila = db.obtenerPorId(tabla, Number(id));
      return fila ? json(res, 200, fila) : json(res, 404, { error: 'No encontrado' });
    }

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

// Lo que se puede servir sin haber entrado: la propia pantalla de acceso y lo
// que necesita para verse bien.
const LIBRES = new Set(['/login.html', '/styles.css', '/icono.svg', '/manifest.webmanifest', '/favicon.ico']);

async function estatico(req, res, url) {
  let ruta = url.pathname === '/' ? '/index.html' : url.pathname;

  if (!auth.sesionValida(req) && !LIBRES.has(ruta)) {
    ruta = '/login.html'; // cualquier página lleva al acceso
  }

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
    // Un archivo con extensión que no existe es un 404 de verdad; así el
    // navegador puede reaccionar (por ejemplo, buscar el logo de respaldo).
    const ext = extname(destino);
    if (ext && ext !== '.html') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }

    // SPA: cualquier otra ruta desconocida devuelve el index (o el acceso)
    try {
      const respaldo = auth.sesionValida(req) ? 'index.html' : 'login.html';
      const html = await readFile(join(PUBLICO, respaldo));
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
  if (!claveConfigurada()) {
    console.log('  ⚠  Falta tu clave: abrí el archivo .env y pegá tu ANTHROPIC_API_KEY.');
  }
  console.log(
    auth.authActiva()
      ? `  ➜  acceso protegido · usuario: ${auth.usuarioConfigurado()}`
      : '  ⚠  SIN CONTRASEÑA: cualquiera que llegue a esta dirección ve tus datos.\n' +
        '     Está bien en tu computador; si la publicás, definí ARI_CLAVE.',
  );
  console.log('');
});
