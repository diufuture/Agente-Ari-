/**
 * Gestor de fotos: achica cualquier imagen antes de guardarla.
 *
 * Las fotos de una cotización se ven del tamaño de una uña: 320 píxeles de
 * lado alcanzan de sobra, tanto en pantalla como impresas. Pero las fotos que
 * llegan no vienen así: la del celular trae 4000 píxeles y 3 MB, y la del
 * Excel del proveedor puede traer 230 KB cada una. Guardadas tal cual, cien
 * productos son 20 MB de hosting y una lista de productos que tarda en cargar.
 *
 * Acá se reduce todo a la misma medida antes de que salga del navegador: el
 * servidor nunca ve la foto grande, y en pantalla todas quedan iguales porque
 * todas *son* iguales, no porque el CSS las esté estirando.
 *
 * No usa ninguna biblioteca: el navegador ya sabe redimensionar imágenes.
 */

/** Lado máximo en píxeles. La foto entra completa en un cuadrado de este lado. */
export const LADO = 320;

/** Arriba de esto vale la pena volver a achicar una foto ya guardada. */
export const PESO_SANO = 60_000;

/** Carga una imagen desde un archivo, un data URL o una dirección propia. */
function cargar(origen) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = origen instanceof Blob ? URL.createObjectURL(origen) : String(origen);
    // Sólo para imágenes de otro sitio, y ahí sirve para que el canvas no
    // quede "manchado" y se pueda exportar. En las propias no se toca: pedirlas
    // en modo CORS sin necesidad sólo agrega maneras de que falle.
    const ajena = /^https?:\/\//i.test(url) && !url.startsWith(`${location.origin}/`);
    if (ajena) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (origen instanceof Blob) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (origen instanceof Blob) URL.revokeObjectURL(url);
      reject(new Error('No pude abrir esa imagen.'));
    };
    img.src = url;
  });
}

/** Cuánto pesa de verdad lo que representa un data URL. */
export function pesoDe(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const relleno = (base64.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - relleno);
}

/**
 * Achica una imagen a `lado` píxeles como máximo y devuelve un data URL.
 *
 * Nunca la agranda: una foto que ya viene chica se deja como está (sólo se
 * recomprime si con eso pesa menos).
 *
 * @param {File|Blob|string} origen archivo elegido, imagen pegada o data URL
 * @returns {Promise<{dataUrl: string, ancho: number, alto: number, bytes: number, bytesAntes: number}>}
 */
export async function encoger(origen, { lado = LADO, calidad = 0.82 } = {}) {
  const img = await cargar(origen);
  const anchoNatural = img.naturalWidth || img.width;
  const altoNatural = img.naturalHeight || img.height;
  if (!anchoNatural || !altoNatural) throw new Error('Esa imagen no tiene tamaño; puede estar dañada.');

  const escala = Math.min(1, lado / Math.max(anchoNatural, altoNatural));
  const ancho = Math.max(1, Math.round(anchoNatural * escala));
  const alto = Math.max(1, Math.round(altoNatural * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, ancho, alto);

  // WEBP pesa bastante menos que JPG y además conserva los fondos
  // transparentes, que es como vienen muchas fotos de catálogo. Si el
  // navegador no sabe generarlo, devuelve un PNG en vez de fallar: ahí se
  // prueba con JPG sobre blanco, que es como se va a imprimir igual.
  let dataUrl = lienzo.toDataURL('image/webp', calidad);
  if (!dataUrl.startsWith('data:image/webp')) {
    const png = dataUrl.startsWith('data:image/png') ? dataUrl : lienzo.toDataURL('image/png');
    const blanco = document.createElement('canvas');
    blanco.width = ancho;
    blanco.height = alto;
    const c2 = blanco.getContext('2d');
    c2.fillStyle = '#ffffff';
    c2.fillRect(0, 0, ancho, alto);
    c2.drawImage(lienzo, 0, 0);
    const jpg = blanco.toDataURL('image/jpeg', calidad);
    dataUrl = pesoDe(jpg) < pesoDe(png) ? jpg : png;
  }

  const bytesAntes = origen instanceof Blob ? origen.size : pesoDe(origen);
  return { dataUrl, ancho, alto, bytes: pesoDe(dataUrl), bytesAntes };
}

/**
 * Lo mismo, pero sin quejarse: si algo sale mal devuelve la imagen original.
 * Que una foto no se pueda achicar no puede impedir que se guarde.
 */
export async function encogerOTalCual(origen, opciones) {
  try {
    const r = await encoger(origen, opciones);
    // Si recomprimir no ganó nada (ya venía chica y optimizada), no la toco.
    if (r.bytesAntes && r.bytes >= r.bytesAntes && typeof origen === 'string') return origen;
    return r.dataUrl;
  } catch {
    return origen instanceof Blob ? aDataUrl(origen) : origen;
  }
}

/** Un Blob/File tal cual, como data URL. */
export function aDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No pude leer el archivo.'));
    r.readAsDataURL(file);
  });
}

/** "230 KB", "1,4 MB" */
export function pesoLegible(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
}
