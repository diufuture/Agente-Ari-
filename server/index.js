// Servidor HTTP de Clic Control / Ari.
// Sin frameworks: Node 22 trae todo lo necesario (http + sqlite + fetch).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// El arranque completo va dentro de una función async, no al nivel superior
// del módulo: algunos motores de Node de cPanel (LiteSpeed/lsnode.js) cargan
// este archivo con require(), que no admite top-level await en el módulo.
async function iniciar() {

const [db, tools, asistente, auth, xlsx, imprimir, remoto, trabajos] = await Promise.all([
  import('./db.js'),
  import('./tools.js'),
  import('./assistant.js'),
  import('./auth.js'),
  import('./xlsx.js'),
  import('./imprimir.js'),
  import('./remoto.js'),
  import('./trabajos.js'),
]);

const CARPETA_FOTOS = join(PUBLICO, 'uploads', 'productos');
mkdirSync(CARPETA_FOTOS, { recursive: true });

const CARPETA_MARCA = join(PUBLICO, 'uploads', 'marca');
mkdirSync(CARPETA_MARCA, { recursive: true });

const CARPETA_OFERTAS = join(PUBLICO, 'uploads', 'cotizaciones');
mkdirSync(CARPETA_OFERTAS, { recursive: true });

const CARPETA_FICHAS = join(PUBLICO, 'uploads', 'fichas');
mkdirSync(CARPETA_FICHAS, { recursive: true });

/**
 * Versión de la interfaz: cambia sola cuando cambia alguno de sus archivos.
 *
 * Va pegada a la dirección de app.js y styles.css. Sin esto, después de
 * actualizar el servidor había que entrar con Ctrl+Shift+R para ver los
 * cambios, y en la aplicación instalada en el Dock —que no tiene botón de
 * recargar— no había manera de forzarlo: se quedaba con la versión vieja para
 * siempre. Una dirección que el navegador nunca vio no la puede tener
 * guardada, así que se actualiza sola.
 */
const VERSION = (() => {
  const h = createHash('sha1');
  for (const f of ['app.js', 'foto.js', 'styles.css', 'index.html']) {
    try {
      const s = statSync(join(PUBLICO, f));
      h.update(`${f}:${s.size}:${Math.round(s.mtimeMs)}`);
    } catch { /* si falta alguno, la versión igual sale distinta */ }
  }
  return h.digest('hex').slice(0, 10);
})();

/**
 * ¿El proceso está corriendo código más viejo que el que hay en disco?
 *
 * Al actualizar en cPanel se extrae el ZIP y listo, pero Node sigue con el
 * código anterior cargado en memoria hasta que se lo reinicia. Los archivos
 * de la interfaz sí se leen de disco en cada pedido, así que se ve la pantalla
 * nueva contra un servidor viejo: aparecen botones que el servidor no sabe
 * atender, y el error que da no le dice a nadie qué está pasando.
 *
 * Comparar la fecha de los archivos del servidor contra el arranque del
 * proceso lo detecta solo.
 */
const ARRANQUE = Date.now();
const ARCHIVOS_SERVIDOR = ['index.js', 'db.js', 'tools.js', 'assistant.js', 'imprimir.js', 'remoto.js', 'xlsx.js', 'auth.js'];

function servidorDesactualizado() {
  const carpeta = join(RAIZ, 'server');
  for (const f of ARCHIVOS_SERVIDOR) {
    try {
      // Un margen de 5 segundos: los archivos que se extraen justo antes de
      // arrancar no cuentan como "más nuevos que el proceso".
      if (statSync(join(carpeta, f)).mtimeMs > ARRANQUE + 5000) return true;
    } catch { /* si falta alguno, no es este el problema */ }
  }
  return false;
}

// Cuántas filas de ejemplo se muestran al revisar una hoja antes de importarla.
// Tiene que coincidir con lo que pinta la interfaz.
const FILAS_DE_MUESTRA = 4;

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
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const json = (res, codigo, cuerpo) => {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
};

async function leerJson(req, limite = 1_000_000) {
  const trozos = [];
  let bytes = 0;
  for await (const t of req) {
    bytes += t.length;
    if (bytes > limite) throw new Error('Cuerpo demasiado grande');
    trozos.push(t);
  }
  if (!trozos.length) return {};
  return JSON.parse(Buffer.concat(trozos).toString('utf8'));
}

/** Decodifica un data URL o un base64 pelado y devuelve el Buffer. */
function decodificarBase64(texto) {
  const limpio = String(texto || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(limpio, 'base64');
}

const TIPOS_IMAGEN = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
const PESO_MAXIMO_IMAGEN = 5_000_000;
const PESO_MAXIMO_PDF = 12_000_000;

/** Una imagen que llega como data URL (archivo elegido o pegada). */
function leerImagenBase64(dato) {
  const m = String(dato || '').match(/^data:image\/(png|jpe?g|webp|gif);base64,/);
  if (!m) throw new Error('La imagen tiene que ser PNG, JPG, WEBP o GIF.');
  const buffer = decodificarBase64(dato);
  if (buffer.length > PESO_MAXIMO_IMAGEN) throw new Error('La imagen pesa demasiado (máximo 5MB).');
  return { buffer, ext: TIPOS_IMAGEN[m[1]] };
}

/**
 * Una imagen que llega como dirección web (la del sitio del fabricante, por
 * ejemplo). Se descarga acá y no en el navegador porque muchos sitios no
 * permiten que otra página lea sus imágenes.
 *
 * La dirección la escribe el dueño de la aplicación, pero igual se acota a
 * http/https y se rechazan las direcciones internas: una dirección pegada de
 * apuro no debería poder hacer que el servidor se consulte a sí mismo o a la
 * red del hosting.
 */
async function descargarImagen(url) {
  let destino;
  try {
    destino = new URL(String(url).trim());
  } catch {
    return Promise.reject(new Error('Esa no parece una dirección válida.'));
  }
  if (!/^https?:$/.test(destino.protocol)) {
    throw new Error('La dirección tiene que empezar con http o https.');
  }
  const host = destino.hostname.toLowerCase();
  const esInterna = host === 'localhost'
    || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || host.endsWith('.local') || host === '[::1]' || host === '::1';
  if (esInterna) throw new Error('Esa dirección es de la red interna, no de internet.');

  const corte = AbortSignal.timeout(12_000);
  let r;
  try {
    r = await fetch(destino, { signal: corte, redirect: 'follow' });
  } catch {
    throw new Error('No pude descargar esa imagen. Revisá la dirección o probá con otra.');
  }
  if (!r.ok) throw new Error(`El sitio respondió ${r.status}. Probá copiando la imagen y pegándola.`);

  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = TIPOS_IMAGEN[tipo.replace('image/', '')];
  if (!tipo.startsWith('image/') || !ext) {
    throw new Error('Esa dirección no es una imagen. Asegurate de copiar la dirección de la imagen, no la de la página.');
  }

  const buffer = Buffer.from(await r.arrayBuffer());
  if (!buffer.length) throw new Error('La imagen llegó vacía.');
  if (buffer.length > PESO_MAXIMO_IMAGEN) throw new Error('La imagen pesa demasiado (máximo 5MB).');
  return { buffer, ext };
}

/**
 * Deja la foto del producto en disco y borra la anterior si tenía otra
 * extensión: al achicarlas todas quedan en .webp, y sin esto el .jpg viejo
 * (el pesado, justamente) seguiría ocupando lugar para siempre.
 */
function guardarFoto(id, buffer, ext) {
  writeFileSync(join(CARPETA_FOTOS, `${id}.${ext}`), buffer);
  for (const otra of new Set(Object.values(TIPOS_IMAGEN))) {
    if (otra !== ext) rmSync(join(CARPETA_FOTOS, `${id}.${otra}`), { force: true });
  }
  return `/uploads/productos/${id}.${ext}`;
}

/** Cuánto ocupa en disco la foto de un producto (0 si ya no está el archivo). */
function pesoFoto(foto) {
  const nombre = String(foto || '').split('/').pop();
  if (!nombre || !/^\d+\.[a-z]+$/i.test(nombre)) return 0;
  try {
    return statSync(join(CARPETA_FOTOS, nombre)).size;
  } catch {
    return 0;
  }
}

/**
 * Trae una lista de precios desde su dirección y la cruza con el catálogo.
 *
 * Se apoya en la misma conciliación que la importación a mano, así que vale lo
 * mismo: lo cargado acá —la foto, las notas, el inventario— no se pisa, y lo
 * que ya no viene en la lista no se borra.
 *
 * Con `simular` sólo informa qué cambiaría. Sin eso, aplica y deja anotado
 * cuándo fue la última vez.
 */
async function sincronizarLista(lista, { simular = false } = {}) {
  const { filas } = await remoto.traerLista(lista.url, { hoja: lista.hoja });

  // Si no se guardó un mapeo confirmado, se vuelve a adivinar. La hoja es la
  // misma de siempre, así que en la práctica da igual; pero si alguien le
  // agrega una columna, esto la toma sin tener que reconfigurar nada.
  const mapeo = lista.mapeo ?? xlsx.sugerirMapeo(filas);
  const productos = xlsx.filasDesdeMapeo(filas, mapeo);

  // Una hoja vacía casi siempre significa que algo salió mal en el camino
  // (el enlace dejó de ser público, la pestaña cambió de nombre). Aplicar eso
  // con "descontinuar ausentes" prendido vaciaría el catálogo de un saque.
  if (!productos.length) {
    throw new Error(
      'La lista llegó sin ningún producto. Puede que el enlace haya dejado de '
      + 'ser público o que la hoja esté vacía; no toqué nada del catálogo.',
    );
  }

  const informe = db.conciliarProductos(lista.categoria || null, productos, {
    tipo: lista.tipo || null,
    manejaInventario: Boolean(lista.manejaInventario),
    descontinuarAusentes: Boolean(lista.descontinuarAusentes),
    simular,
  });
  delete informe.paraFoto;   // acá no hay fotos que pegar: el CSV no las trae

  if (!simular) {
    db.actualizarLista(lista.id, {
      ultima: new Date().toLocaleString('sv-SE'),
      ultimoInforme: {
        nuevos: informe.nuevos.length,
        actualizados: informe.actualizados.length,
        ausentes: informe.ausentes.length,
      },
    });
  }

  return { ...informe, total: productos.length, simulado: simular };
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

  // POST /api/enlace/cita -> el formulario de agendamiento de la web avisa que
  // alguien tomó un turno, y la cita aparece sola en la agenda.
  //
  // Va antes del muro de sesión porque quien avisa es un programa (el Apps
  // Script de la hoja), no una persona con el navegador abierto: se identifica
  // con el token de ARI_TOKEN_ENLACE en vez de con la cookie.
  if (recurso === 'enlace' && partes[1] === 'cita' && req.method === 'POST') {
    if (!auth.enlaceActivo()) {
      return json(res, 503, {
        error: 'El enlace con la web no está configurado. Definí ARI_TOKEN_ENLACE '
          + '(mínimo 16 caracteres) en las variables de entorno y reiniciá la aplicación.',
      });
    }

    // El mismo freno que el acceso normal: sin esto, el token se podría
    // adivinar a fuerza de intentos, y esta puerta escribe en la agenda.
    const ip = auth.origen(req);
    if (auth.bloqueado(ip)) {
      return json(res, 429, { error: 'Demasiados intentos fallidos. Esperá unos minutos.' });
    }
    if (!auth.tokenEnlaceValido(req)) {
      auth.registrarFallo(ip);
      return json(res, 401, { error: 'Token inválido.' });
    }
    auth.limpiarIntentos(ip);

    try {
      const { cita, creada } = db.registrarCitaExterna(await leerJson(req));
      // 200 y no 201 aunque sea nueva: quien avisa sólo necesita saber que
      // quedó anotada, y distinguir "creada" de "ya estaba" por el código de
      // respuesta invitaría a tratar un reintento como si fuera un error.
      return json(res, 200, { ok: true, creada, cita_id: cita.id, inicio: cita.inicio });
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
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
      // Para poder ver de un vistazo si la pantalla quedó al día después de
      // actualizar el servidor, sin tener que adivinar.
      version: VERSION,
      // Si se extrajo una versión nueva pero no se reinició Node.
      servidorViejo: servidorDesactualizado(),
    });
  }

  // GET /api/resumen  -> tarjetas y listas del dashboard
  if (recurso === 'resumen' && req.method === 'GET') {
    return json(res, 200, db.resumen());
  }

  // POST /api/cotizacion-en-curso -> abre o cierra la cotización que se está
  // dictando, desde los botones de la interfaz (por voz lo hacen los tools).
  if (recurso === 'cotizacion-en-curso' && req.method === 'POST') {
    const { id: idCot } = await leerJson(req);
    if (idCot) return json(res, 200, db.activarCotizacion(Number(idCot)));
    db.cerrarCotizacionActiva();
    return json(res, 200, { ok: true });
  }

  // POST /api/ajustes/logo -> el logo que encabeza las cotizaciones. Se sube
  // desde la pantalla de ajustes en vez de tener que dejar un archivo por FTP.
  if (recurso === 'ajustes' && partes[1] === 'logo') {
    if (req.method === 'POST') {
      const { imagen_base64 } = await leerJson(req, 8_000_000);
      let buffer;
      let ext;
      try {
        ({ buffer, ext } = leerImagenBase64(imagen_base64));
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
      writeFileSync(join(CARPETA_MARCA, `logo.${ext}`), buffer);
      for (const otra of new Set(Object.values(TIPOS_IMAGEN))) {
        if (otra !== ext) rmSync(join(CARPETA_MARCA, `logo.${otra}`), { force: true });
      }
      // La fecha en la dirección obliga al navegador a volver a pedirlo: si no,
      // se cambia el logo y se sigue viendo el anterior.
      return json(res, 200, db.guardarAjustes({ logo: `/uploads/marca/logo.${ext}?v=${Date.now()}` }));
    }
    if (req.method === 'DELETE') {
      for (const otra of new Set(Object.values(TIPOS_IMAGEN))) {
        rmSync(join(CARPETA_MARCA, `logo.${otra}`), { force: true });
      }
      return json(res, 200, db.guardarAjustes({ logo: '' }));
    }
  }

  // GET /api/cobros/pendientes -> todo lo que está por cobrar en un solo lugar:
  // los cobros sueltos y el saldo de las cotizaciones aprobadas, que son una
  // venta cerrada aunque no se haya hecho un cobro aparte.
  if (recurso === 'cobros' && partes[1] === 'pendientes' && req.method === 'GET') {
    const sueltos = db.consultar('cobros', { estado: 'pendiente', limite: 300 })
      .map((c) => ({ ...c, origen: 'cobro' }));
    const deCotizaciones = db.cobrosDeCotizaciones();
    return json(res, 200, {
      filas: [...sueltos, ...deCotizaciones]
        .sort((a, b) => String(a.vence_en || '9999').localeCompare(String(b.vence_en || '9999'))),
      total: [...sueltos, ...deCotizaciones].reduce((s, c) => s + (Number(c.monto) || 0), 0),
    });
  }

  // GET|PATCH /api/ajustes -> datos de la empresa que van en las impresiones
  if (recurso === 'ajustes') {
    if (req.method === 'GET') return json(res, 200, db.leerAjustes());
    if (req.method === 'PATCH' || req.method === 'PUT') {
      return json(res, 200, db.guardarAjustes(await leerJson(req)));
    }
  }

  // ---- Listas de precios que viven en línea -------------------------
  // La hoja se edita donde ya está (Google, OneDrive, Dropbox) y el sistema la
  // va a buscar. Acá sólo se guarda la dirección y cómo leerla.
  if (recurso === 'listas') {
    // POST /api/listas/probar -> baja la lista y propone cómo leerla, sin
    // guardar nada: es la vista previa antes de conectarla.
    if (partes[1] === 'probar' && req.method === 'POST') {
      const { url, hoja } = await leerJson(req);
      try {
        const { filas, formato, hoja: nombreHoja } = await remoto.traerLista(url, { hoja });
        const mapeo = xlsx.sugerirMapeo(filas);
        return json(res, 200, {
          formato,
          hoja: nombreHoja,
          direccion: remoto.direccionDeDescarga(url),
          totalFilas: filas.length,
          mapeo,
          // Sólo el encabezado y unas pocas filas: alcanza para confirmar el
          // mapeo y evita mandar la lista entera dos veces.
          muestra: filas.slice(0, Math.min(filas.length, (mapeo.filaInicioDatos || 0) + 5)),
          productos: xlsx.filasDesdeMapeo(filas, mapeo).length,
        });
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    // POST /api/listas/:id/sincronizar -> la trae y la cruza con el catálogo
    if (id && partes[2] === 'sincronizar' && req.method === 'POST') {
      const lista = db.leerListas().find((l) => Number(l.id) === Number(id));
      if (!lista) return json(res, 404, { error: 'Esa lista no está configurada.' });
      const { simular } = await leerJson(req).catch(() => ({}));
      try {
        return json(res, 200, await sincronizarLista(lista, { simular: Boolean(simular) }));
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    if (req.method === 'GET') return json(res, 200, { listas: db.leerListas() });

    if (req.method === 'POST') {
      const datos = await leerJson(req);
      try {
        remoto.validarDireccion(datos.url);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
      return json(res, 201, db.agregarLista(datos));
    }

    if (id && (req.method === 'PATCH' || req.method === 'PUT')) {
      const fila = db.actualizarLista(Number(id), await leerJson(req));
      return fila ? json(res, 200, fila) : json(res, 404, { error: 'No encontrada' });
    }

    if (id && req.method === 'DELETE') {
      return json(res, db.eliminarLista(Number(id)) ? 200 : 404, { ok: true });
    }
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

  // POST|DELETE /api/cotizaciones/:id/archivo -> la oferta ya hecha, en PDF.
  //
  // Muchas cotizaciones se arman por fuera y llegan listas. En vez de
  // retipearlas para poder seguirlas, se sube el PDF y la cotización queda
  // igual que cualquier otra: con su cliente, su valor, sus abonos y su saldo.
  if (recurso === 'cotizaciones' && id && partes[2] === 'archivo') {
    const cotizacionId = Number(id);
    if (!db.obtenerPorId('cotizaciones', cotizacionId)) {
      return json(res, 404, { error: 'Esa cotización no existe.' });
    }

    if (req.method === 'POST') {
      let cuerpo;
      try {
        cuerpo = await leerJson(req, 17_000_000);
      } catch {
        return json(res, 413, { error: 'Ese PDF pesa demasiado (máximo 12MB).' });
      }
      const buffer = decodificarBase64(cuerpo.archivo_base64);

      // Se mira el contenido, no el nombre ni lo que diga el navegador: un
      // archivo que se sirve desde el mismo dominio no puede ser cualquier
      // cosa con la extensión cambiada.
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return json(res, 400, { error: 'Eso no es un PDF. Subí el archivo tal como lo generaste.' });
      }
      if (buffer.length > PESO_MAXIMO_PDF) {
        return json(res, 400, { error: 'Ese PDF pesa demasiado (máximo 12MB).' });
      }

      writeFileSync(join(CARPETA_OFERTAS, `${cotizacionId}.pdf`), buffer);
      const fila = db.actualizar('cotizaciones', cotizacionId, {
        archivo: `/uploads/cotizaciones/${cotizacionId}.pdf?v=${Date.now()}`,
        archivo_nombre: String(cuerpo.nombre || '').slice(0, 120) || 'cotizacion.pdf',
      });
      return json(res, 200, fila);
    }

    if (req.method === 'DELETE') {
      rmSync(join(CARPETA_OFERTAS, `${cotizacionId}.pdf`), { force: true });
      return json(res, 200, db.actualizar('cotizaciones', cotizacionId, { archivo: '', archivo_nombre: '' }));
    }
  }

  // POST|DELETE /api/cotizaciones/:id/cerrar -> la saca de la lista de trabajo
  // y la deja en el historial del cliente. Sólo si no falta plata.
  if (recurso === 'cotizaciones' && id && partes[2] === 'cerrar') {
    try {
      if (req.method === 'POST') return json(res, 200, db.cerrarCotizacion(Number(id)));
      if (req.method === 'DELETE') return json(res, 200, db.reabrirCotizacion(Number(id)));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  // GET|POST /api/cotizaciones/:id/items -> renglones de una cotización
  if (recurso === 'cotizaciones' && id && partes[2] === 'items') {
    const cotizacionId = Number(id);

    if (req.method === 'GET') {
      return json(res, 200, {
        filas: db.consultar('cotizacion_items', { cotizacion_id: cotizacionId }),
        totales: db.totalesCotizacion(cotizacionId),
      });
    }

    if (req.method === 'POST') {
      try {
        const item = db.agregarItem(cotizacionId, await leerJson(req));
        return json(res, 201, item);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }
  }

  // PATCH|DELETE /api/cotizacion_items/:id -> edita o quita un renglón.
  // Van por su propia ruta, no por el CRUD genérico, porque después de
  // tocarlos hay que recalcular el total de la cotización.
  if (recurso === 'cotizacion_items' && id) {
    if (req.method === 'PATCH' || req.method === 'PUT') {
      try {
        const fila = db.actualizarItem(Number(id), await leerJson(req));
        if (!fila) return json(res, 404, { error: 'No encontrado' });
        return json(res, 200, fila);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }
    if (req.method === 'DELETE') {
      return json(res, db.eliminarItem(Number(id)) ? 200 : 404, { ok: true });
    }
  }

  // POST /api/productos/analizar -> lee un .xlsx subido y sugiere cómo
  // mapear sus columnas, para que el usuario lo confirme antes de importar.
  if (recurso === 'productos' && partes[1] === 'analizar' && req.method === 'POST') {
    try {
      const { archivo_base64 } = await leerJson(req, 25_000_000);
      const buffer = decodificarBase64(archivo_base64);
      const { hojas } = await trabajos.leerXlsxEnSegundoPlano(buffer, { conImagenes: true });

      const resultado = hojas.map((h) => {
        const mapeo = xlsx.sugerirMapeo(h.filas);

        // Las fotos de las filas que se ven en la vista previa, para poder
        // confirmar que cada una cae en el producto correcto antes de
        // importar. Sólo esas: mandar el resto sería mandar el Excel entero.
        const muestra = {};
        for (let f = mapeo.filaInicioDatos; f < mapeo.filaInicioDatos + FILAS_DE_MUESTRA; f++) {
          const img = h.imagenes.get(f);
          if (img) muestra[f] = `data:image/${img.extension};base64,${img.datos.toString('base64')}`;
        }

        return {
          nombre: h.nombre,
          filas: h.filas,
          mapeo,
          // Cuántas hay en total; las demás se sacan recién al importar.
          conImagenes: h.imagenes.size,
          // Las que están en el archivo pero no se pudieron atribuir a ninguna
          // fila: van a faltar en el PDF y conviene saberlo antes.
          imagenesSinUbicar: h.imagenes.sinUbicar || 0,
          imagenesMuestra: muestra,
        };
      });
      return json(res, 200, { hojas: resultado });
    } catch (err) {
      return json(res, 400, { error: `No pude leer ese archivo: ${err.message}` });
    }
  }

  // POST /api/productos/importar -> cruza la lista con el catálogo. Con
  // `simular: true` sólo informa qué pasaría, sin tocar nada: así el usuario
  // ve qué se va a actualizar antes de aceptarlo.
  if (recurso === 'productos' && partes[1] === 'importar' && req.method === 'POST') {
    const { categoria, tipo, filas, maneja_inventario, descontinuar_ausentes, simular,
      archivo_base64, hoja, traer_fotos } = await leerJson(req, 25_000_000);
    if (!Array.isArray(filas)) return json(res, 400, { error: 'Faltan las filas a importar.' });
    try {
      const informe = db.conciliarProductos(categoria || null, filas, {
        tipo: tipo || null,
        manejaInventario: Boolean(maneja_inventario),
        descontinuarAusentes: Boolean(descontinuar_ausentes),
        simular: Boolean(simular),
      });

      // Las fotos vienen ancladas a una fila del Excel, así que se pegan a los
      // productos que salieron de esa misma fila. Sólo a los que no tienen
      // foto: una que se haya subido a mano vale más que la del proveedor.
      informe.fotos = 0;
      informe.fotosConservadas = 0;
      informe.sinFoto = [];
      if (!simular && traer_fotos && archivo_base64) {
        const libro = await trabajos.leerXlsxEnSegundoPlano(decodificarBase64(archivo_base64), { conImagenes: true });
        const imagenes = libro.hojas[Number(hoja) || 0]?.imagenes ?? new Map();

        for (const p of informe.paraFoto) {
          if (p.tieneFoto) { informe.fotosConservadas += 1; continue; }
          if (p.fila === null || !imagenes.has(p.fila)) {
            // Quedó sin foto: hay que poder verlo acá y no en el PDF ya enviado.
            const prod = db.obtenerPorId('productos', p.id);
            if (prod) informe.sinFoto.push({ referencia: prod.referencia, descripcion: prod.descripcion });
            continue;
          }
          const img = imagenes.get(p.fila);
          db.actualizar('productos', p.id, { foto: guardarFoto(p.id, img.datos, img.extension) });
          informe.fotos += 1;
        }
      }
      delete informe.paraFoto; // detalle interno, no hace falta en el navegador

      return json(res, 200, informe);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  // GET /api/productos/categorias -> para sugerir nombres al importar
  if (recurso === 'productos' && partes[1] === 'categorias' && req.method === 'GET') {
    return json(res, 200, { categorias: db.categoriasProductos() });
  }

  // GET /api/productos/tipos -> las etiquetas ya usadas, con cuántos hay de
  // cada una, para armar los filtros del catálogo.
  if (recurso === 'productos' && partes[1] === 'tipos' && req.method === 'GET') {
    return json(res, 200, { tipos: db.tiposProductos(), sinTipo: db.productosSinTipo() });
  }

  // POST /api/productos/tipos -> etiqueta de una vez a los que están sin tipo,
  // usando su categoría, que al importar se llenó con el nombre de la pestaña.
  if (recurso === 'productos' && partes[1] === 'tipos' && req.method === 'POST') {
    return json(res, 200, { etiquetados: db.etiquetarTipoDesdeCategoria() });
  }

  // POST|DELETE /api/productos/:id/ficha -> la ficha técnica del fabricante.
  if (recurso === 'productos' && id && partes[2] === 'ficha') {
    const productoId = Number(id);
    if (!db.obtenerPorId('productos', productoId)) return json(res, 404, { error: 'No encontrado' });

    if (req.method === 'POST') {
      let cuerpo;
      try {
        cuerpo = await leerJson(req, 17_000_000);
      } catch {
        return json(res, 413, { error: 'Esa ficha pesa demasiado (máximo 12MB).' });
      }
      const buffer = decodificarBase64(cuerpo.archivo_base64);
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return json(res, 400, { error: 'La ficha técnica tiene que ser un PDF.' });
      }
      if (buffer.length > PESO_MAXIMO_PDF) {
        return json(res, 400, { error: 'Esa ficha pesa demasiado (máximo 12MB).' });
      }
      writeFileSync(join(CARPETA_FICHAS, `${productoId}.pdf`), buffer);
      return json(res, 200, db.actualizar('productos', productoId, {
        ficha: `/uploads/fichas/${productoId}.pdf?v=${Date.now()}`,
        ficha_nombre: String(cuerpo.nombre || '').slice(0, 120) || 'ficha.pdf',
      }));
    }

    if (req.method === 'DELETE') {
      rmSync(join(CARPETA_FICHAS, `${productoId}.pdf`), { force: true });
      return json(res, 200, db.actualizar('productos', productoId, { ficha: '', ficha_nombre: '' }));
    }
  }

  // POST /api/productos/:id/foto -> pone la foto de un producto. Acepta la
  // imagen en sí (archivo o pegada del portapapeles) o su dirección en la web,
  // que es lo cómodo cuando la lista del proveedor vino sin fotos.
  if (recurso === 'productos' && id && partes[2] === 'foto' && req.method === 'POST') {
    const producto = db.obtenerPorId('productos', Number(id));
    if (!producto) return json(res, 404, { error: 'No encontrado' });

    const { imagen_base64, imagen_url } = await leerJson(req, 8_000_000);

    let buffer;
    let ext;
    try {
      ({ buffer, ext } = imagen_url
        ? await descargarImagen(imagen_url)
        : leerImagenBase64(imagen_base64));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    const foto = guardarFoto(Number(id), buffer, ext);
    const fila = db.actualizar('productos', Number(id), { foto });
    return json(res, 200, { ...fila, bytes: buffer.length });
  }

  // GET /api/productos/fotos -> qué foto tiene cada producto y cuánto ocupa.
  // Lo usa el gestor de fotos del navegador para saber cuáles vale la pena
  // achicar; las achica ahí (con el canvas) y las vuelve a subir.
  if (recurso === 'productos' && partes[1] === 'fotos' && req.method === 'GET') {
    const fotos = db.productosConFoto()
      .map((p) => ({ id: p.id, descripcion: p.descripcion, foto: p.foto, bytes: pesoFoto(p.foto) }));
    return json(res, 200, {
      fotos,
      total: fotos.reduce((s, f) => s + f.bytes, 0),
    });
  }

  // CRUD manual sobre las entidades (para editar a mano en la interfaz)
  if (ENTIDADES_VALIDAS.has(recurso)) {
    const tabla = db.ENTIDADES[recurso].tabla;

    // /api/cotizaciones/3/loquesea no es "crear una cotización": es una ruta
    // que este servidor no conoce. Sin esto caía en el alta genérica y
    // respondía "no recibí ningún dato para guardar", que no le dice a nadie
    // que lo que pasa es que el servidor está viejo.
    if (partes[2]) {
      return json(res, 404, {
        error: `Esta versión del servidor no conoce /${recurso}/${id}/${partes[2]}. `
          + 'Si acabás de actualizar, reiniciá la aplicación en cPanel.',
      });
    }

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
        const fila = db.insertar(tabla, datos);
        // Un abono significa que el cliente aceptó la oferta: pasa a aprobada
        // sola, así aparece en los cobros sin tener que marcarla aparte.
        if (recurso === 'abonos' && fila.cotizacion_id) db.trasAbono(fila.cotizacion_id);
        return json(res, 201, fila);
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const datos = await leerJson(req);
      delete datos.id;
      delete datos.cliente;
      // Campos calculados: llegan de vuelta al guardar una fila que se leyó
      // con ellos, pero no son columnas y romperían el UPDATE.
      for (const c of ['abonado', 'saldo', 'subtotal', 'n_items', 'stock', 'total', 'producto', 'cotizacion']) {
        delete datos[c];
      }
      try {
        let fila = db.actualizar(tabla, Number(id), datos);
        if (!fila) return json(res, 404, { error: 'No encontrado' });
        if (tabla === 'cotizaciones') {
          fila = db.recalcularCotizacion(Number(id)) ?? fila; // los porcentajes cambian el total
          // Aprobarla saca sus productos propios de la bodega; desaprobarla los devuelve.
          const { descontados } = db.sincronizarInventario(Number(id));
          if (descontados.length) fila.descontadosDelInventario = descontados;
        }
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
    let contenido = await readFile(destino);
    const esHtml = extname(destino) === '.html';

    // La página se reescribe al vuelo para que app.js y styles.css lleven la
    // versión pegada a la dirección. Una versión nueva es una dirección nueva,
    // y una dirección que el navegador nunca vio no la puede tener guardada.
    if (esHtml) {
      contenido = Buffer.from(
        contenido.toString('utf8').replace(/(["'])\/(app|foto)\.js\1/g, `$1/$2.js?v=${VERSION}$1`)
          .replace(/(["'])\/styles\.css\1/g, `$1/styles.css?v=${VERSION}$1`),
      );
    }
    // app.js importa ./foto.js, y esa dirección se resuelve sin la parte de
    // la versión. Se le pega acá, o el módulo quedaría cacheado aparte.
    if (ruta === '/app.js') {
      contenido = Buffer.from(contenido.toString('utf8').replace("'./foto.js'", `'./foto.js?v=${VERSION}'`));
    }

    const cabeceras = {
      'Content-Type': MIME[extname(destino)] || 'application/octet-stream',
      // La página nunca se guarda: es la que trae las direcciones nuevas.
      // Lo demás se revalida, y con ETag eso cuesta una respuesta vacía.
      'Cache-Control': esHtml ? 'no-store, must-revalidate' : 'no-cache',
    };

    if (!esHtml) {
      const etag = `W/"${createHash('sha1').update(contenido).digest('hex').slice(0, 16)}"`;
      cabeceras.ETag = etag;
      // Sin validador, "no-cache" le pide al navegador que revalide contra
      // nada, y algunos se quedan con la copia vieja para siempre. Con ETag la
      // pregunta tiene respuesta: 304 si no cambió, 200 con lo nuevo si sí.
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, cabeceras).end();
        return;
      }
    }

    // Lo que subió el usuario se sirve con el tipo que le corresponde y nada
    // más: sin dejar que el navegador adivine otro, y sin permitir que se
    // muestre embebido desde otra página.
    if (ruta.startsWith('/uploads/')) {
      cabeceras['X-Content-Type-Options'] = 'nosniff';
      cabeceras['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'self'";
    }
    res.writeHead(200, cabeceras);
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
      const html = (await readFile(join(PUBLICO, respaldo))).toString('utf8')
        .replace(/(["'])\/(app|foto)\.js\1/g, `$1/$2.js?v=${VERSION}$1`)
        .replace(/(["'])\/styles\.css\1/g, `$1/styles.css?v=${VERSION}$1`);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store, must-revalidate' });
      res.end(html);
    } catch {
      res.writeHead(404).end('No encontrado');
    }
  }
}

/* ------------------------------------------------------------------ */

/**
 * GET /imprimir/cotizacion/:id -> página suelta lista para "Guardar como PDF".
 * Va fuera de /api porque es una página que se abre en una pestaña, no un
 * recurso JSON; pero pide sesión igual que todo lo demás.
 */
async function paginaImpresion(req, res, url) {
  if (!auth.sesionValida(req)) {
    res.writeHead(302, { Location: '/login.html' }).end();
    return;
  }

  const id = Number(url.pathname.split('/').filter(Boolean)[2]);
  const html = Number.isFinite(id) ? imprimir.paginaCotizacion(id) : null;

  if (!html) {
    res.writeHead(404, { 'Content-Type': MIME['.html'] });
    res.end('<p style="font:16px system-ui;padding:40px">No encontré esa cotización.</p>');
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
  res.end(html);
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api')) await api(req, res, url);
    else if (url.pathname.startsWith('/imprimir/')) await paginaImpresion(req, res, url);
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

} // fin de iniciar()

iniciar().catch((err) => {
  console.error('[servidor] no pudo iniciar:', err);
  process.exit(1);
});
