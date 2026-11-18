// Vista imprimible de una cotización: una página HTML suelta, pensada para
// que el navegador la mande a "Imprimir → Guardar como PDF". No se generan
// PDFs en el servidor a propósito: haría falta una librería pesada y el
// hosting compartido suele quedarse sin memoria con ella. El navegador ya
// sabe hacerlo, y el resultado es un PDF de verdad con el texto buscable.

import * as db from './db.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dinero = (n, moneda = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

/** '2026-08-07' -> '7 de agosto de 2026' */
function fechaLarga(v) {
  const f = String(v ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  const [a, m, d] = f.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Agrupa los renglones por sección, respetando el orden en que se armaron. */
function porSecciones(items) {
  const grupos = [];
  for (const it of items) {
    const nombre = it.seccion || 'Otros';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === nombre) ultimo.items.push(it);
    else grupos.push({ nombre, items: [it] });
  }
  return grupos.map((g) => ({
    ...g,
    total: g.items.reduce((s, i) => s + (Number(i.total) || 0), 0),
  }));
}

const ESTILOS = `
  :root {
    --tinta: #10243a;
    --tenue: #5b7085;
    --linea: #d4dfe9;
    --marca: #0e7fb8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 26px 30px 40px;
    font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--tinta); background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .barra-acciones {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 10px; align-items: center; justify-content: flex-end;
    margin: -26px -30px 22px; padding: 12px 30px;
    background: #eef4f9; border-bottom: 1px solid var(--linea);
  }
  .barra-acciones button, .barra-acciones a {
    font: inherit; font-weight: 600; cursor: pointer; text-decoration: none;
    padding: 9px 18px; border-radius: 9px; border: 1px solid var(--linea);
    background: #fff; color: var(--tinta);
  }
  .barra-acciones .principal { background: var(--marca); border-color: var(--marca); color: #fff; }
  .pista { margin-right: auto; color: var(--tenue); font-size: 12px; }

  header.tope { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .marca img { max-height: 62px; max-width: 240px; }
  .marca h1 { margin: 0; font-size: 21px; letter-spacing: -.3px; }
  .marca .datos { margin-top: 5px; color: var(--tenue); font-size: 11px; line-height: 1.5; }

  .cabecera-oferta { text-align: right; flex-shrink: 0; }
  .cabecera-oferta .titulo { font-size: 15px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .cabecera-oferta table { border-collapse: collapse; margin-top: 8px; margin-left: auto; }
  .cabecera-oferta td { padding: 3px 0 3px 14px; font-size: 11.5px; }
  .cabecera-oferta td:first-child { color: var(--tenue); text-align: right; }
  .cabecera-oferta td:last-child { font-weight: 600; }

  .bloques { display: flex; gap: 16px; margin: 20px 0 18px; }
  .bloque {
    flex: 1; border: 1px solid var(--linea); border-radius: 7px; padding: 11px 14px;
  }
  .bloque h2 {
    margin: 0 0 7px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    color: var(--marca); font-weight: 700;
  }
  .bloque .fila { display: flex; gap: 8px; font-size: 11.5px; padding: 1.5px 0; }
  .bloque .fila span { color: var(--tenue); min-width: 62px; }

  table.items { width: 100%; border-collapse: collapse; }
  table.items thead th {
    background: #eef4f9; border-top: 1px solid var(--linea); border-bottom: 1px solid var(--linea);
    padding: 7px 8px; font-size: 9.5px; letter-spacing: .6px; text-transform: uppercase;
    color: var(--tenue); text-align: left; font-weight: 700;
  }
  table.items th.num, table.items td.num { text-align: right; }
  table.items tbody td {
    padding: 7px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; font-size: 11.5px;
  }
  tr.seccion td {
    background: #f7fafc; font-weight: 700; font-size: 10px; letter-spacing: .8px;
    text-transform: uppercase; color: var(--marca); padding: 7px 8px;
  }
  tr.subtotal-seccion td {
    font-size: 11px; font-weight: 700; padding: 5px 8px 9px;
    border-bottom: 1px solid var(--linea);
  }
  .desc { font-weight: 600; }
  .especificacion {
    display: block; font-weight: 400; color: var(--tenue); font-size: 10.5px;
    margin-top: 2px; white-space: pre-line;
  }
  .foto-celda img {
    width: 46px; height: 46px; max-width: 46px; max-height: 46px;
    object-fit: contain; border: 1px solid var(--linea); border-radius: 4px;
  }
  .foto-celda .sin-foto { color: #b8c6d3; font-size: 13px; }
  td.area { color: var(--tenue); font-size: 10.5px; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }

  .cierre { display: flex; justify-content: space-between; gap: 26px; margin-top: 18px; }
  .condiciones { flex: 1; font-size: 11px; }
  .condiciones h2 {
    margin: 0 0 6px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    color: var(--marca); font-weight: 700;
  }
  .condiciones p { margin: 0; white-space: pre-line; color: var(--tinta); line-height: 1.6; }

  .totales { width: 262px; flex-shrink: 0; }
  .totales div { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
  .totales .gran-total {
    border-top: 2px solid var(--tinta); margin-top: 5px; padding-top: 9px;
    font-size: 15px; font-weight: 700;
  }
  .totales .gran-total b { color: var(--marca); }

  footer.pie {
    margin-top: 26px; padding-top: 11px; border-top: 1px solid var(--linea);
    font-size: 10px; color: var(--tenue); text-align: center;
  }

  @page { size: A4; margin: 12mm 10mm; }
  @media print {
    body { padding: 0; }
    .barra-acciones { display: none; }
    tr, .bloque, .cierre { break-inside: avoid; }
    thead { display: table-header-group; }
  }

  /* En pantalla angosta (mirándola desde el celular antes de mandarla) la
     hoja se reacomoda para poder leerla. El formato impreso no cambia:
     esto vive sólo en @media screen. */
  @media screen and (max-width: 700px) {
    body { padding: 18px 16px 30px; }
    .barra-acciones { margin: -18px -16px 18px; padding: 10px 16px; flex-wrap: wrap; }
    .pista { flex-basis: 100%; margin: 0 0 8px; }
    header.tope { flex-direction: column; gap: 14px; }
    .cabecera-oferta { text-align: left; }
    .cabecera-oferta table { margin-left: 0; }
    .cabecera-oferta td:first-child { text-align: left; padding-left: 0; padding-right: 14px; }
    .bloques { flex-direction: column; }
    .envoltura-tabla { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table.items { min-width: 560px; }
    .cierre { flex-direction: column-reverse; gap: 20px; }
    .totales { width: 100%; }
  }
`;

/**
 * Devuelve el HTML completo de la cotización lista para imprimir, o null si
 * la cotización no existe.
 */
export function paginaCotizacion(id) {
  const cot = db.obtenerPorId('cotizaciones', id);
  if (!cot) return null;

  const items = db.consultar('cotizacion_items', { cotizacion_id: id, limite: 300 });
  const totales = db.totalesCotizacion(id);
  const aj = db.leerAjustes();
  const cliente = cot.cliente_id ? db.obtenerCliente(cot.cliente_id) : null;
  return paginaDesdeDatos({ cot, items, totales, cliente, aj });
}

/**
 * La misma página, pero para un carrito que TODAVÍA no se mandó: nada de
 * esto toca la base —no arma cotización, no crea cliente—, es sólo la
 * cuenta hecha con los mismos números que va a tener el pedido real cuando
 * se mande. Así el cliente puede ver "su cotización" antes de decidirse a
 * enviarla, tal como se la va a llevar después.
 */
export function paginaVistaPreviaPortal(usuarioPortal, itemsCarrito, notas) {
  const aj = db.leerAjustes();
  const items = [];
  for (const it of itemsCarrito || []) {
    const p = db.obtenerPorId('productos', Number(it.producto_id));
    if (!p) continue;
    const cantidad = Number(it.cantidad) > 0 ? Number(it.cantidad) : 1;
    // Mismo cálculo que agregarItem() usa para un pedido real: el precio del
    // nivel de este cliente, y la sección es la categoría del producto.
    const precio_unitario = db.precioSegunNivel(p, usuarioPortal.nivel_precio);
    items.push({
      seccion: p.categoria, descripcion: p.descripcion, referencia: p.referencia,
      marca: p.marca, foto: p.foto, area: null,
      cantidad, precio_unitario, total: precio_unitario * cantidad,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const hoy = new Date();
  const cot = {
    id: null,
    titulo: `Pedido del catálogo · ${hoy.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}`,
    descripcion: notas || null,
    moneda: 'COP',
    creado_en: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`,
    porcentaje_servicio: 0, porcentaje_iva: 0, validez: null, vence_en: null, condiciones: null,
    representante: null, representante_telefono: null, representante_email: null,
  };
  const cliente = {
    nombre: usuarioPortal.nombre, empresa: usuarioPortal.empresa,
    telefono: usuarioPortal.telefono, email: usuarioPortal.email,
  };
  return paginaDesdeDatos({
    cot, items, totales: { subtotal, servicio: 0, iva: 0, total: subtotal }, cliente, aj, esVistaPrevia: true,
  });
}

function paginaDesdeDatos({ cot, items, totales, cliente, aj, esVistaPrevia = false }) {
  const grupos = porSecciones(items);
  const hayFotos = items.some((i) => i.foto);
  // El área (Sala, Cocina, Habitación…) es opcional: la columna sólo aparece
  // si al menos un renglón la tiene cargada.
  const hayAreas = items.some((i) => String(i.area || '').trim());

  // Quien firma esta oferta: el que se le puso a la cotización, y si no, el
  // de los datos de la empresa.
  const rep = {
    nombre: cot.representante || aj.representante,
    telefono: cot.representante_telefono || aj.representante_telefono,
    email: cot.representante_email || aj.representante_email,
  };

  const filaDato = (rotulo, valor) =>
    valor ? `<div class="fila"><span>${esc(rotulo)}</span><b>${esc(valor)}</b></div>` : '';

  const columnas = 5 + (hayFotos ? 1 : 0) + (hayAreas ? 1 : 0);

  const cuerpo = grupos.map((g) => `
    <tr class="seccion"><td colspan="${columnas}">${esc(g.nombre)}</td></tr>
    ${g.items.map((it) => `
      <tr>
        <td>${esc(it.referencia || '')}</td>
        ${hayFotos ? `<td class="foto-celda">${it.foto
          ? `<img src="${esc(it.foto)}" alt="" width="46" height="46" />`
          : '<span class="sin-foto" title="Este renglón no tiene foto">—</span>'}</td>` : ''}
        <td>
          <span class="desc">${esc(primeraLinea(it.descripcion))}</span>
          ${restoDeLineas(it.descripcion) ? `<span class="especificacion">${esc(restoDeLineas(it.descripcion))}</span>` : ''}
          ${it.marca ? `<span class="especificacion">${esc(it.marca)}</span>` : ''}
        </td>
        ${hayAreas ? `<td class="area">${esc(it.area || '')}</td>` : ''}
        <td class="num">${esc(formatearCantidad(it.cantidad))}</td>
        <td class="num">${dinero(it.precio_unitario, cot.moneda)}</td>
        <td class="num">${dinero(it.total, cot.moneda)}</td>
      </tr>`).join('')}
    <tr class="subtotal-seccion">
      <td colspan="${columnas - 1}" class="num">Total ${esc(g.nombre.toLowerCase())}</td>
      <td class="num">${dinero(g.total, cot.moneda)}</td>
    </tr>`).join('');

  const sinItems = `<tr><td colspan="${columnas}" style="padding:22px;text-align:center;color:var(--tenue)">
    ${esVistaPrevia ? 'Todavía no agregaste nada al pedido.' : 'Esta cotización todavía no tiene renglones.'}</td></tr>`;

  const tituloVentana = esVistaPrevia ? `Vista previa · ${esc(cot.titulo)}` : `Cotización ${esc(cot.id)} · ${esc(cot.titulo)}`;
  const tituloOferta = esVistaPrevia ? 'Vista previa de tu pedido' : `Cotización N.º ${esc(cot.id)}`;
  const pistaInicial = esVistaPrevia
    ? 'Esto es una <b>vista previa</b>: todavía no se mandó nada. Volvé y tocá «Enviar pedido» para confirmarlo.'
    : 'Usá «Imprimir» y elegí <b>Guardar como PDF</b> para mandársela al cliente.';

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${tituloVentana}</title>
  <style>${ESTILOS}</style>
</head>
<body>

  <div class="barra-acciones">
    <span class="pista" id="pista">${pistaInicial}</span>
    <a href="/" id="volver">Volver</a>
    <button class="principal" id="btn-imprimir" onclick="window.print()">Imprimir</button>
  </div>
  <script>
    // "Volver" apunta al panel por defecto, pero un cliente del catálogo que
    // llega hasta acá con su propia sesión no tiene panel al que volver: si
    // detecta esa cookie, va de vuelta a la tienda.
    if (document.cookie.includes('ari_portal_sesion=')) {
      document.getElementById('volver').href = '/tienda.html';
    }
    // En la aplicación instalada en el celular, iOS no da diálogo de
    // impresión: el botón no hace absolutamente nada y no hay manera de
    // saberlo desde acá una vez apretado. Se detecta antes y se manda a la
    // pantalla que sí arma el PDF, en vez de dejar a alguien apretando un
    // botón muerto.
    (function () {
      var instalada = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
      if (!instalada) return;
      document.getElementById('btn-imprimir').style.display = 'none';
      document.getElementById('pista').innerHTML = ${esVistaPrevia ? "'Es sólo una vista previa: acá adentro el celular no abre el menú de impresión.'" : "'Para mandársela al cliente, volvé y usá <b>Guardar PDF</b> o <b>Enviar por WhatsApp</b>: ' + 'acá adentro el celular no abre el menú de impresión.'"};
    }());
  </script>

  <header class="tope">
    <div class="marca">
      <img src="${esc(aj.logo || '/logo.png')}" alt="${esc(aj.empresa)}"
           onerror="if (this.dataset.n) { this.remove(); } else { this.dataset.n = 1; this.src = '/logo.svg'; }" />
      ${/* El logo ya dice el nombre de la empresa: repetirlo abajo en letras
            era decirlo dos veces. Sin logo cargado sí hace falta, o la oferta
            saldría sin decir de quién es. */ ''}
      ${aj.logo ? '' : `<h1>${esc(aj.empresa)}</h1>`}
      <div class="datos">
        ${[aj.nit && `NIT ${aj.nit}`, aj.direccion, aj.telefono, aj.email]
          .filter(Boolean).map(esc).join('<br />')}
      </div>
    </div>

    <div class="cabecera-oferta">
      <div class="titulo">${tituloOferta}</div>
      <table>
        <tr><td>Fecha</td><td>${esc(fechaLarga(cot.creado_en))}</td></tr>
        ${aj.ciudad ? `<tr><td>Ciudad</td><td>${esc(aj.ciudad)}</td></tr>` : ''}
        <tr><td>Validez</td><td>${esc(cot.validez || aj.validez)}</td></tr>
        ${cot.vence_en ? `<tr><td>Vence</td><td>${esc(fechaLarga(cot.vence_en))}</td></tr>` : ''}
      </table>
    </div>
  </header>

  <div class="bloques">
    <div class="bloque">
      <h2>Datos del cliente</h2>
      ${cliente ? [
        filaDato('Nombre', cliente.nombre),
        filaDato('Empresa', cliente.empresa),
        filaDato('Teléfono', cliente.telefono),
        filaDato('Correo', cliente.email),
        filaDato('Dirección', cliente.direccion),
      ].join('') : '<div class="fila"><span>Sin cliente asignado</span></div>'}
    </div>

    <div class="bloque">
      <h2>Representante de ventas</h2>
      ${[
        filaDato('Nombre', rep.nombre),
        filaDato('Teléfono', rep.telefono),
        filaDato('Correo', rep.email),
      ].join('') || '<div class="fila"><span>Sin datos cargados</span></div>'}
    </div>
  </div>

  <h2 style="font-size:14px;margin:0 0 10px">${esc(cot.titulo)}</h2>
  ${cot.descripcion ? `<p style="margin:0 0 12px;color:var(--tenue);font-size:11.5px">${esc(cot.descripcion)}</p>` : ''}

  <div class="envoltura-tabla">
  <table class="items">
    <thead>
      <tr>
        <th style="width:88px">Ref.</th>
        ${hayFotos ? '<th style="width:56px">Foto</th>' : ''}
        <th>Descripción</th>
        ${hayAreas ? '<th style="width:92px">Área</th>' : ''}
        <th class="num" style="width:44px">Cant.</th>
        <th class="num" style="width:96px">Vr. unitario</th>
        <th class="num" style="width:104px">Vr. total</th>
      </tr>
    </thead>
    <tbody>${items.length ? cuerpo : sinItems}</tbody>
  </table>
  </div>

  <div class="cierre">
    <div class="condiciones">
      <h2>Condiciones comerciales</h2>
      <p>${esc(cot.condiciones || aj.condiciones)}</p>
    </div>

    <div class="totales">
      <div><span>Subtotal</span><span class="num">${dinero(totales.subtotal, cot.moneda)}</span></div>
      ${totales.servicio ? `<div><span>Servicio ${esc(cot.porcentaje_servicio)}%</span><span class="num">${dinero(totales.servicio, cot.moneda)}</span></div>` : ''}
      ${totales.iva ? `<div><span>IVA ${esc(cot.porcentaje_iva)}%</span><span class="num">${dinero(totales.iva, cot.moneda)}</span></div>` : ''}
      <div class="gran-total"><span>Total</span><b class="num">${dinero(totales.total, cot.moneda)}</b></div>
    </div>
  </div>

  <footer class="pie">
    ${esc(aj.empresa)}${aj.telefono ? ` · ${esc(aj.telefono)}` : ''}${aj.email ? ` · ${esc(aj.email)}` : ''}
  </footer>

</body>
</html>`;
}

/** Las fichas técnicas vienen en varias líneas: la primera es el nombre. */
const primeraLinea = (texto) => String(texto ?? '').split('\n')[0].trim();

const restoDeLineas = (texto) =>
  String(texto ?? '').split('\n').slice(1).join('\n').replace(/\n{2,}/g, '\n').trim();

/** 3 en vez de 3.0, pero 2.5 se conserva. */
const formatearCantidad = (n) =>
  Number.isInteger(Number(n)) ? String(Number(n)) : String(n);
