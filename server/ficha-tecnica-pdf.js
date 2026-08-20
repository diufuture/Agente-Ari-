/**
 * La ficha técnica de un producto, dibujada en un PDF de verdad.
 *
 * Sigue la plantilla que ya venía usando el negocio —franja de marca arriba,
 * destacados en números grandes, tabla de especificaciones, tarjetas de
 * características y de sectores, insignias de compatibilidad y condiciones
 * comerciales al pie— puesta a mano sobre la hoja con el mismo motor que
 * arma las cotizaciones (`pdf.js`), no con un navegador ni una librería de
 * PDF de las que pesan cientos de megas.
 *
 * El contenido (`datos`) no lo inventa este archivo: llega ya armado desde
 * afuera, con lo que confirmó el fabricante o lo que se investigó aparte. Acá
 * sólo se acomoda en la hoja.
 */

import { Documento, partirEnRenglones } from './pdf.js';

const TINTA = [0.06, 0.14, 0.23];
const TENUE = [0.36, 0.44, 0.52];
const MARCA = [0.05, 0.5, 0.72];
const MARCA_OSCURA = [0.04, 0.16, 0.3];
const LINEA = [0.83, 0.87, 0.91];
const FONDO = [0.93, 0.96, 0.98];
const AMBAR = [0.7, 0.42, 0.02];
const AMBAR_FONDO = [1, 0.96, 0.87];

/**
 * @typedef {object} FichaDatos
 * @property {string} nombre           "MicroDimmer 2CH — Módulo Regulador Doble Canal Zigbee"
 * @property {string} referencia       "CC-DIM2-ZB01"
 * @property {string} subtitulo        Línea corta con lo esencial: protocolo, canales, voltaje, cert.
 * @property {string} resumen          2-4 líneas de introducción.
 * @property {{valor:string, etiqueta:string, sub:string}[]} destacados  Hasta 4 cifras grandes.
 * @property {[string,string][]} specs Tabla parámetro/valor.
 * @property {[string,string][]} [terminales] Tabla terminal/función (opcional: no todo lleva cableado).
 * @property {string} [advertencia]    Aviso corto, va en un recuadro ámbar.
 * @property {{titulo:string, texto:string}[]} caracteristicas Hasta 6.
 * @property {{titulo:string, texto:string}[]} sectores        Hasta 4.
 * @property {string[]} compatibleCon
 * @property {'confirmado'|'estandar'} confianza
 *   'confirmado': los números salen de una ficha del fabricante o de la
 *   propia descripción del producto en la lista de precios.
 *   'estandar':   se completaron con parámetros típicos de ese tipo de
 *   dispositivo —no de este modelo puntual—, porque no se encontró la ficha
 *   exacta. Se avisa abajo del todo, para que quien la revise sepa qué mirar
 *   con más cuidado antes de mandarla a una instalación.
 */

const dinero = () => null; // (sin uso acá; se deja fuera del PDF de specs)

function tituloSeccion(doc, texto, { x, ancho, y }) {
  doc.rectangulo(x, y, ancho, 16, FONDO);
  doc.texto(texto.toUpperCase(), x + 8, y + 5, { tamano: 8, negrita: true, color: MARCA_OSCURA });
  return y + 16;
}

/**
 * Una tabla de dos columnas (rótulo/valor), con renglón que se ajusta al
 * texto. Las dos columnas se envuelven —no sólo el valor—, porque el nombre
 * de un terminal ("S1 — Pulsador canal 1") suele ser tan largo como lo que
 * describe: si sólo se envolviera el valor, el rótulo se salía de su columna
 * y quedaba pisando el valor de al lado.
 */
function tablaDosColumnas(doc, filas, { x, ancho, anchoRotulo, tamano = 8 }) {
  const anchoValor = ancho - anchoRotulo - 6;
  for (const [rotulo, valor] of filas) {
    const rRotulo = partirEnRenglones(String(rotulo ?? ''), anchoRotulo - 8, tamano);
    const rValor = partirEnRenglones(String(valor ?? ''), anchoValor, tamano, true);
    const alto = Math.max(rRotulo.length, rValor.length, 1) * 10 + 4;
    doc.aseguraEspacio(alto);
    const y = doc.y;
    let yr = y + 4;
    for (const r of rRotulo) { doc.texto(r, x + 4, yr, { tamano, color: TENUE, ancho: anchoRotulo - 8 }); yr += 10; }
    let yv = y + 4;
    for (const r of rValor) { doc.texto(r, x + anchoRotulo, yv, { tamano, negrita: true, color: TINTA, ancho: anchoValor }); yv += 10; }
    doc.y = y + alto;
    doc.linea(x, doc.y, x + ancho, doc.y, { color: [0.93, 0.95, 0.97] });
  }
}

