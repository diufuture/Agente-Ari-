/**
 * La cotización, dibujada en un PDF de verdad.
 *
 * Sigue el mismo orden que la vista imprimible (encabezado, cliente,
 * representante, renglones por sección, totales, condiciones), pero puesto
 * a mano sobre la hoja, porque acá no hay navegador que acomode nada.
 *
 * Las fotos llegan ya convertidas a JPEG desde el navegador. No es un
 * capricho: se guardan en WebP —que pesa bastante menos— y el formato PDF no
 * sabe leer WebP. El único que puede convertirlas es el navegador, que ya las
 * tiene dibujadas en pantalla; el servidor no puede sin arrastrar una
 * librería de imágenes entera.
 */

import * as db from './db.js';
import { Documento, partirEnRenglones, anchoTexto } from './pdf.js';

const TINTA = [0.06, 0.14, 0.23];
const TENUE = [0.36, 0.44, 0.52];
const MARCA = [0.05, 0.5, 0.72];
const LINEA = [0.83, 0.87, 0.91];
const FONDO = [0.93, 0.96, 0.98];

const dinero = (n, moneda = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

function fechaLarga(v) {
  const f = String(v ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  const [a, m, d] = f.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

const cantidadLegible = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : String(n));

const primeraLinea = (t) => String(t ?? '').split('\n')[0].trim();
const restoDeLineas = (t) => String(t ?? '').split('\n').slice(1).join('\n').replace(/\n{2,}/g, '\n').trim();

function porSecciones(items) {
  const grupos = [];
  for (const it of items) {
    const nombre = it.seccion || 'Otros';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === nombre) ultimo.items.push(it);
    else grupos.push({ nombre, items: [it] });
  }
  return grupos.map((g) => ({ ...g, total: g.items.reduce((s, i) => s + (Number(i.total) || 0), 0) }));
}

/**
 * @param {number} id
 * @param {Map<string,Buffer>} fotos  dirección de la foto -> JPEG, convertidas
 *                                    por el navegador. Puede venir vacío: sin
 *                                    fotos la oferta sale igual, sin esa columna.
 */
export function pdfDeCotizacion(id, fotos = new Map()) {
  const cot = db.obtenerPorId('cotizaciones', id);
  if (!cot) return null;

  const items = db.consultar('cotizacion_items', { cotizacion_id: id, limite: 300 });
  const totales = db.totalesCotizacion(id);
  const aj = db.leerAjustes();
  const cliente = cot.cliente_id ? db.obtenerCliente(cot.cliente_id) : null;
  const grupos = porSecciones(items);

  const hayFotos = items.some((i) => i.foto && fotos.has(i.foto));
  const hayAreas = items.some((i) => String(i.area || '').trim());

  const doc = new Documento({ margen: 38 });
  const izq = doc.margen;
  const util = doc.anchoUtil;

  /* ---- Encabezado ---- */
  // Las dos columnas arrancan a la misma altura y se dibujan por separado: la
  // izquierda cambia de alto según haya logo o no, y sin fijar la derecha a
  // este punto la fecha se iría bajando detrás del logo.
  const yTope = doc.y;

  doc.texto(`COTIZACIÓN N.º ${cot.id}`, izq, yTope, {
    tamano: 12, negrita: true, color: MARCA, alinear: 'derecha', ancho: util,
  });
  const cabecera = [
    `Fecha: ${fechaLarga(cot.creado_en)}`,
    aj.ciudad && `Ciudad: ${aj.ciudad}`,
    `Validez: ${cot.validez || aj.validez}`,
    cot.vence_en && `Vence: ${fechaLarga(cot.vence_en)}`,
  ].filter(Boolean).join('  ·  ');
  doc.texto(cabecera, izq, yTope + 18, { tamano: 8, color: TENUE, alinear: 'derecha', ancho: util });

  // El logo manda: si está cargado, no se repite el nombre en letras abajo,
  // porque el logo ya lo dice. Sin logo sí va el nombre, o la oferta saldría
  // sin decir de quién es.
  const logo = aj.logo && fotos.get(aj.logo);
  let yIzquierda = yTope;
  // El mismo tamaño que en la vista de pantalla (240×62 px), pasado a puntos.
  // La imagen se encaja adentro sin deformarse, así que un logo cuadrado y uno
  // alargado quedan los dos bien.
  if (logo && doc.imagen('__logo__', logo, izq, yTope - 2, 180, 47)) {
    yIzquierda += 51;
  } else {
    doc.texto(aj.empresa, izq, yTope, { tamano: 17, negrita: true, color: TINTA });
    yIzquierda += 21;
  }

  const datosEmpresa = [aj.nit && `NIT ${aj.nit}`, aj.direccion, aj.telefono, aj.email].filter(Boolean).join('  ·  ');
  if (datosEmpresa) {
    doc.texto(datosEmpresa, izq, yIzquierda, { tamano: 8, color: TENUE });
    yIzquierda += 11;
  }

  // La línea va debajo de la más alta de las dos columnas.
  doc.y = Math.max(yIzquierda, yTope + 30) + 4;

  doc.linea(izq, doc.y, izq + util, doc.y, { color: MARCA, grosor: 1.4 });
  doc.y += 14;

  /* ---- Cliente y representante, uno al lado del otro ---- */
  const rep = {
    nombre: cot.representante || aj.representante,
    telefono: cot.representante_telefono || aj.representante_telefono,
    email: cot.representante_email || aj.representante_email,
  };
  const columnas = [
    {
      titulo: 'DATOS DEL CLIENTE',
      filas: cliente
        ? [['Nombre', cliente.nombre], ['Empresa', cliente.empresa], ['Teléfono', cliente.telefono],
          ['Correo', cliente.email], ['Dirección', cliente.direccion]].filter(([, v]) => v)
        : [['', 'Sin cliente asignado']],
    },
    {
      titulo: 'REPRESENTANTE DE VENTAS',
      filas: [['Nombre', rep.nombre], ['Teléfono', rep.telefono], ['Correo', rep.email]].filter(([, v]) => v),
    },
  ];

  const anchoCol = (util - 12) / 2;
  const altoBloque = 16 + Math.max(...columnas.map((c) => c.filas.length)) * 11 + 8;
  columnas.forEach((col, i) => {
    const x = izq + i * (anchoCol + 12);
    doc.rectangulo(x, doc.y, anchoCol, altoBloque, [0.98, 0.99, 1]);
    doc.linea(x, doc.y, x + anchoCol, doc.y, { color: LINEA });
    doc.linea(x, doc.y + altoBloque, x + anchoCol, doc.y + altoBloque, { color: LINEA });
    doc.texto(col.titulo, x + 8, doc.y + 6, { tamano: 7, negrita: true, color: MARCA });
    col.filas.forEach(([rotulo, valor], f) => {
      const y = doc.y + 19 + f * 11;
      if (rotulo) doc.texto(rotulo, x + 8, y, { tamano: 8, color: TENUE });
      doc.texto(valor, x + 54, y, { tamano: 8, negrita: true, color: TINTA });
    });
  });
  doc.y += altoBloque + 16;

  /* ---- Asunto ---- */
  doc.texto(cot.titulo, izq, doc.y, { tamano: 12, negrita: true, color: TINTA });
  doc.y += 17;
  if (cot.descripcion) {
    for (const r of partirEnRenglones(cot.descripcion, util, 9)) {
      doc.texto(r, izq, doc.y, { tamano: 9, color: TENUE });
      doc.y += 11;
    }
    doc.y += 4;
  }

  /* ---- Tabla de renglones ---- */
  // Las columnas se reparten el ancho: lo fijo primero, y lo que sobra es
  // para la descripción, que es la que necesita lugar.
  const anchoRef = 54;
  const anchoFoto = hayFotos ? 42 : 0;
  const anchoArea = hayAreas ? 56 : 0;
  const anchoCant = 30;
  const anchoUnit = 68;
  const anchoTotal = 74;
  const anchoDesc = util - anchoRef - anchoFoto - anchoArea - anchoCant - anchoUnit - anchoTotal;

  const x = {};
  x.ref = izq;
  x.foto = x.ref + anchoRef;
  x.desc = x.foto + anchoFoto;
  x.area = x.desc + anchoDesc;
  x.cant = x.area + anchoArea;
  x.unit = x.cant + anchoCant;
  x.total = x.unit + anchoUnit;

  const encabezadoTabla = () => {
    doc.rectangulo(izq, doc.y, util, 16, FONDO);
    const y = doc.y + 5;
    doc.texto('REF.', x.ref + 3, y, { tamano: 6.5, negrita: true, color: TENUE });
    if (hayFotos) doc.texto('FOTO', x.foto + 3, y, { tamano: 6.5, negrita: true, color: TENUE });
    doc.texto('DESCRIPCIÓN', x.desc + 3, y, { tamano: 6.5, negrita: true, color: TENUE });
    if (hayAreas) doc.texto('ÁREA', x.area + 3, y, { tamano: 6.5, negrita: true, color: TENUE });
    doc.texto('CANT.', x.cant, y, { tamano: 6.5, negrita: true, color: TENUE, alinear: 'derecha', ancho: anchoCant - 3 });
    doc.texto('VR. UNITARIO', x.unit, y, { tamano: 6.5, negrita: true, color: TENUE, alinear: 'derecha', ancho: anchoUnit - 3 });
    doc.texto('VR. TOTAL', x.total, y, { tamano: 6.5, negrita: true, color: TENUE, alinear: 'derecha', ancho: anchoTotal - 3 });
    doc.y += 16;
    doc.linea(izq, doc.y, izq + util, doc.y, { color: LINEA });
  };

  doc.aseguraEspacio(70);
  encabezadoTabla();

  if (!items.length) {
    doc.y += 8;
    doc.texto('Esta cotización todavía no tiene renglones.', izq, doc.y, {
      tamano: 9, color: TENUE, alinear: 'centro', ancho: util,
    });
    doc.y += 20;
  }

  for (const grupo of grupos) {
    doc.aseguraEspacio(40);
    doc.rectangulo(izq, doc.y, util, 14, [0.97, 0.98, 0.99]);
    doc.texto(grupo.nombre.toUpperCase(), x.ref + 3, doc.y + 4, { tamano: 7, negrita: true, color: MARCA });
    doc.y += 14;

    for (const it of grupo.items) {
      const titulo = primeraLinea(it.descripcion);
      const detalle = [restoDeLineas(it.descripcion), it.marca].filter(Boolean).join('\n');
      const rTitulo = partirEnRenglones(titulo, anchoDesc - 6, 8.5, true);
      const rDetalle = detalle ? partirEnRenglones(detalle, anchoDesc - 6, 7.5) : [];

      const altoTexto = rTitulo.length * 10 + rDetalle.length * 9 + 8;
      const alto = Math.max(altoTexto, hayFotos ? 40 : 0);

      // Si el renglón no entra entero, se pasa a la hoja siguiente en vez de
      // partirse por la mitad, y allá se repite el encabezado de la tabla.
      if (!doc.cabe(alto + 6)) {
        doc.nuevaPagina();
        encabezadoTabla();
      }

      const yFila = doc.y;
      doc.texto(it.referencia || '', x.ref + 3, yFila + 5, { tamano: 7.5, color: TINTA });

      if (hayFotos) {
        const jpeg = it.foto && fotos.get(it.foto);
        if (jpeg) doc.imagen(it.foto, jpeg, x.foto + 3, yFila + 3, anchoFoto - 8, alto - 8);
      }

      let yTexto = yFila + 5;
      for (const r of rTitulo) {
        doc.texto(r, x.desc + 3, yTexto, { tamano: 8.5, negrita: true, color: TINTA });
        yTexto += 10;
      }
      for (const r of rDetalle) {
        doc.texto(r, x.desc + 3, yTexto, { tamano: 7.5, color: TENUE });
        yTexto += 9;
      }

      if (hayAreas) doc.texto(it.area || '', x.area + 3, yFila + 5, { tamano: 7.5, color: TENUE });
      doc.texto(cantidadLegible(it.cantidad), x.cant, yFila + 5, { tamano: 8.5, color: TINTA, alinear: 'derecha', ancho: anchoCant - 3 });
      doc.texto(dinero(it.precio_unitario, cot.moneda), x.unit, yFila + 5, { tamano: 8.5, color: TINTA, alinear: 'derecha', ancho: anchoUnit - 3 });
      doc.texto(dinero(it.total, cot.moneda), x.total, yFila + 5, { tamano: 8.5, negrita: true, color: TINTA, alinear: 'derecha', ancho: anchoTotal - 3 });

      doc.y = yFila + alto;
      doc.linea(izq, doc.y, izq + util, doc.y, { color: [0.93, 0.95, 0.97] });
    }

    doc.aseguraEspacio(20);
    doc.texto(`Total ${grupo.nombre.toLowerCase()}`, x.unit - 120, doc.y + 4, {
      tamano: 8, negrita: true, color: TENUE, alinear: 'derecha', ancho: 120,
    });
    doc.texto(dinero(grupo.total, cot.moneda), x.total, doc.y + 4, {
      tamano: 8.5, negrita: true, color: TINTA, alinear: 'derecha', ancho: anchoTotal - 3,
    });
    doc.y += 17;
    doc.linea(izq, doc.y, izq + util, doc.y, { color: LINEA });
    doc.y += 8;
  }

  /* ---- Totales y condiciones ---- */
  const condiciones = String(cot.condiciones || aj.condiciones || '');
  const rCondiciones = condiciones ? partirEnRenglones(condiciones, util * 0.52, 8) : [];
  doc.aseguraEspacio(Math.max(rCondiciones.length * 11 + 24, 76));

  const yCierre = doc.y + 6;
  if (rCondiciones.length) {
    doc.texto('CONDICIONES COMERCIALES', izq, yCierre, { tamano: 7, negrita: true, color: MARCA });
    let yc = yCierre + 13;
    for (const r of rCondiciones) {
      doc.texto(r, izq, yc, { tamano: 8, color: TINTA });
      yc += 11;
    }
  }

  const anchoTotales = 200;
  const xTotales = izq + util - anchoTotales;
  let yt = yCierre;
  const filaTotal = (rotulo, valor, { fuerte = false } = {}) => {
    doc.texto(rotulo, xTotales, yt, { tamano: fuerte ? 10 : 8.5, negrita: fuerte, color: fuerte ? TINTA : TENUE });
    doc.texto(valor, xTotales, yt, {
      tamano: fuerte ? 11 : 8.5, negrita: true, color: fuerte ? MARCA : TINTA,
      alinear: 'derecha', ancho: anchoTotales,
    });
    yt += fuerte ? 16 : 13;
  };

  filaTotal('Subtotal', dinero(totales.subtotal, cot.moneda));
  if (totales.servicio) filaTotal(`Servicio ${cot.porcentaje_servicio}%`, dinero(totales.servicio, cot.moneda));
  if (totales.iva) filaTotal(`IVA ${cot.porcentaje_iva}%`, dinero(totales.iva, cot.moneda));
  doc.linea(xTotales, yt, xTotales + anchoTotales, yt, { color: TINTA, grosor: 1.2 });
  yt += 7;
  filaTotal('TOTAL', dinero(totales.total, cot.moneda), { fuerte: true });

  doc.y = Math.max(yt, yCierre + rCondiciones.length * 11 + 13) + 12;

  /* ---- Pie ---- */
  const pie = [aj.empresa, aj.telefono, aj.email].filter(Boolean).join('  ·  ');
  doc.aseguraEspacio(24);
  doc.linea(izq, doc.y, izq + util, doc.y, { color: LINEA });
  doc.texto(pie, izq, doc.y + 7, { tamano: 7.5, color: TENUE, alinear: 'centro', ancho: util });

  return { pdf: doc.terminar(), cotizacion: cot };
}

/** Un nombre de archivo que se entienda al recibirlo por WhatsApp. */
export function nombreDeArchivo(cot) {
  const limpio = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return [`Cotizacion-${cot.id}`, limpio(cot.cliente), limpio(cot.titulo)]
    .filter(Boolean).join('-').slice(0, 90) + '.pdf';
}

export { anchoTexto };
