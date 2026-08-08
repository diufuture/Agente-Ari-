// Lector mínimo de archivos .xlsx, sin dependencias externas: sólo lo que
// necesita el importador de listas de precios (texto y números de cada
// celda, hoja por hoja). No interpreta fórmulas, imágenes ni estilos.
//
// Un .xlsx es un .zip con archivos XML adentro. Node no trae un lector de
// zip, pero sí trae inflateRawSync (node:zlib), que es lo único que hace
// falta para descomprimir las entradas (DEFLATE es el método que usa Excel).

import { inflateRawSync } from 'node:zlib';

const FIRMA_EOCD = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;

function abrirZip(buffer) {
  let eocd = -1;
  const desde = Math.max(0, buffer.length - 22 - 65536);
  for (let i = buffer.length - 22; i >= desde; i--) {
    if (buffer.readUInt32LE(i) === FIRMA_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('No es un archivo .xlsx válido (no se encontró el índice del zip).');

  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const archivos = new Map();

  for (let i = 0; i < totalEntradas; i++) {
    if (buffer.readUInt32LE(offset) !== FIRMA_CENTRAL) break;
    const metodo = buffer.readUInt16LE(offset + 10);
    const comprimido = buffer.readUInt32LE(offset + 20);
    const nombreLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const comentarioLen = buffer.readUInt16LE(offset + 32);
    const offsetLocal = buffer.readUInt32LE(offset + 42);
    const nombre = buffer.toString('utf8', offset + 46, offset + 46 + nombreLen);

    archivos.set(nombre, { metodo, comprimido, offsetLocal });
    offset += 46 + nombreLen + extraLen + comentarioLen;
  }

  return {
    leer(nombre) {
      const e = archivos.get(nombre);
      if (!e) return null;
      const nombreLen = buffer.readUInt16LE(e.offsetLocal + 26);
      const extraLen = buffer.readUInt16LE(e.offsetLocal + 28);
      const inicio = e.offsetLocal + 30 + nombreLen + extraLen;
      const datos = buffer.subarray(inicio, inicio + e.comprimido);
      if (e.metodo === 0) return datos;
      if (e.metodo === 8) return inflateRawSync(datos);
      throw new Error(`Compresión no soportada (${e.metodo}) en ${nombre}.`);
    },
  };
}

const textoXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function columnaAIndice(letras) {
  let col = 0;
  for (const ch of letras) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col - 1;
}

/** Cada atributo se busca por su cuenta: el orden en que Excel los escribe no está garantizado. */
function atributo(texto, nombre) {
  const m = texto.match(new RegExp(`\\b${nombre}="([^"]*)"`));
  return m ? m[1] : null;
}

function leerSharedStrings(xml) {
  if (!xml) return [];
  const bloques = xml.match(/<si>[\s\S]*?<\/si>/g) || [];
  return bloques.map((bloque) => {
    const partes = [...bloque.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => textoXml(m[1]));
    return partes.join('');
  });
}

const MAX_COLUMNAS = 500; // celdas fantasma más allá de esto se ignoran

function leerHoja(xml, sharedStrings) {
  const filasPorNumero = new Map();
  const reRow = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let mRow;
  let contador = 0;

  while ((mRow = reRow.exec(xml))) {
    contador += 1;
    const numFila = Number(atributo(mRow[1], 'r')) || contador;
    const contenido = mRow[2];
    const fila = [];

    const reCell = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let mCell;
    while ((mCell = reCell.exec(contenido))) {
      const cAttrs = mCell[1];
      const cContenido = mCell[2] || '';
      const ref = atributo(cAttrs, 'r');
      if (!ref) continue;
      const letras = ref.match(/^[A-Z]+/)?.[0];
      if (!letras) continue;
      const col = columnaAIndice(letras);
      if (col < 0 || col > MAX_COLUMNAS) continue;

      const tipo = atributo(cAttrs, 't') || 'n';
      const vM = cContenido.match(/<v>([\s\S]*?)<\/v>/);
      const vRaw = vM ? textoXml(vM[1]) : null;

      let valor = null;
      if (tipo === 's') {
        valor = vRaw !== null ? (sharedStrings[Number(vRaw)] ?? '') : '';
      } else if (tipo === 'inlineStr') {
        const isM = cContenido.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        valor = isM ? textoXml(isM[1]) : '';
      } else if (tipo === 'str') {
        valor = vRaw ?? '';
      } else if (tipo === 'b') {
        valor = vRaw === '1';
      } else if (vRaw !== null && vRaw !== '') {
        valor = Number(vRaw);
      }
      fila[col] = valor;
    }
    filasPorNumero.set(numFila, fila);
  }

  const maxFila = Math.max(0, ...filasPorNumero.keys());
  const resultado = [];
  for (let i = 1; i <= maxFila; i++) resultado.push(filasPorNumero.get(i) || []);
  return resultado;
}

function relaciones(xml) {
  const mapa = new Map();
  if (!xml) return mapa;
  for (const m of xml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = atributo(m[0], 'Id');
    const target = atributo(m[0], 'Target');
    if (id && target) mapa.set(id, target);
  }
  return mapa;
}

/** Resuelve un Target de rels (que puede traer '../') contra su carpeta. */
function rutaRelativa(desdeCarpeta, target) {
  const partes = `${desdeCarpeta}/${target}`.split('/');
  const pila = [];
  for (const p of partes) {
    if (!p || p === '.') continue;
    if (p === '..') pila.pop();
    else pila.push(p);
  }
  return pila.join('/');
}

const EXTENSIONES_IMAGEN = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp' };

/**
 * Las fotos de una hoja, con la fila a la que están ancladas.
 *
 * En un .xlsx las imágenes no viven en las celdas: son objetos flotantes que
 * cuelgan de un "dibujo" y guardan a qué fila y columna están pegados. Hay que
 * seguir tres saltos: hoja -> dibujo -> imagen. Como las listas de precios
 * ponen la foto del producto sobre su fila, esa fila es la que la vincula con
 * el producto.
 *
 * @returns {Map<number, {datos: Buffer, extension: string}>} fila (0-indexada) -> imagen
 */
function imagenesDeHoja(zip, rutaHoja) {
  const porFila = new Map();

  const carpetaHoja = rutaHoja.slice(0, rutaHoja.lastIndexOf('/'));
  const nombreHoja = rutaHoja.slice(rutaHoja.lastIndexOf('/') + 1);
  const relsHoja = relaciones(
    zip.leer(`${carpetaHoja}/_rels/${nombreHoja}.rels`)?.toString('utf8'),
  );

  for (const [, target] of relsHoja) {
    if (!/drawings?\/.*\.xml$/i.test(target)) continue;

    const rutaDibujo = rutaRelativa(carpetaHoja, target);
    const dibujoXml = zip.leer(rutaDibujo)?.toString('utf8');
    if (!dibujoXml) continue;

    const carpetaDibujo = rutaDibujo.slice(0, rutaDibujo.lastIndexOf('/'));
    const nombreDibujo = rutaDibujo.slice(rutaDibujo.lastIndexOf('/') + 1);
    const relsDibujo = relaciones(
      zip.leer(`${carpetaDibujo}/_rels/${nombreDibujo}.rels`)?.toString('utf8'),
    );

    // Cada anclaje trae la fila de arranque y la imagen que le corresponde.
    for (const anclaje of dibujoXml.matchAll(/<xdr:(?:one|two)CellAnchor[\s\S]*?<\/xdr:(?:one|two)CellAnchor>/g)) {
      const bloque = anclaje[0];
      const fila = bloque.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
      const blip = bloque.match(/<a:blip[^>]*r:embed="([^"]+)"/);
      if (!fila || !blip) continue;

      const destino = relsDibujo.get(blip[1]);
      if (!destino) continue;

      const rutaImagen = rutaRelativa(carpetaDibujo, destino);
      const datos = zip.leer(rutaImagen);
      if (!datos) continue;

      const ext = EXTENSIONES_IMAGEN[(rutaImagen.split('.').pop() || '').toLowerCase()];
      if (!ext) continue;

      const numeroFila = Number(fila[1]);
      // Si hay varias sobre la misma fila, se queda la primera.
      if (!porFila.has(numeroFila)) porFila.set(numeroFila, { datos, extension: ext });
    }
  }

  return porFila;
}

/**
 * Lee un .xlsx completo. Devuelve { hojas: [{ nombre, filas, imagenes }] }, en
 * el mismo orden en que aparecen en el libro. `filas` es un arreglo de
 * arreglos (fila -> columna, 0-indexado), con texto, número o null en cada
 * celda. `imagenes` sólo se llena si se piden: pesan, y para adivinar el
 * mapeo de columnas no hacen falta.
 */
export function leerXlsx(buffer, { conImagenes = false } = {}) {
  const zip = abrirZip(buffer);

  const wbXml = zip.leer('xl/workbook.xml')?.toString('utf8');
  if (!wbXml) throw new Error('El archivo no parece un .xlsx válido (falta xl/workbook.xml).');

  const rels = relaciones(zip.leer('xl/_rels/workbook.xml.rels')?.toString('utf8'));
  const sharedStrings = leerSharedStrings(zip.leer('xl/sharedStrings.xml')?.toString('utf8'));

  const hojas = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const nombre = atributo(m[0], 'name');
    const rid = atributo(m[0], 'r:id');
    if (!nombre || !rid) continue;
    let destino = rels.get(rid);
    if (!destino) continue;
    destino = destino.replace(/^\/?/, '');
    if (!destino.startsWith('xl/')) destino = `xl/${destino}`;

    const hojaXml = zip.leer(destino)?.toString('utf8');
    if (!hojaXml) continue;
    hojas.push({
      nombre,
      filas: leerHoja(hojaXml, sharedStrings),
      imagenes: conImagenes ? imagenesDeHoja(zip, destino) : new Map(),
    });
  }

  return { hojas };
}