/** Tarjetas en grilla, con un borde de color a la izquierda. */
function grillaTarjetas(doc, items, { x, ancho, columnas, colorBorde = MARCA, fondo = null, tamanoTitulo = 8.5, tamanoTexto = 7.5 }) {
  const gap = 10;
  const anchoCol = (ancho - gap * (columnas - 1)) / columnas;
  let fila = [];
  const filas = [];
  items.forEach((it, i) => { fila.push(it); if (fila.length === columnas || i === items.length - 1) { filas.push(fila); fila = []; } });

  for (const grupo of filas) {
    const medidas = grupo.map((it) => {
      const rt = partirEnRenglones(it.titulo, anchoCol - 16, tamanoTitulo, true);
      const rx = partirEnRenglones(it.texto, anchoCol - 16, tamanoTexto);
      return { rt, rx, alto: 10 + rt.length * (tamanoTitulo + 2) + rx.length * (tamanoTexto + 2.5) + 8 };
    });
    const altoFila = Math.max(...medidas.map((m) => m.alto));
    doc.aseguraEspacio(altoFila);
    const y = doc.y;
    grupo.forEach((it, i) => {
      const x0 = x + i * (anchoCol + gap);
      if (fondo) doc.rectangulo(x0, y, anchoCol, altoFila, fondo);
      doc.rectangulo(x0, y, 2.6, altoFila, colorBorde);
      let ty = y + 9;
      for (const r of medidas[i].rt) { doc.texto(r, x0 + 10, ty, { tamano: tamanoTitulo, negrita: true, color: TINTA }); ty += tamanoTitulo + 2; }
      ty += 1;
      for (const r of medidas[i].rx) { doc.texto(r, x0 + 10, ty, { tamano: tamanoTexto, color: TENUE }); ty += tamanoTexto + 2.5; }
    });
    doc.y = y + altoFila + 8;
  }
}

