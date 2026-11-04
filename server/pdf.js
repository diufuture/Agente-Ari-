/**
 * Generador de PDF, escrito a mano y sin dependencias.
 *
 * Por qué existe: la cotización se mandaba a imprimir con el diálogo del
 * navegador ("Imprimir → Guardar como PDF"). Eso funciona en un computador,
 * pero en la aplicación instalada en el celular NO: iOS no le da diálogo de
 * impresión a una app instalada, así que el botón no hacía absolutamente
 * nada. Sin PDF tampoco había forma de mandarle la oferta al cliente por
 * WhatsApp, que es como se manda todo acá.
 *
 * Las librerías de PDF que se usan normalmente (las que manejan un navegador
 * entero por dentro) pesan cientos de megas y en un hosting compartido se
 * quedan sin memoria. Un PDF, en cambio, es un formato de texto con una tabla
 * de posiciones al final: armarlo a mano es largo pero no difícil, y así la
 * aplicación sigue sin depender de nada que se pueda romper al actualizar.
 *
 * Se usan las fuentes Helvetica y Helvetica-Bold, que TODO lector de PDF trae
 * incorporadas: no hay que incrustar ningún archivo de fuente, que es lo que
 * más pesa en un PDF hecho a mano.
 */

import { deflateSync } from 'node:zlib';

/* ------------------------------------------------------------------ */
/* Anchos de las letras                                                */
/* ------------------------------------------------------------------ */

// Cuánto mide cada letra, en milésimas del tamaño de la fuente. Hace falta
// para dos cosas que se notan enseguida si están mal: cortar los renglones
// largos en el lugar correcto, y alinear los precios a la derecha.
const ANCHOS_NORMAL = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};

const ANCHOS_NEGRITA = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  '{': 389, '|': 280, '}': 389, '~': 584,
};

for (const tabla of [ANCHOS_NORMAL, ANCHOS_NEGRITA]) {
  for (const d of '0123456789') tabla[d] = 556;
}

// Las vocales con tilde y la eñe miden prácticamente lo mismo que su letra
// sin acento: se toma esa, que es exacta para el ancho y sobra para cortar.
const SIN_TILDE = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', ç: 'c',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N', Ç: 'C',
  '·': '.', '°': '.', º: '.', ª: '.', '¿': '?', '¡': '!', '€': '$',
};

function anchoLetra(letra, negrita) {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS_NORMAL;
  return tabla[letra] ?? tabla[SIN_TILDE[letra]] ?? 556;
}

/** Cuánto ocupa un texto, en puntos. */
export function anchoTexto(texto, tamano, negrita = false) {
  let total = 0;
  for (const letra of String(texto ?? '')) total += anchoLetra(letra, negrita);
  return (total * tamano) / 1000;
}

/* ------------------------------------------------------------------ */
/* Texto: del español al alfabeto que entiende el PDF                  */
/* ------------------------------------------------------------------ */

// El PDF, con las fuentes de siempre, habla WinAnsi: casi todo el español
// entra tal cual (tildes y eñes incluidas). Lo que no entra —una flecha, un
// emoji pegado desde otro lado— se cambia por algo parecido en vez de salir
// como un cuadradito o de romper el archivo.
const REEMPLAZOS = { '·': '-', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...' };

function aWinAnsi(texto) {
  const bytes = [];
  for (const letra of String(texto ?? '')) {
    const c = REEMPLAZOS[letra] ?? letra;
    for (const l of c) {
      const codigo = l.codePointAt(0);
      // Latin-1 entra directo; lo de más arriba se aproxima o se descarta.
      if (codigo >= 32 && codigo <= 255) bytes.push(codigo);
      else if (SIN_TILDE[l]) bytes.push(SIN_TILDE[l].codePointAt(0));
      else bytes.push(63); // '?'
    }
  }
  return Buffer.from(bytes);
}

/** Escapa lo que en un PDF tiene significado propio: ( ) y la barra. */
function textoPdf(texto) {
  const crudo = aWinAnsi(texto);
  const salida = [];
  for (const b of crudo) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) salida.push(0x5c);
    salida.push(b);
  }
  return Buffer.from(salida);
}

/**
 * Corta un texto en renglones que quepan en un ancho dado.
 * Una palabra más larga que el renglón se parte, para que no se salga.
 */
export function partirEnRenglones(texto, ancho, tamano, negrita = false) {
  const renglones = [];
  for (const parrafo of String(texto ?? '').split('\n')) {
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (anchoTexto(prueba, tamano, negrita) <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual) renglones.push(actual);
      // Una sola palabra que no entra: se corta por donde llegue.
      let resto = palabra;
      while (anchoTexto(resto, tamano, negrita) > ancho && resto.length > 1) {
        let corte = resto.length;
        while (corte > 1 && anchoTexto(resto.slice(0, corte), tamano, negrita) > ancho) corte--;
        renglones.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      actual = resto;
    }
    renglones.push(actual);
  }
  return renglones.length ? renglones : [''];
}

