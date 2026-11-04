/**
 * Listas de precios que viven en línea.
 *
 * En vez de exportar el Excel y subirlo cada vez, la lista se edita donde ya
 * está —una hoja de Google, un archivo en OneDrive o en Dropbox— y el sistema
 * la va a buscar. Lo que se guarda acá es la dirección; el archivo sigue
 * siendo del negocio y se puede seguir editando como siempre.
 *
 * No hace falta ninguna cuenta ni permiso especial: alcanza con que la hoja
 * esté publicada o compartida por enlace. Eso también significa que cualquiera
 * con la dirección puede leerla, así que conviene que sea una lista de precios
 * y no algo reservado.
 */

import { leerXlsxEnSegundoPlano } from './trabajos.js';

/**
 * Direcciones que se rechazan antes de salir a la red.
 *
 * La dirección la escribe el dueño de la aplicación, pero una pegada de apuro
 * no debería poder hacer que el servidor se consulte a sí mismo ni recorra la
 * red interna del hosting.
 */
export function validarDireccion(url) {
  let destino;
  try {
    destino = new URL(String(url).trim());
  } catch {
    throw new Error('Esa no parece una dirección válida.');
  }
  if (!/^https?:$/.test(destino.protocol)) {
    throw new Error('La dirección tiene que empezar con http o https.');
  }
  const host = destino.hostname.toLowerCase();
  const interna = host === 'localhost'
    || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || host.endsWith('.local') || host === '[::1]' || host === '::1';
  if (interna) throw new Error('Esa dirección es de la red interna, no de internet.');
  return destino;
}

/**
 * Deja la dirección en la forma que devuelve datos en vez de una página web.
 *
 * Lo que uno copia del navegador es la dirección para mirar la hoja, no para
 * descargarla: pegada tal cual devuelve HTML y no se entiende nada. Acá se
 * traduce sola, que es lo que uno esperaría que pasara.
 */
export function direccionDeDescarga(url) {
  const u = validarDireccion(url);

  // Google Sheets: .../d/<id>/edit#gid=123  ->  .../d/<id>/export?format=csv&gid=123
  const hoja = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (u.hostname.endsWith('docs.google.com') && hoja && !u.pathname.includes('/e/')) {
    const gid = (u.hash.match(/gid=(\d+)/) || u.searchParams.get('gid') && [, u.searchParams.get('gid')] || [])[1];
    const salida = new URL(`https://docs.google.com/spreadsheets/d/${hoja[1]}/export`);
    salida.searchParams.set('format', 'csv');
    if (gid) salida.searchParams.set('gid', gid);
    return salida.toString();
  }

  // Dropbox: el enlace para compartir muestra una página; dl=1 baja el archivo.
  if (u.hostname.endsWith('dropbox.com')) {
    u.searchParams.set('dl', '1');
    return u.toString();
  }

  // OneDrive / SharePoint: download=1 hace lo mismo.
  if (/(1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/.test(u.hostname)) {
    u.searchParams.set('download', '1');
    return u.toString();
  }

  return u.toString();
}

const PESO_MAXIMO = 25_000_000;

/**
 * Última descarga de cada dirección, por poco tiempo.
 *
 * "Probar" una lista antes de guardarla se hace a los ponchazos: se pega la
 * dirección, se mira la vista previa, se ajusta el mapeo, se prueba nuevo...
 * Sin esto cada clic vuelve a bajar la hoja entera de Google/Dropbox/
 * OneDrive, que es la parte más lenta de todo el proceso y la que menos
 * depende de nosotros. El TTL es corto a propósito: si el dueño edita la
 * hoja y prueba de nuevo en el mismo minuto, tiene que ver el cambio, no una
 * copia vieja.
 */
const TTL_DESCARGA_MS = 20_000;
const cacheDescargas = new Map();

/** Baja el archivo que hay en esa dirección (o lo sirve de la caché reciente). */
export async function descargar(url) {
  const destino = direccionDeDescarga(url);
  validarDireccion(destino);

  const enCache = cacheDescargas.get(destino);
  if (enCache && enCache.expira > Date.now()) return enCache.buffer;

  let r;
  try {
    r = await fetch(destino, { signal: AbortSignal.timeout(25_000), redirect: 'follow' });
  } catch {
    throw new Error('No pude llegar a esa dirección. Revisá que el enlace ande desde el navegador.');
  }
  if (!r.ok) {
    throw new Error(r.status === 404
      ? 'Esa dirección no existe o la hoja no está compartida.'
      : `El sitio respondió ${r.status}. Revisá que la hoja esté publicada o compartida por enlace.`);
  }

  const buffer = Buffer.from(await r.arrayBuffer());
  if (!buffer.length) throw new Error('El archivo llegó vacío.');
  if (buffer.length > PESO_MAXIMO) throw new Error('El archivo pesa demasiado (máximo 25MB).');

  cacheDescargas.set(destino, { buffer, expira: Date.now() + TTL_DESCARGA_MS });
  return buffer;
}

/**
 * Separa una línea de CSV respetando las comillas: un campo entre comillas
 * puede tener el separador adentro, y dos comillas seguidas son una comilla.
 */
function partirCsv(texto, separador) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else entreComillas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') { entreComillas = true; continue; }
    if (c === separador) { fila.push(campo); campo = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      continue;
    }
    campo += c;
  }

  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/**
 * '1.234.567,89' y '1,234,567.89' terminan siendo el mismo número.
 *
 * El punto y la coma son ambiguos: en la lista de acá `98.500` son noventa y
 * ocho mil quinientos, y en una lista en inglés serían noventa y ocho con
 * cinco. Lo que los distingue es que el separador de miles agrupa siempre de a
 * tres dígitos exactos, así que `98.500` es un miles y `98.5` un decimal.
 */