/**
 * Adivina qué columna de una hoja es cada cosa, buscando en las primeras
 * filas palabras típicas de las listas de precios de proveedores. Es sólo
 * una sugerencia: el importador siempre muestra el resultado para que el
 * usuario lo confirme o lo corrija antes de guardar nada.
 */
export function sugerirMapeo(filas) {
  const normaliza = (v) => String(v ?? '').toLowerCase();

  let filaEncabezado = 0;
  for (let i = 0; i < Math.min(6, filas.length); i++) {
    if ((filas[i] || []).some((c) => normaliza(c).includes('precio'))) {
      filaEncabezado = i;
      break;
    }
  }

  const encabezado = filas[filaEncabezado] || [];
  // La fila con "CANAL / CONSTRUCTOR / CLIENTE FINAL" no siempre es la
  // Dónde empiezan los datos: la primera fila con algún número. Hay que
  // saberlo ANTES de buscar los subtítulos, porque los subtítulos
  // (CANAL / CONSTRUCTOR / CLIENTE FINAL) viven entre el encabezado y los
  // datos. Buscarlos más abajo hace que una descripción como "Interruptor de
  // 2 canales" se confunda con la columna de precio de canal.
  let filaInicioDatos = filas.length;
  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    if ((filas[i] || []).some((celda) => typeof celda === 'number')) {
      filaInicioDatos = i;
      break;
    }
  }

  const filasSub = [];
  for (let i = filaEncabezado + 1; i < filaInicioDatos; i++) filasSub.push(filas[i]);

  // `grupos` se prueba en orden de prioridad: la primera coincidencia gana,
  // así un patrón muy específico ("descri") no lo tapa uno más genérico que
  // aparezca antes en la fila ("product name").
  const buscar = (grupos, ...filasABuscar) => {
    for (const patrones of grupos) {
      for (const fila of filasABuscar) {
        for (let c = 0; c < (fila || []).length; c++) {
          if (patrones.some((p) => normaliza(fila[c]).includes(p))) return c;
        }
      }
    }
    return null;
  };

  const columnas = {
    referencia: buscar([['model', 'referen'], ['product name', 'item']], encabezado),
    descripcion: buscar([['descri'], ['name of goods', 'goods', 'nombre']], encabezado),
    precio_canal: buscar([['canal']], ...filasSub, encabezado),
    precio_constructor: buscar([['constructor']], ...filasSub, encabezado),
    precio_cliente: buscar([['cliente final', 'cliente', 'final']], ...filasSub, encabezado),
  };

  // Dos campos no pueden apuntar a la misma columna. Si pasa, gana el que
  // aparece primero acá arriba (referencia y descripción antes que los
  // precios), que son los que se detectan por el encabezado y no por
  // subtítulos parecidos.
  const tomadas = new Set();
  for (const campo of Object.keys(columnas)) {
    const col = columnas[campo];
    if (col === null) continue;
    if (tomadas.has(col)) columnas[campo] = null;
    else tomadas.add(col);
  }

  // Sin datos detectados, se asume que empiezan justo debajo del encabezado.
  if (filaInicioDatos === filas.length) filaInicioDatos = filaEncabezado + 1;

  return { filaEncabezado, filaInicioDatos, columnas };
}