/* ------------------------------------------------------------------ */
/* Imágenes                                                            */
/* ------------------------------------------------------------------ */

/**
 * Lee el tamaño de un JPEG sin descomprimirlo.
 *
 * El PDF puede llevar el JPEG tal cual viene, sin tocarlo, pero necesita
 * saber cuánto mide y si es color o gris. Eso está en la cabecera, en un
 * bloque que empieza con FF C0 (o alguno de sus parientes).
 */
export function medirJpeg(datos) {
  if (datos.length < 4 || datos[0] !== 0xFF || datos[1] !== 0xD8) return null;
  let i = 2;
  while (i < datos.length - 9) {
    if (datos[i] !== 0xFF) { i++; continue; }
    const marca = datos[i + 1];
    // Los SOF que traen el tamaño (se saltean SOF4/8/12, que no son imágenes).
    if (marca >= 0xC0 && marca <= 0xCF && marca !== 0xC4 && marca !== 0xC8 && marca !== 0xCC) {
      return {
        alto: datos.readUInt16BE(i + 5),
        ancho: datos.readUInt16BE(i + 7),
        componentes: datos[i + 9],
      };
    }
    if (marca === 0xD8 || (marca >= 0xD0 && marca <= 0xD9)) { i += 2; continue; }
    i += 2 + datos.readUInt16BE(i + 2);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* El documento                                                        */
/* ------------------------------------------------------------------ */

const A4 = { ancho: 595.28, alto: 841.89 };

/**
 * Un PDF que se va armando página por página.
 *
 * El sistema de coordenadas del PDF arranca abajo a la izquierda, que es al
 * revés de como uno piensa una hoja. Adentro se trabaja "desde arriba", como
 * se lee, y se da vuelta recién al escribir.
 */
export class Documento {
  constructor({ margen = 40 } = {}) {
    this.margen = margen;
    this.paginas = [];
    this.imagenes = new Map();   // clave -> { nombre, datos, ancho, alto, componentes }
    this.nuevaPagina();
  }

  get ancho() { return A4.ancho; }
  get anchoUtil() { return A4.ancho - this.margen * 2; }
  get pieDePagina() { return A4.alto - this.margen; }

  nuevaPagina() {
    this.pagina = { ordenes: [], usa: new Set() };
    this.paginas.push(this.pagina);
    this.y = this.margen;
    return this.pagina;
  }

  /** ¿Entra algo de este alto, o hay que pasar a la hoja siguiente? */
  cabe(alto) { return this.y + alto <= this.pieDePagina; }

  aseguraEspacio(alto) {
    if (!this.cabe(alto)) this.nuevaPagina();
  }

  #orden(texto) { this.pagina.ordenes.push(texto); }

  /** Convierte "desde arriba" a las coordenadas del PDF. */
  #real(y) { return A4.alto - y; }

  texto(cadena, x, y, { tamano = 10, negrita = false, color = [0, 0, 0], alinear = 'izquierda', ancho = 0 } = {}) {
    const s = String(cadena ?? '');
    if (!s) return;
    let posX = x;
    if (alinear === 'derecha') posX = x + ancho - anchoTexto(s, tamano, negrita);
    else if (alinear === 'centro') posX = x + (ancho - anchoTexto(s, tamano, negrita)) / 2;

    const fuente = negrita ? 'F2' : 'F1';
    this.pagina.usa.add(fuente);
    this.#orden(
      `BT ${color.map((c) => c.toFixed(3)).join(' ')} rg /${fuente} ${tamano} Tf `
      + `1 0 0 1 ${posX.toFixed(2)} ${this.#real(y + tamano * 0.8).toFixed(2)} Tm `
      + `(${textoPdf(s).toString('latin1')}) Tj ET`,
    );
  }

  rectangulo(x, y, ancho, alto, color) {
    this.#orden(
      `${color.map((c) => c.toFixed(3)).join(' ')} rg `
      + `${x.toFixed(2)} ${this.#real(y + alto).toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re f`,
    );
  }

  linea(x1, y1, x2, y2, { color = [0.83, 0.87, 0.91], grosor = 0.7 } = {}) {
    this.#orden(
      `${color.map((c) => c.toFixed(3)).join(' ')} RG ${grosor} w `
      + `${x1.toFixed(2)} ${this.#real(y1).toFixed(2)} m ${x2.toFixed(2)} ${this.#real(y2).toFixed(2)} l S`,
    );
  }

  /**
   * Pone un JPEG. `clave` sirve para no repetir la misma foto dentro del
   * archivo: un producto que aparece en varios renglones ocupa una sola vez.
   * La imagen se encaja dentro del recuadro sin deformarla.
   */
  imagen(clave, datos, x, y, cajaAncho, cajaAlto) {
    let guardada = this.imagenes.get(clave);
    if (!guardada) {
      const medida = medirJpeg(datos);
      if (!medida) return false;
      guardada = { nombre: `Im${this.imagenes.size + 1}`, datos, ...medida };
      this.imagenes.set(clave, guardada);
    }

    const escala = Math.min(cajaAncho / guardada.ancho, cajaAlto / guardada.alto);
    const ancho = guardada.ancho * escala;
    const alto = guardada.alto * escala;
    const posX = x + (cajaAncho - ancho) / 2;
    const posY = y + (cajaAlto - alto) / 2;

    this.pagina.usa.add(guardada.nombre);
    this.#orden(
      `q ${ancho.toFixed(2)} 0 0 ${alto.toFixed(2)} ${posX.toFixed(2)} `
      + `${this.#real(posY + alto).toFixed(2)} cm /${guardada.nombre} Do Q`,
    );
    return true;
  }

  /* ---- Armado final ---- */

  terminar() {
    const objetos = [];
    const agregar = (contenido) => { objetos.push(contenido); return objetos.length; };

    // 1 y 2 quedan reservados para el catálogo y el árbol de páginas, que
    // necesitan saber los números de las páginas antes de que existan.
    agregar(null);
    agregar(null);

    const fuenteNormal = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fuenteNegrita = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    for (const img of this.imagenes.values()) {
      img.id = agregar({
        diccionario: `<< /Type /XObject /Subtype /Image /Width ${img.ancho} /Height ${img.alto} `
          + `/ColorSpace /Device${img.componentes === 1 ? 'Gray' : 'RGB'} /BitsPerComponent 8 `
          + `/Filter /DCTDecode /Length ${img.datos.length} >>`,
        flujo: img.datos,
      });
    }

    const idsPaginas = [];
    for (const pagina of this.paginas) {
      // Se comprime: un PDF de varias hojas con muchos renglones baja de
      // cientos de kilobytes a unas pocas decenas, y por WhatsApp eso importa.
      const contenido = deflateSync(Buffer.from(pagina.ordenes.join('\n'), 'latin1'));
      const idContenido = agregar({
        diccionario: `<< /Length ${contenido.length} /Filter /FlateDecode >>`,
        flujo: contenido,
      });

      const recursos = [`/Font << /F1 ${fuenteNormal} 0 R /F2 ${fuenteNegrita} 0 R >>`];
      const usadas = [...this.imagenes.values()].filter((i) => pagina.usa.has(i.nombre));
      if (usadas.length) {
        recursos.push(`/XObject << ${usadas.map((i) => `/${i.nombre} ${i.id} 0 R`).join(' ')} >>`);
      }

      idsPaginas.push(agregar(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.ancho} ${A4.alto}] `
        + `/Resources << ${recursos.join(' ')} >> /Contents ${idContenido} 0 R >>`,
      ));
    }

    objetos[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objetos[1] = `<< /Type /Pages /Count ${idsPaginas.length} `
      + `/Kids [${idsPaginas.map((id) => `${id} 0 R`).join(' ')}] >>`;

    // Y ahora el archivo: los objetos uno tras otro, y al final la tabla que
    // dice en qué byte empieza cada uno (así el lector salta directo al que
    // necesita sin leer todo).
    const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let posicion = partes[0].length;
    const posiciones = [];

    objetos.forEach((obj, i) => {
      posiciones.push(posicion);
      const trozos = [Buffer.from(`${i + 1} 0 obj\n`, 'latin1')];
      if (typeof obj === 'string') {
        trozos.push(Buffer.from(`${obj}\n`, 'latin1'));
      } else {
        trozos.push(Buffer.from(`${obj.diccionario}\nstream\n`, 'latin1'), obj.flujo, Buffer.from('\nendstream\n', 'latin1'));
      }
      trozos.push(Buffer.from('endobj\n', 'latin1'));
      for (const t of trozos) { partes.push(t); posicion += t.length; }
    });

    const inicioTabla = posicion;
    let tabla = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const p of posiciones) tabla += `${String(p).padStart(10, '0')} 00000 n \n`;
    tabla += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioTabla}\n%%EOF\n`;
    partes.push(Buffer.from(tabla, 'latin1'));

    return Buffer.concat(partes);
  }
}
