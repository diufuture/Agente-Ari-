// Recorrido completo del sistema, como lo usaría el negocio en una semana:
// se arma el catálogo, se dicta una cotización, se le cobran abonos, se
// mueve inventario, llega una lista de precios actualizada y se imprime.
//
// Cada paso se compara contra el número que debería dar, no sólo contra que
// "no explote". Correr con:  npm test
//
// Usa su propia base de datos temporal: no toca la del negocio.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

/** Un .zip mínimo pero de verdad, para poder armar un .xlsx de prueba. */
const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

function armarZip(archivos) {
  const locales = [];
  const central = [];
  let off = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const comp = deflateRawSync(datos);
    const n = Buffer.from(nombre, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(datos), 14); lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(n.length, 26);
    locales.push(lh, n, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc32(datos), 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(datos.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, n);
    off += lh.length + n.length + comp.length;
  }
  const cuerpo = Buffer.concat(locales);
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, dir, fin]);
}

const carpeta = mkdtempSync(join(tmpdir(), 'ari-prueba-'));
process.env.ARI_DB = join(carpeta, 'prueba.db');

const fallos = [];
const ok = [];
function comprobar(que, real, esperado) {
  const igual = JSON.stringify(real) === JSON.stringify(esperado);
  (igual ? ok : fallos).push(`${igual ? '✓' : '✗'} ${que}: ${JSON.stringify(real)}${igual ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

const db = await import('./server/db.js');
const tools = await import('./server/tools.js');
const imprimir = await import('./server/imprimir.js');
const t = (n, a) => tools.ejecutar(n, a);

/* 1 · Catálogo ---------------------------------------------------- */
db.conciliarProductos('Interruptores', [
  { fila: 2, referencia: 'G7-2', descripcion: 'Interruptor 2 canales', precio_canal: 154868, precio_constructor: 216816, precio_cliente: 247790 },
  { fila: 3, referencia: 'G7-3', descripcion: 'Interruptor 3 canales', precio_canal: 163793, precio_constructor: 229311, precio_cliente: 262070 },
], {});
db.conciliarProductos('Propios', [
  { fila: 2, referencia: 'CC-CAM', descripcion: 'Cámara IP Click Control', precio_cliente: 380000, stock: 25 },
], { manejaInventario: true });

comprobar('productos en catálogo', db.consultar('productos', {}).length, 3);
comprobar('stock del producto propio', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, 25);

/* 2 · Cotización dictada ------------------------------------------- */
t('crear_cotizacion', { cliente: 'Sr. Jimmy Forero', titulo: 'Automatización casa', porcentaje_iva: 19 });
comprobar('queda en curso al crearla', Boolean(db.cotizacionActiva()), true);

t('agregar_item_cotizacion', { producto: 'G7-2', cantidad: 7 });     // sin nombrar cliente
t('agregar_item_cotizacion', { producto: 'G7-3', cantidad: 3 });
t('agregar_item_cotizacion', { descripcion: 'Mano de obra', precio_unitario: 1500000, seccion: 'Mano de obra' });

const cotId = db.cotizacionActiva().id;
const esperadoSub = 7 * 247790 + 3 * 262070 + 1500000;
comprobar('subtotal', db.totalesCotizacion(cotId).subtotal, esperadoSub);
comprobar('total con IVA 19%', Math.round(db.totalesCotizacion(cotId).total), Math.round(esperadoSub * 1.19));
comprobar('monto guardado = total', db.obtenerPorId('cotizaciones', cotId).monto, Math.round(esperadoSub * 1.19));

/* 3 · Ajustes por voz ---------------------------------------------- */
const items = db.consultar('cotizacion_items', { cotizacion_id: cotId });
t('ajustar_item_cotizacion', { item_id: items[0].id, porcentaje: 15 });
comprobar('precio tras +15%', db.obtenerPorId('cotizacion_items', items[0].id).precio_unitario, Math.round(247790 * 1.15));

t('ajustar_cotizacion', { porcentaje_servicio: 20 });
const tot = db.totalesCotizacion(cotId);
const sub2 = Math.round(247790 * 1.15) * 7 + 3 * 262070 + 1500000;
comprobar('subtotal tras ajuste', tot.subtotal, sub2);
comprobar('servicio 20%', Math.round(tot.servicio), Math.round(sub2 * 0.2));
comprobar('total con servicio e IVA', Math.round(tot.total), Math.round(sub2 * 1.2 * 1.19));

t('finalizar_cotizacion', {});
comprobar('se cierra la sesión', db.cotizacionActiva(), null);

/* 4 · Abonos sobre esa cotización ---------------------------------- */
t('registrar_abono', { cliente: 'Jimmy', monto: 3000000, nota: 'Anticipo' });
const cot = db.obtenerPorId('cotizaciones', cotId);
comprobar('abonado', cot.abonado, 3000000);
comprobar('saldo = total - abonado', cot.saldo, cot.monto - 3000000);

/* 5 · Inventario ---------------------------------------------------- */
t('ajustar_inventario', { producto: 'CC-CAM', cantidad: -4, motivo: 'venta' });
comprobar('stock tras vender 4', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, 21);
let rechazado = false;
try { t('ajustar_inventario', { producto: 'G7-2', cantidad: 5 }); } catch { rechazado = true; }
comprobar('rechaza inventario en producto de proveedor', rechazado, true);

/* 5b · Aprobar descuenta del inventario ----------------------------- */
const stockAntes = db.consultar('productos', { texto: 'CC-CAM' })[0].stock;   // 21
t('crear_cotizacion', { cliente: 'Ferretería El Tornillo', titulo: 'Cámaras' });
const cotStock = db.cotizacionActiva().id;
t('agregar_item_cotizacion', { producto: 'CC-CAM', cantidad: 6 });
t('agregar_item_cotizacion', { producto: 'G7-3', cantidad: 2 });  // de proveedor: no toca bodega
t('finalizar_cotizacion', {});

comprobar('cotizar todavía no descuenta', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes);

t('actualizar_estado', { entidad: 'cotizaciones', id: cotStock, estado: 'aprobada' });
comprobar('al aprobar, descuenta', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes - 6);

// Cambiar la cantidad de un renglón de una cotización ya aprobada
const itemCam = db.consultar('cotizacion_items', { cotizacion_id: cotStock })
  .find((i) => i.referencia === 'CC-CAM');
db.actualizarItem(itemCam.id, { cantidad: 10 });
comprobar('cambiar la cantidad rehace el descuento', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes - 10);

// Aprobarla de nuevo no debe descontar dos veces
t('actualizar_estado', { entidad: 'cotizaciones', id: cotStock, estado: 'aprobada' });
comprobar('re-aprobar no descuenta dos veces', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes - 10);

// Y si deja de estar aprobada, vuelve
t('actualizar_estado', { entidad: 'cotizaciones', id: cotStock, estado: 'rechazada' });
comprobar('desaprobar devuelve el stock', db.consultar('productos', { texto: 'CC-CAM' })[0].stock, stockAntes);

/* 6 · Lista actualizada -------------------------------------------- */
db.actualizar('productos', 1, { foto: '/uploads/productos/1.png', notas: 'no borrar' });
const inf = db.conciliarProductos('Interruptores', [
  { fila: 2, referencia: 'G7-2', descripcion: 'Interruptor 2 canales', precio_cliente: 268000 },
  { fila: 4, referencia: 'G7-4', descripcion: 'Interruptor 4 canales', precio_cliente: 295000 },
], { descontinuarAusentes: true });

comprobar('lista nueva: nuevos', inf.nuevos.length, 1);
comprobar('lista nueva: actualizados', inf.actualizados.length, 1);
comprobar('lista nueva: ausentes', inf.ausentes.length, 1);
const g72 = db.obtenerPorId('productos', 1);
comprobar('conserva la foto', g72.foto, '/uploads/productos/1.png');
comprobar('conserva la nota', g72.notas, 'no borrar');
comprobar('precio actualizado', g72.precio_cliente, 268000);
comprobar('el descontinuado no sale al cotizar', db.consultar('productos', {}).some((p) => p.referencia === 'G7-3'), false);
comprobar('pero sigue existiendo', db.consultar('productos', { incluir_inactivos: true }).some((p) => p.referencia === 'G7-3'), true);

/* 7 · La cotización vieja no se movió ------------------------------ */
const cotDespues = db.obtenerPorId('cotizaciones', cotId);
comprobar('el total de la cotización enviada no cambió', cotDespues.monto, cot.monto);
comprobar('el renglón conserva su precio de entonces',
  db.obtenerPorId('cotizacion_items', items[1].id).precio_unitario, 262070);

/* 7b · Editar una cotización ya terminada --------------------------- */
// El cliente pide cambios sobre la oferta ya enviada: se le cambia el nombre
// al renglón, se le pone el área, y recién ahí se aprueba.
db.actualizarItem(items[0].id, {
  descripcion: 'Panel táctil de 4 pulgadas\nMarco de aluminio, blanco',
  area: 'Sala',
  seccion: 'Control',
});
const editado = db.obtenerPorId('cotizacion_items', items[0].id);
comprobar('se le cambia el nombre al renglón', editado.descripcion.split('\n')[0], 'Panel táctil de 4 pulgadas');
comprobar('se le pone el área', editado.area, 'Sala');
comprobar('el precio no se movió al renombrarlo', editado.precio_unitario, Math.round(247790 * 1.15));

// Un campo que no existe no puede colarse dentro del SQL
db.actualizarItem(items[0].id, { 'x = 1, cantidad': 99 });
comprobar('un campo inventado se ignora', db.obtenerPorId('cotizacion_items', items[0].id).cantidad, 7);

/* 8 · Impresión ----------------------------------------------------- */
const html = imprimir.paginaCotizacion(cotId);
comprobar('la página imprimible se genera', typeof html === 'string' && html.includes('Cotización N.º'), true);
comprobar('trae el total impreso', html.includes(new Intl.NumberFormat('es-CO').format(Math.round(cotDespues.monto))), true);
comprobar('cotización inexistente devuelve null', imprimir.paginaCotizacion(9999), null);
comprobar('el nombre editado sale impreso', html.includes('Panel táctil de 4 pulgadas'), true);
comprobar('la ficha técnica sale aparte', html.includes('Marco de aluminio, blanco'), true);
comprobar('aparece la columna de área porque se usó', html.includes('<th style="width:92px">Área</th>'), true);
comprobar('y el área del renglón', html.includes('<td class="area">Sala</td>'), true);

// Representante: el de la cotización manda sobre el de la empresa
db.guardarAjustes({ representante: 'Mostrador', representante_telefono: '601 000' });
comprobar('sin representante propio, sale el de la empresa',
  imprimir.paginaCotizacion(cotId).includes('Mostrador'), true);
db.actualizar('cotizaciones', cotId, { representante: 'Andrés Gómez', representante_telefono: '310 555' });
const conRep = imprimir.paginaCotizacion(cotId);
comprobar('el de la cotización le gana al de la empresa', conRep.includes('Andrés Gómez'), true);
comprobar('y desplaza al de la empresa', conRep.includes('Mostrador'), false);

// Logo: sale el que se cargó en ajustes
db.guardarAjustes({ logo: '/uploads/marca/logo.webp?v=9' });
comprobar('el logo cargado encabeza la hoja',
  imprimir.paginaCotizacion(cotId).includes('src="/uploads/marca/logo.webp?v=9"'), true);

// Una cotización sin áreas no debe traer la columna
t('crear_cotizacion', { cliente: 'Sin áreas', titulo: 'Simple' });
const cotSimple = db.cotizacionActiva().id;
t('agregar_item_cotizacion', { descripcion: 'Visita técnica', precio_unitario: 90000 });
t('finalizar_cotizacion', {});
comprobar('sin áreas cargadas, la columna no aparece',
  imprimir.paginaCotizacion(cotSimple).includes('>Área</th>'), false);

/* 8b · Cómo Excel ancla las fotos ----------------------------------- */
// Cuatro switches, cuatro maneras de pegar la foto en la misma hoja. Es
// exactamente lo que pasa cuando alguien arma la lista a mano.
const xlsx = await import('./server/xlsx.js');

const anclaje = (tipo, desde, hasta, id) => `
  <xdr:${tipo}>
    ${tipo === 'absoluteAnchor' ? '<xdr:pos x="100" y="200"/>' : `<xdr:from><xdr:col>0</xdr:col><xdr:row>${desde}</xdr:row></xdr:from>`}
    ${tipo === 'twoCellAnchor' ? `<xdr:to><xdr:col>1</xdr:col><xdr:row>${hasta}</xdr:row></xdr:to>` : ''}
    <xdr:pic><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic>
  </xdr:${tipo}>`;

const dibujo = `<xdr:wsDr>
  ${anclaje('oneCellAnchor', 1, 1, 'rId1')}
  ${anclaje('twoCellAnchor', 2, 4, 'rId2')}
  ${anclaje('twoCellAnchor', 2, 5, 'rId3')}
  ${anclaje('absoluteAnchor', 0, 0, 'rId4')}
</xdr:wsDr>`;

const { anclajes, sinFila } = xlsx.anclajesDeDibujo(dibujo);
comprobar('lee los anclajes que sí tienen fila', anclajes.length, 3);
comprobar('la foto estirada conserva hasta dónde llega', anclajes[1], { desde: 2, hasta: 4, embed: 'rId2' });
comprobar('una foto pegada a una sola celda empieza y termina igual', anclajes[0], { desde: 1, hasta: 1, embed: 'rId1' });
comprobar('la foto suelta se cuenta como no ubicable', sinFila, 1);

// Y sobre un .xlsx armado de verdad: cuatro interruptores, cuatro fotos
// pegadas de distinta manera. Dos arrancan en la misma fila porque alguien
// estiró una hacia arriba, que es lo que pasa cuando la lista se arma a mano.
// Antes de cubrir el rango completo del anclaje, la tercera se perdía sin
// avisar y el producto salía sin foto en la oferta ya enviada.
const png = (b) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from([b])]);
const filaXml = (r, ref, desc, precio) =>
  `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${ref}</t></is></c>`
  + `<c r="B${r}" t="inlineStr"><is><t>${desc}</t></is></c><c r="C${r}"><v>${precio}</v></c></row>`;
const anc = (tipo, desde, hasta, id) => `<xdr:${tipo}>
  <xdr:from><xdr:col>0</xdr:col><xdr:row>${desde}</xdr:row></xdr:from>
  ${hasta === null ? '' : `<xdr:to><xdr:col>1</xdr:col><xdr:row>${hasta}</xdr:row></xdr:to>`}
  <xdr:pic><xdr:blipFill><a:blip r:embed="${id}"/></xdr:blipFill></xdr:pic></xdr:${tipo}>`;

const libro = armarZip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Interruptores" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>REF</t></is></c><c r="B1" t="inlineStr"><is><t>DESCRIPCION</t></is></c><c r="C1" t="inlineStr"><is><t>PRECIO CLIENTE</t></is></c></row>
    ${filaXml(2, 'G7-1', 'Interruptor 1 canal', 120000)}${filaXml(3, 'G7-2', 'Interruptor 2 canales', 154868)}
    ${filaXml(4, 'G7-3', 'Interruptor 3 canales', 163793)}${filaXml(5, 'G7-4', 'Interruptor 4 canales', 180000)}
  </sheetData><drawing r:id="rIdD"/></worksheet>`,
  'xl/worksheets/_rels/sheet1.xml.rels': '<Relationships><Relationship Id="rIdD" Target="../drawings/drawing1.xml"/></Relationships>',
  'xl/drawings/drawing1.xml': `<xdr:wsDr>${anc('oneCellAnchor', 1, null, 'rId1')}${
    anc('twoCellAnchor', 2, 3, 'rId2')}${anc('twoCellAnchor', 2, 4, 'rId3')}${anc('oneCellAnchor', 4, null, 'rId4')}</xdr:wsDr>`,
  'xl/drawings/_rels/drawing1.xml.rels': `<Relationships>
    <Relationship Id="rId1" Target="../media/image1.png"/><Relationship Id="rId2" Target="../media/image2.png"/>
    <Relationship Id="rId3" Target="../media/image3.png"/><Relationship Id="rId4" Target="../media/image4.png"/></Relationships>`,
  'xl/media/image1.png': png(1), 'xl/media/image2.png': png(2),
  'xl/media/image3.png': png(3), 'xl/media/image4.png': png(4),
});

const hojaLeida = xlsx.leerXlsx(libro, { conImagenes: true }).hojas[0];
comprobar('los cuatro interruptores quedan con su foto',
  [1, 2, 3, 4].map((f) => hojaLeida.imagenes.get(f)?.datos[8] ?? null), [1, 2, 3, 4]);
comprobar('y ninguna queda sin ubicar', hojaLeida.imagenes.sinUbicar, 0);

/* 9 · Borrados en cadena -------------------------------------------- */
t('eliminar', { entidad: 'productos', id: 1 });
comprobar('borrar del catálogo no borra el renglón',
  db.obtenerPorId('cotizacion_items', items[0].id).descripcion.split('\n')[0],
  'Panel táctil de 4 pulgadas');

/* ------------------------------------------------------------------ */

db.db.close();
rmSync(carpeta, { recursive: true, force: true });

console.log(ok.join('\n'));
if (fallos.length) {
  console.log('\n--- FALLÓ ---');
  console.log(fallos.join('\n'));
}
console.log(`\n${ok.length} correctas, ${fallos.length} fallidas`);
process.exit(fallos.length ? 1 : 0);