function aNumero(v) {
  const s = String(v).trim();
  if (!s || !/^-?[\d.,\s$]+%?$/.test(s) || !/\d/.test(s)) return null;
  const limpio = s.replace(/[\s$%]/g, '');

  const comas = (limpio.match(/,/g) || []).length;
  const puntos = (limpio.match(/\./g) || []).length;

  let normal;
  if (comas && puntos) {
    // Están los dos: el último es el decimal y el otro agrupa los miles.
    normal = limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
      ? limpio.replace(/\./g, '').replace(',', '.')
      : limpio.replace(/,/g, '');
  } else if (comas || puntos) {
    const sep = comas ? ',' : '.';
    const veces = comas || puntos;
    const despues = limpio.length - limpio.lastIndexOf(sep) - 1;
    // Repetido, o seguido de exactamente tres dígitos: agrupa miles.
    normal = veces > 1 || despues === 3
      ? limpio.split(sep).join('')
      : limpio.replace(sep, '.');
  } else {
    normal = limpio;
  }

  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee un CSV a la misma forma que devuelve el lector de Excel: un arreglo de
 * filas, cada una un arreglo de celdas con texto, número o null. Así el resto
 * del importador no tiene que enterarse de por dónde llegó la lista.
 */
export function leerCsv(texto) {
  const limpio = String(texto).replace(/^﻿/, '');   // marca de orden de bytes

  // Los exportadores en español suelen usar punto y coma, porque la coma ya
  // está ocupada como separador decimal. Se decide con la primera línea.
  const primera = limpio.slice(0, limpio.search(/[\r\n]/) + 1 || limpio.length);
  const separador = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';

  return partirCsv(limpio, separador).map((fila) => fila.map((celda) => {
    const s = celda.trim();
    if (!s) return null;
    const n = aNumero(s);
    return n === null ? s : n;
  }));
}

/** ¿Es un .xlsx (un zip) o texto plano? */
const esZip = (buffer) =>
  buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;

/**
 * Trae la lista de esa dirección y la devuelve como filas, venga en el formato
 * que venga.
 *
 * @returns {Promise<{filas: any[][], formato: string, hoja: string|null}>}
 */
export async function traerLista(url, { hoja = 0 } = {}) {
  const buffer = await descargar(url);

  if (esZip(buffer)) {
    const { hojas } = await leerXlsxEnSegundoPlano(buffer, { conImagenes: false });
    if (!hojas.length) throw new Error('Ese archivo de Excel no tiene ninguna hoja.');
    const elegida = hojas[Number(hoja) || 0] ?? hojas[0];
    return { filas: elegida.filas, formato: 'xlsx', hoja: elegida.nombre };
  }

  const texto = buffer.toString('utf8');
  if (/^\s*<(!doctype|html)/i.test(texto)) {
    throw new Error(
      'Esa dirección devolvió una página web, no la lista. En Google Sheets usá '
      + 'Archivo → Compartir → Publicar en la web → CSV, y pegá esa dirección.',
    );
  }
  return { filas: leerCsv(texto), formato: 'csv', hoja: null };
}
