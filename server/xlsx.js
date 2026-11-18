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
 * Los anclajes de un dibujo: qué imagen está pegada a qué filas.
 *
 * Excel tiene tres formas de anclar una imagen y las listas de proveedores
 * usan las tres, a veces en el mismo archivo:
 *
 * - `oneCellAnchor`: pegada a una celda, con un tamaño fijo. Ocupa una fila.
 * - `twoCellAnchor`: pegada de una celda a otra. Puede abarcar varias filas,
 *   y es lo que pasa cuando alguien estira la foto sobre su renglón: el
 *   `from` puede quedar una fila más arriba que el producto.
 * - `absoluteAnchor`: puesta en una posición de la hoja, sin celda. No hay
 *   forma de saber a qué producto pertenece.
 *
 * Antes sólo se miraba el `from`, así que una foto estirada caía en la fila
 * de arriba y las absolutas se perdían sin avisar.
 *
 * @returns {{anclajes: {desde: number, hasta: number, embed: string}[], sinFila: number}}
 */
export function anclajesDeDibujo(dibujoXml) {
  const anclajes = [];
  let sinFila = 0;

  const bloques = String(dibujoXml || '')
    .matchAll(/<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)[\s\S]*?<\/xdr:\1>/g);

  for (const [bloque, tipo] of bloques) {
    const blip = bloque.match(/<a:blip[^>]*r:embed="([^"]+)"/);
    if (!blip) continue;

    const desde = bloque.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    if (!desde) {
      // absoluteAnchor, o un anclaje sin fila: la imagen existe pero no hay
      // manera de decir de qué producto es.
      sinFila += 1;
      continue;
    }

    const hasta = tipo === 'twoCellAnchor'
      ? bloque.match(/<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
      : null;

    anclajes.push({
      desde: Number(desde[1]),
      hasta: hasta ? Number(hasta[1]) : Number(desde[1]),
      embed: blip[1],
    });
  }

  return { anclajes, sinFila };
}

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
  // Cuántas imágenes hay en la hoja que no se pudieron atribuir a ninguna
  // fila. Se informa al importar: una foto que falta tiene que verse, no
  // descubrirse cuando la oferta ya salió.
  porFila.sinUbicar = 0;

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

    const { anclajes, sinFila } = anclajesDeDibujo(dibujoXml);
    porFila.sinUbicar += sinFila;

    // Primero cada imagen a la fila donde arranca, que es el caso normal.
    // Recién después se reparten las que quedaron sin lugar por las filas que
    // abarcan: así una foto estirada sobre su renglón no le roba la fila a la
    // que sí empieza ahí.
    const pendientes = [];

    for (const a of anclajes) {
      const destino = relsDibujo.get(a.embed);
      if (!destino) continue;

      const rutaImagen = rutaRelativa(carpetaDibujo, destino);
      const datos = zip.leer(rutaImagen);
      if (!datos) continue;

      const ext = EXTENSIONES_IMAGEN[(rutaImagen.split('.').pop() || '').toLowerCase()];
      if (!ext) continue;

      const imagen = { datos, extension: ext };
      if (porFila.has(a.desde)) pendientes.push({ ...a, imagen });
      else porFila.set(a.desde, imagen);
    }

    for (const p of pendientes) {
      let ubicada = false;
      for (let f = p.desde; f <= p.hasta; f++) {
        if (porFila.has(f)) continue;
        porFila.set(f, p.imagen);
        ubicada = true;
        break;
      }
      if (!ubicada) porFila.sinUbicar += 1;
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
      imagenes: conImagenes ? imagenesDeHoja(zip, destino) : Object.assign(new Map(), { sinUbicar: 0 }),
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

  // Cuál fila es el encabezado: la que más celdas tenga con pinta de rótulo.
  //
  // Antes alcanzaba con que la fila dijera "precio", y eso se tropieza con el
  // título de la hoja —"LISTA DE PRECIOS CLIC CONTROL"— que está justo arriba
  // y también lo dice. Contar cuántas celdas parecen rótulo separa el título
  // (una sola) del encabezado de verdad (varias). En empate gana la de más
  // arriba, que deja los subtítulos donde estaban.
  const ROTULOS = [
    'ref', 'model', 'codigo', 'código', 'descri', 'nombre', 'goods', 'item',
    'precio', 'price', 'valor', 'canal', 'constructor', 'cliente',
    'marca', 'unidad', 'stock', 'cantidad', 'existencia',
  ];
  const puntaje = (fila) =>
    (fila || []).filter((c) => ROTULOS.some((r) => normaliza(c).includes(r))).length;

  let filaEncabezado = 0;
  let mejor = 0;
  for (let i = 0; i < Math.min(8, filas.length); i++) {
    const p = puntaje(filas[i]);
    if (p > mejor) { mejor = p; filaEncabezado = i; }
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
    // También en los subtítulos: si el encabezado quedó siendo una fila con
    // celdas combinadas, el rótulo de la columna puede estar una fila abajo.
    referencia: buscar([['model', 'referen', 'codigo', 'código'], ['product name', 'item'], ['ref']], encabezado, ...filasSub),
    descripcion: buscar([['descri'], ['name of goods', 'goods', 'nombre']], encabezado, ...filasSub),
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

/**
 * Convierte las filas crudas de una hoja en productos, usando un mapeo de
 * columnas ya confirmado.
 *
 * Es lo mismo que arma la pantalla de importación antes de mandar la lista,
 * pero acá también, para que una lista que se trae sola desde su dirección en
 * línea no necesite que haya alguien mirando la pantalla.
 *
 * El índice de fila se conserva: es lo que vincula cada producto con la foto
 * que el Excel tiene anclada a esa misma fila.
 */
export function filasDesdeMapeo(filas, mapeo) {
  const col = mapeo?.columnas ?? {};
  const dato = (f, campo) => (col[campo] === null || col[campo] === undefined ? null : f[col[campo]] ?? null);

  if (col.descripcion === null || col.descripcion === undefined) {
    throw new Error('No sé cuál columna es la descripción del producto.');
  }

  return filas
    .map((f, i) => ({
      fila: i,
      referencia: dato(f, 'referencia'),
      descripcion: f[col.descripcion],
      marca: dato(f, 'marca'),
      unidad: dato(f, 'unidad'),
      precio_canal: dato(f, 'precio_canal'),
      precio_constructor: dato(f, 'precio_constructor'),
      precio_cliente: dato(f, 'precio_cliente'),
      stock: dato(f, 'stock'),
    }))
    .slice(mapeo.filaInicioDatos ?? 0)
    .filter((f) => f.descripcion !== null && f.descripcion !== undefined && String(f.descripcion).trim() !== '');
}