export function pdfDeFichaTecnica(datos) {
  const doc = new Documento({ margen: 38 });
  const izq = doc.margen;
  const util = doc.anchoUtil;

  /* ---- Encabezado ---- */
  doc.rectangulo(izq - doc.margen, 0, doc.ancho, 4, MARCA);
  doc.y += 6;
  doc.texto('FICHA TÉCNICA — AUTOMATIZACIÓN INTELIGENTE', izq, doc.y, { tamano: 7.5, negrita: true, color: MARCA });
  doc.y += 12;

  const rNombre = partirEnRenglones(datos.nombre, util, 16, true);
  for (const r of rNombre) { doc.texto(r, izq, doc.y, { tamano: 16, negrita: true, color: MARCA_OSCURA }); doc.y += 19; }

  if (datos.subtitulo) {
    doc.texto(`Ref: ${datos.referencia} · ${datos.subtitulo}`, izq, doc.y, { tamano: 8.5, color: TENUE });
    doc.y += 14;
  } else if (datos.referencia) {
    doc.texto(`Ref: ${datos.referencia}`, izq, doc.y, { tamano: 8.5, color: TENUE });
    doc.y += 14;
  }

  if (datos.resumen) {
    for (const r of partirEnRenglones(datos.resumen, util, 9)) { doc.texto(r, izq, doc.y, { tamano: 9, color: TINTA }); doc.y += 12; }
  }
  doc.y += 8;

  /* ---- Destacados: hasta 4 cifras grandes ---- */
  if (datos.destacados?.length) {
    const n = datos.destacados.length;
    const gap = 10;
    const anchoCaja = (util - gap * (n - 1)) / n;
    const alto = 46;
    doc.aseguraEspacio(alto);
    datos.destacados.forEach((d, i) => {
      const x0 = izq + i * (anchoCaja + gap);
      doc.rectangulo(x0, doc.y, anchoCaja, alto, FONDO);
      doc.texto(d.valor, x0, doc.y + 8, { tamano: 17, negrita: true, color: MARCA, alinear: 'centro', ancho: anchoCaja });
      doc.texto(d.etiqueta, x0, doc.y + 27, { tamano: 6.5, color: TENUE, alinear: 'centro', ancho: anchoCaja });
      if (d.sub) doc.texto(d.sub, x0, doc.y + 36, { tamano: 6.5, negrita: true, color: TINTA, alinear: 'centro', ancho: anchoCaja });
    });
    doc.y += alto + 14;
  }

  /* ---- Especificaciones (y terminales, si aplica) ---- */
  if (datos.specs?.length) {
    const dosColumnas = Boolean(datos.terminales?.length);
    const anchoTabla = dosColumnas ? (util - 12) / 2 : util;

    doc.aseguraEspacio(28);
    const titulo = dosColumnas ? 'Especificaciones técnicas · Terminales de conexión' : 'Especificaciones técnicas';
    doc.y = tituloSeccion(doc, titulo, { x: izq, ancho: util, y: doc.y });
    doc.y += 6;

    if (!dosColumnas) {
      tablaDosColumnas(doc, datos.specs, { x: izq, ancho: util, anchoRotulo: util * 0.36 });
    } else {
      const yInicio = doc.y;
      tablaDosColumnas(doc, datos.specs, { x: izq, ancho: anchoTabla, anchoRotulo: anchoTabla * 0.42, tamano: 7.5 });
      const yTrasSpecs = doc.y;
      doc.y = yInicio;
      tablaDosColumnas(doc, datos.terminales, { x: izq + anchoTabla + 12, ancho: anchoTabla, anchoRotulo: anchoTabla * 0.44, tamano: 7.5 });
      doc.y = Math.max(doc.y, yTrasSpecs);
    }
    doc.y += 8;
  }

  /* ---- Advertencia ---- */
  if (datos.advertencia) {
    const renglones = partirEnRenglones(`Importante: ${datos.advertencia}`, util - 16, 7.5);
    const alto = renglones.length * 10 + 10;
    doc.aseguraEspacio(alto);
    doc.rectangulo(izq, doc.y, util, alto, AMBAR_FONDO);
    let ty = doc.y + 7;
    renglones.forEach((r, i) => {
      doc.texto(r, izq + 8, ty, { tamano: 7.5, negrita: i === 0, color: AMBAR, ancho: util - 16 });
      ty += 10;
    });
    doc.y += alto + 10;
  }

  /* ---- Características principales ---- */
  if (datos.caracteristicas?.length) {
    doc.aseguraEspacio(24);
    doc.texto('CARACTERÍSTICAS PRINCIPALES', izq, doc.y, { tamano: 9, negrita: true, color: MARCA_OSCURA });
    doc.y += 14;
    grillaTarjetas(doc, datos.caracteristicas, { x: izq, ancho: util, columnas: 3, colorBorde: MARCA });
    doc.y += 4;
  }

  /* ---- Aplicaciones por sector ---- */
  if (datos.sectores?.length) {
    doc.aseguraEspacio(24);
    doc.texto('APLICACIONES POR SECTOR', izq, doc.y, { tamano: 9, negrita: true, color: MARCA_OSCURA });
    doc.y += 14;
    grillaTarjetas(doc, datos.sectores, { x: izq, ancho: util, columnas: 4, colorBorde: MARCA_OSCURA, fondo: FONDO, tamanoTitulo: 7.5, tamanoTexto: 7 });
    doc.y += 4;
  }

  /* ---- Compatible con ---- */
  if (datos.compatibleCon?.length) {
    doc.aseguraEspacio(30);
    doc.texto('COMPATIBLE CON', izq, doc.y, { tamano: 8, negrita: true, color: TENUE });
    doc.y += 12;
    let x0 = izq;
    let filaAlto = 20;
    for (const nombre of datos.compatibleCon) {
      const w = Math.max(60, partirEnRenglones(nombre, 300, 7.5, true)[0].length * 4.6 + 18);
      if (x0 + w > izq + util) { x0 = izq; doc.y += filaAlto + 6; doc.aseguraEspacio(filaAlto + 6); }
      doc.rectangulo(x0, doc.y, w, filaAlto, MARCA_OSCURA);
      doc.texto(nombre, x0, doc.y + 6, { tamano: 7.5, negrita: true, color: [1, 1, 1], alinear: 'centro', ancho: w });
      x0 += w + 8;
    }
    doc.y += filaAlto + 14;
  }

  /* ---- Condiciones comerciales ---- */
  if (datos.condiciones?.length) {
    doc.aseguraEspacio(50);
    doc.y = tituloSeccion(doc, 'Condiciones comerciales', { x: izq, ancho: util, y: doc.y });
    doc.y += 8;
    const columnas = 3;
    const gap = 14;
    const anchoCol = (util - gap * (columnas - 1)) / columnas;
    let fila = [];
    const filas = [];
    datos.condiciones.forEach((c, i) => { fila.push(c); if (fila.length === columnas || i === datos.condiciones.length - 1) { filas.push(fila); fila = []; } });
    for (const grupo of filas) {
      const medidas = grupo.map((c) => partirEnRenglones(`- ${c}`, anchoCol, 7.5));
      const alto = Math.max(...medidas.map((m) => m.length)) * 10 + 4;
      doc.aseguraEspacio(alto);
      const y = doc.y;
      grupo.forEach((c, i) => {
        const x0 = izq + i * (anchoCol + gap);
        let ty = y;
        for (const r of medidas[i]) { doc.texto(r, x0, ty, { tamano: 7.5, color: TINTA, ancho: anchoCol }); ty += 10; }
      });
      doc.y = y + alto + 6;
    }
    doc.y += 6;
  }

  /* ---- Pie ---- */
  doc.aseguraEspacio(30);
  doc.linea(izq, doc.y, izq + util, doc.y, { color: LINEA });
  doc.y += 8;
  if (datos.confianza === 'estandar') {
    const aviso = partirEnRenglones(
      'Nota: algunos datos de esta hoja se completaron con parámetros típicos de este tipo de '
      + 'dispositivo, porque no se encontró la ficha exacta del fabricante para esta referencia. '
      + 'Verificar antes de una instalación donde el dato sea crítico.',
      util, 6.5,
    );
    for (const r of aviso) { doc.texto(r, izq, doc.y, { tamano: 6.5, color: AMBAR }); doc.y += 8; }
    doc.y += 1;
  }
  doc.texto(datos.pie || 'ClickControl · Automatización Inteligente · Seguridad · Audio & Video',
    izq, doc.y, { tamano: 7, color: TENUE, alinear: 'centro', ancho: util });

  return doc.terminar();
}
