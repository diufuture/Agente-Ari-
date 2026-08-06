/* ══════════════════════════════════════════════════════════════════
   Clic Control · Ari — interfaz
   ══════════════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const estado = {
  vista: 'inicio',
  historial: [],       // últimos turnos de conversación (texto plano)
  resumen: null,
  vistaAsistente: null, // resultado de la última consulta por voz
  cotizacionAbierta: null, // id de la cotización cuyo detalle se está viendo
};

/* ─────────── Formateo ─────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtFecha(v) {
  if (!v) return '—';
  const [f, h] = String(v).replace(' ', 'T').split('T');
  const [a, m, d] = f.split('-');
  if (!d) return v;
  const hoy = new Date().toLocaleDateString('sv-SE');
  const etiqueta = f === hoy ? 'Hoy' : `${Number(d)} ${MESES[Number(m) - 1]}`;
  return h ? `${etiqueta} · ${h.slice(0, 5)}` : etiqueta;
}

const fmtDinero = (n, moneda = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const esPasado = (v) => v && String(v).slice(0, 10) < new Date().toLocaleDateString('sv-SE');

/* ─────────── API ─────────── */

async function api(ruta, opciones = {}) {
  const r = await fetch(`/api${ruta}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

/* ─────────── Avisos ─────────── */

let avisoTimer;
function avisar(mensaje, esError = false) {
  const el = $('#aviso');
  el.textContent = mensaje;
  el.className = `aviso visible${esError ? ' error' : ''}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove('visible'), 3800);
}

/* ══════════════════════════════════════════════════════════════════
   Renderizado
   ══════════════════════════════════════════════════════════════════ */

const TITULOS = {
  inicio: 'Hoy',
  agenda: 'Agenda',
  clientes: 'Clientes',
  cotizaciones: 'Cotizaciones',
  cobros: 'Cobros',
  recordatorios: 'Recordatorios',
};

const ENCABEZADOS = {
  nombre: 'Nombre', empresa: 'Empresa', telefono: 'Teléfono', email: 'Correo',
  inicio: 'Cuándo', titulo: 'Asunto', cliente: 'Cliente', lugar: 'Lugar',
  estado: 'Estado', vence_en: 'Vence', texto: 'Detalle', prioridad: 'Prioridad',
  creado_en: 'Fecha', monto: 'Valor', concepto: 'Concepto', direccion: 'Dirección',
  abonado: 'Abonado', saldo: 'Saldo', cotizacion: 'Cotización', nota: 'Nota', fecha: 'Fecha',
};

/** Cómo se pinta cada columna. */
function celda(columna, fila) {
  const v = fila[columna];
  switch (columna) {
    case 'inicio':
    case 'vence_en':
    case 'creado_en': {
      const texto = fmtFecha(v);
      const rojo = columna !== 'creado_en' && esPasado(v) && fila.estado === 'pendiente';
      return `<span style="${rojo ? 'color:var(--alerta);font-weight:600' : ''}">${escapar(texto)}</span>`;
    }
    case 'monto':
    case 'abonado':
      return fmtDinero(v, fila.moneda);
    case 'saldo': {
      const saldado = Number(v) <= 0;
      return `<span style="color:${saldado ? 'var(--verde)' : 'var(--ambar)'};font-weight:600">${
        saldado ? 'saldada' : fmtDinero(v, fila.moneda)}</span>`;
    }
    case 'fecha':
      return escapar(fmtFecha(v));
    case 'estado':
    case 'prioridad':
      return `<span class="pastilla ${escapar(v)}">${escapar(v)}</span>`;
    case 'telefono':
      return v ? `<a href="tel:${escapar(v)}" style="color:var(--acento);text-decoration:none">${escapar(v)}</a>` : '—';
    case 'email':
      return v ? `<a href="mailto:${escapar(v)}" style="color:var(--acento);text-decoration:none">${escapar(v)}</a>` : '—';
    default:
      return escapar(v ?? '—');
  }
}

const NUEVO_ESTADO = {
  citas: 'completada',
  recordatorios: 'completada',
  cotizaciones: 'aprobada',
  cobros: 'pagado',
};

function tabla(entidad, columnas, filas, { vacio } = {}) {
  if (!filas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Nada por acá</strong>${escapar(vacio || 'Pedíselo a Ari por voz y aparece de inmediato.')}
    </div></div>`;
  }

  const accionable = entidad in NUEVO_ESTADO;
  const cabeceras = columnas.map((c) => {
    const num = c === 'monto';
    return `<th${num ? ' class="num"' : ''}>${ENCABEZADOS[c] || c}</th>`;
  }).join('');

  const cuerpo = filas.map((f) => {
    const celdas = columnas.map((c, i) => {
      const clases = [c === 'monto' ? 'num' : '', i === 1 || (entidad === 'clientes' && i === 0) ? 'principal-col' : ''].filter(Boolean).join(' ');
      // data-rotulo alimenta el ::before que muestra el nombre de la columna
      // cuando la tabla se apila como ficha en pantallas angostas.
      return `<td${clases ? ` class="${clases}"` : ''} data-rotulo="${ENCABEZADOS[c] || c}">${celda(c, f)}</td>`;
    }).join('');

    const listo = accionable && f.estado !== 'pendiente' && f.estado !== 'enviada';
    const acciones = `<td class="num acciones"><div class="acciones-fila">
      ${entidad === 'cotizaciones'
        ? `<button class="mini destacado" data-accion="abrir-cotizacion" data-id="${f.id}">Abonos</button>`
        : ''}
      ${accionable && !listo
        ? `<button class="mini" data-accion="estado" data-entidad="${entidad}" data-id="${f.id}" data-estado="${NUEVO_ESTADO[entidad]}">${
            entidad === 'cobros' ? 'Pagado' : 'Listo'}</button>`
        : ''}
      <button class="mini peligro" data-accion="borrar" data-entidad="${entidad}" data-id="${f.id}">Borrar</button>
    </div></td>`;

    return `<tr>${celdas}${acciones}</tr>`;
  }).join('');

  return `<div class="tarjeta"><div class="tabla-envoltura"><table>
    <thead><tr>${cabeceras}<th class="num"></th></tr></thead>
    <tbody>${cuerpo}</tbody>
  </table></div></div>`;
}

function bloque(titulo, contenido) {
  return `<section class="bloque">
    <h2 class="bloque-titulo">${escapar(titulo)}</h2>
    ${contenido}
  </section>`;
}

function lineaTiempo(citas) {
  if (!citas.length) {
    return `<div class="tarjeta"><div class="vacio">
      <strong>Agenda libre</strong>No tenés citas para hoy.
    </div></div>`;
  }
  return `<div class="tarjeta"><div class="linea-tiempo">${citas.map((c) => `
    <div class="evento">
      <div class="hora">${escapar((c.inicio || '').split('T')[1]?.slice(0, 5) || '--:--')}</div>
      <div>
        <div class="que">${escapar(c.titulo)}</div>
        <div class="quien">${escapar([c.cliente, c.lugar].filter(Boolean).join(' · ') || 'Sin cliente asignado')}</div>
      </div>
      <div class="acciones-fila">
        <button class="mini" data-accion="estado" data-entidad="citas" data-id="${c.id}" data-estado="completada">Listo</button>
      </div>
    </div>`).join('')}</div></div>`;
}

/** Ficha de una cotización: lo cotizado, lo abonado, lo que falta y sus abonos. */
function detalleCotizacion(cot, abonos) {
  const saldado = Number(cot.saldo) <= 0;

  const filas = abonos.length
    ? abonos.map((a) => `
        <div class="abono">
          <div class="abono-fecha">${escapar(fmtFecha(a.fecha || a.creado_en))}</div>
          <div class="abono-nota">${escapar(a.nota || 'Abono')}</div>
          <div class="abono-monto">${fmtDinero(a.monto, cot.moneda)}</div>
          <button class="mini peligro" data-accion="borrar-abono" data-id="${a.id}">Quitar</button>
        </div>`).join('')
    : '<div class="vacio"><strong>Sin abonos todavía</strong>Registrá el primero acá abajo o pedíselo a Ari.</div>';

  return `
    <button class="volver" data-accion="cerrar-cotizacion">← Cotizaciones</button>

    <div class="tarjeta ficha">
      <div class="ficha-cabecera">
        <div>
          <h2>${escapar(cot.titulo)}</h2>
          <p>${escapar(cot.cliente || 'Sin cliente')} · creada ${escapar(fmtFecha(String(cot.creado_en || '').slice(0, 10)))}</p>
        </div>
        <span class="pastilla ${escapar(cot.estado)}">${escapar(cot.estado)}</span>
      </div>

      <div class="ficha-cifras">
        <div><span>Cotizado</span><strong>${fmtDinero(cot.monto, cot.moneda)}</strong></div>
        <div><span>Abonado</span><strong class="ok">${fmtDinero(cot.abonado, cot.moneda)}</strong></div>
        <div><span>Saldo</span><strong class="${saldado ? 'ok' : 'pend'}">${
          saldado ? 'Saldada' : fmtDinero(cot.saldo, cot.moneda)}</strong></div>
      </div>

      <div class="barra-saldo" title="${Math.round((cot.abonado / (cot.monto || 1)) * 100)}% abonado">
        <span style="width:${Math.min(100, Math.round((cot.abonado / (cot.monto || 1)) * 100))}%"></span>
      </div>

      ${cot.descripcion ? `<p class="ficha-desc">${escapar(cot.descripcion)}</p>` : ''}
    </div>

    ${bloque('Abonos', `<div class="tarjeta"><div class="lista-abonos">${filas}</div></div>`)}

    ${bloque('Registrar un abono', `
      <div class="tarjeta">
        <form class="form-abono" id="form-abono">
          <label><span>Monto</span>
            <input name="monto" type="number" min="1" step="1" required placeholder="500000" /></label>
          <label><span>Fecha</span>
            <input name="fecha" type="date" value="${new Date().toLocaleDateString('sv-SE')}" /></label>
          <label class="ancho"><span>Nota</span>
            <input name="nota" type="text" placeholder="Transferencia, efectivo, referencia…" /></label>
          <button type="submit">Registrar abono</button>
        </form>
      </div>`)}
  `;
}

/* ─────────── Vistas ─────────── */

async function pintar() {
  const contenedor = $('#contenido');
  const v = estado.vista;

  // Ficha de una cotización (tiene prioridad sobre todo lo demás)
  if (estado.cotizacionAbierta) {
    contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
    try {
      const [cot, { filas }] = await Promise.all([
        api(`/cotizaciones/${estado.cotizacionAbierta}`),
        api(`/abonos?cotizacion_id=${estado.cotizacionAbierta}`),
      ]);
      $('#titulo-vista').textContent = 'Cotización';
      contenedor.innerHTML = detalleCotizacion(cot, filas);
    } catch (e) {
      contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
    }
    return;
  }

  $('#titulo-vista').textContent = estado.vistaAsistente?.titulo || TITULOS[v] || v;

  // Resultado devuelto por Ari (tiene prioridad sobre la vista fija)
  if (estado.vistaAsistente) {
    const { entidad, columnas, filas } = estado.vistaAsistente;
    contenedor.innerHTML = tabla(entidad, columnas, filas, { vacio: 'La consulta no devolvió resultados.' });
    return;
  }

  if (v === 'inicio') {
    const r = estado.resumen;
    if (!r) { contenedor.innerHTML = '<div class="vacio">Cargando…</div>'; return; }
    const c = r.contadores;

    const metricas = `<div class="metricas">
      ${metrica(c.citasHoy, 'Citas hoy')}
      ${metrica(c.recordatorios, 'Pendientes')}
      ${metrica(c.cotizaciones, 'Cotizaciones')}
      ${metrica(c.clientes, 'Clientes')}
      ${metrica(fmtDinero(c.porCobrar), 'Por cobrar', 'dinero')}
      ${metrica(fmtDinero(c.saldoCotizado), 'Saldo cotizado', 'dinero')}
    </div>`;

    contenedor.innerHTML = metricas
      + bloque('Agenda de hoy', lineaTiempo(r.citasHoy))
      + (r.vencidos.length
        ? bloque('⚠ Vencidos', tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'], r.vencidos))
        : '')
      + (r.cobrosVencidos.length
        ? bloque('⚠ Cobros vencidos', tabla('cobros', ['vence_en', 'concepto', 'cliente', 'monto'], r.cobrosVencidos))
        : '')
      + bloque('Tareas pendientes', tabla('recordatorios', ['vence_en', 'texto', 'cliente', 'prioridad'],
        r.pendientesHoy, { vacio: 'Sin tareas para hoy.' }))
      + bloque('Próximas citas', tabla('citas', ['inicio', 'titulo', 'cliente', 'lugar'], r.proximasCitas));
    return;
  }

  const CONSULTAS = {
    agenda: { entidad: 'citas', filtros: 'rango=proximos', columnas: ['inicio', 'titulo', 'cliente', 'lugar', 'estado'] },
    clientes: { entidad: 'clientes', filtros: '', columnas: ['nombre', 'empresa', 'telefono', 'email'] },
    cotizaciones: { entidad: 'cotizaciones', filtros: '', columnas: ['creado_en', 'titulo', 'cliente', 'monto', 'abonado', 'saldo', 'estado'] },
    cobros: { entidad: 'cobros', filtros: '', columnas: ['vence_en', 'concepto', 'cliente', 'monto', 'estado'] },
    recordatorios: { entidad: 'recordatorios', filtros: '', columnas: ['vence_en', 'texto', 'cliente', 'prioridad', 'estado'] },
  }[v];

  if (!CONSULTAS) { contenedor.innerHTML = '<div class="vacio">Vista desconocida.</div>'; return; }

  contenedor.innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    const { filas } = await api(`/${CONSULTAS.entidad}?${CONSULTAS.filtros}`);
    contenedor.innerHTML = tabla(CONSULTAS.entidad, CONSULTAS.columnas, filas);
  } catch (e) {
    contenedor.innerHTML = `<div class="vacio">${escapar(e.message)}</div>`;
  }
}

const metrica = (valor, rotulo, clase = '') => `
  <div class="metrica ${clase}${!clase && Number(valor) === 0 ? '' : ''}">
    <div class="valor">${escapar(valor)}</div>
    <div class="rotulo">${escapar(rotulo)}</div>
  </div>`;

async function refrescarResumen() {
  try {
    estado.resumen = await api('/resumen');
    $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const c = estado.resumen.contadores;
    $$('[data-badge]').forEach((el) => {
      const n = c[el.dataset.badge];
      el.textContent = n ? String(n) : '';
    });
  } catch (e) {
    avisar(e.message, true);
  }
}

async function refrescarTodo() {
  await refrescarResumen();
  await pintar();
}

/* ══════════════════════════════════════════════════════════════════
   Conversación con Ari
   ══════════════════════════════════════════════════════════════════ */

/* ─────────── Hoja deslizante de conversación (celular) ─────────── */

const esCelular = () => window.matchMedia('(max-width: 900px)').matches;

function abrirHoja({ enfocarTexto = false } = {}) {
  if (!esCelular()) {
    if (enfocarTexto) $('#texto').focus();
    return;
  }
  $('.voz').classList.add('abierta');
  $('#telon').classList.add('visible');
  $('.fabs').classList.add('oculto');
  if (enfocarTexto) setTimeout(() => $('#texto').focus(), 280);
  requestAnimationFrame(() => { $('#conversacion').scrollTop = $('#conversacion').scrollHeight; });
}

function cerrarHoja() {
  $('.voz').classList.remove('abierta');
  $('#telon').classList.remove('visible');
  $('.fabs').classList.remove('oculto');
  $('#texto').blur();
}

function burbuja(clase, html) {
  const div = document.createElement('div');
  div.className = `burbuja ${clase}`;
  div.innerHTML = html;
  $('#conversacion').append(div);
  $('#conversacion').scrollTop = $('#conversacion').scrollHeight;
  return div;
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto) return;

  $('#texto').value = '';
  abrirHoja();
  burbuja('yo', escapar(texto));

  const cargando = burbuja('ari', '<div class="pensando"><i></i><i></i><i></i></div>');

  try {
    const r = await api('/asistente', {
      method: 'POST',
      body: { texto, historial: estado.historial },
    });

    const hechos = (r.acciones || []).length
      ? `<div class="hechos">${r.acciones.map((a) => `<div class="hecho">✓ ${escapar(a.detalle)}</div>`).join('')}</div>`
      : '';
    cargando.innerHTML = `<p>${escapar(r.respuesta)}</p>${hechos}`;
    $('#conversacion').scrollTop = $('#conversacion').scrollHeight;

    estado.historial.push({ rol: 'user', texto }, { rol: 'assistant', texto: r.respuesta });
    estado.historial = estado.historial.slice(-8);

    // Si Ari consultó algo, el dashboard muestra el resultado.
    if (r.vista) {
      estado.vistaAsistente = r.vista;
      const nav = $(`.nav-item[data-vista="${r.vista.entidad === 'citas' ? 'agenda' : r.vista.entidad}"]`);
      $$('.nav-item').forEach((b) => b.classList.remove('activo'));
      nav?.classList.add('activo');
    }
    if (r.huboCambios) await refrescarResumen();
    await pintar();

    hablar(r.respuesta);

    // Si pediste ver algo, en celular la hoja se aparta para dejar el
    // resultado a la vista; la respuesta queda en la conversación.
    if (r.vista && esCelular()) setTimeout(cerrarHoja, 1500);
  } catch (e) {
    cargando.className = 'burbuja ari error';
    cargando.innerHTML = escapar(e.message);
  }
}

/* ─────────── Texto a voz ─────────── */

let vozPreferida = null;
function cargarVoces() {
  const voces = speechSynthesis.getVoices();
  vozPreferida =
    voces.find((v) => /es-(CO|MX|US)/i.test(v.lang) && /google|neural|premium/i.test(v.name))
    || voces.find((v) => /^es/i.test(v.lang))
    || null;
}
if ('speechSynthesis' in window) {
  cargarVoces();
  speechSynthesis.onvoiceschanged = cargarVoces;
}

function hablar(texto) {
  if (!$('#tts').checked || !('speechSynthesis' in window) || !texto) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = vozPreferida?.lang || 'es-CO';
  if (vozPreferida) u.voice = vozPreferida;
  u.rate = 1.04;
  u.pitch = 1;
  speechSynthesis.speak(u);
}

/* ─────────── Voz a texto ─────────── */

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

// Los navegadores sólo entregan el micrófono en localhost o con HTTPS. Entrando
// por IP desde el celular (http://192.168...) la API desaparece, así que hay que
// distinguir "este navegador no puede" de "esta dirección no puede".
const CONTEXTO_SEGURO = window.isSecureContext !== false;
const VOZ_DISPONIBLE = Boolean(Reconocimiento) && CONTEXTO_SEGURO;

const MOTIVO_SIN_VOZ = !CONTEXTO_SEGURO
  ? 'El micrófono necesita una dirección segura (https). Por ahora escribile acá abajo.'
  : 'Este navegador no dicta por voz. Usá Chrome, Edge o Safari, o escribí acá abajo.';

// En pantallas táctiles no hay barra espaciadora que mencionar.
const PISTA_INICIAL = !VOZ_DISPONIBLE
  ? MOTIVO_SIN_VOZ
  : window.matchMedia('(pointer: coarse)').matches
    ? 'Tocá el micrófono para hablarle a Ari.'
    : 'Tocá el micrófono (o la barra espaciadora) para hablar.';

let reconocedor = null;
let escuchando = false;

/** El micrófono existe dos veces: en el panel (escritorio) y flotante (celular). */
const marcarGrabando = (activo) =>
  ['#mic', '#fab-mic'].forEach((s) => $(s).classList.toggle('grabando', activo));

function iniciarVoz() {
  if (!VOZ_DISPONIBLE) {
    // No se desactivan los botones: tocarlos abre la conversación con el
    // teclado listo y explica por qué no hay voz. Un botón muerto no dice nada.
    ['#mic', '#fab-mic'].forEach((s) => {
      $(s).classList.add('sin-voz');
      $(s).title = MOTIVO_SIN_VOZ;
      $(s).setAttribute('aria-label', MOTIVO_SIN_VOZ);
    });
    $('#pista').textContent = MOTIVO_SIN_VOZ;
    return;
  }

  reconocedor = new Reconocimiento();
  reconocedor.lang = 'es-CO';
  reconocedor.continuous = false;
  reconocedor.interimResults = true;
  reconocedor.maxAlternatives = 1;

  let acumulado = '';

  reconocedor.onstart = () => {
    escuchando = true;
    acumulado = '';
    marcarGrabando(true);
    $('#pista').textContent = 'Escuchando… hablá con naturalidad.';
  };

  reconocedor.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) acumulado += t;
      else parcial += t;
    }
    $('#texto').value = (acumulado + parcial).trim();
  };

  reconocedor.onerror = (e) => {
    abrirHoja(); // que el aviso sea visible aunque la hoja estuviera cerrada
    $('#pista').textContent = {
      'not-allowed': 'Necesito permiso para usar el micrófono.',
      'no-speech': 'No escuché nada. Probá de nuevo.',
      'audio-capture': 'No encontré ningún micrófono.',
      network: 'Sin conexión para el reconocimiento de voz.',
    }[e.error] || `Error de micrófono: ${e.error}`;
  };

  reconocedor.onend = () => {
    escuchando = false;
    marcarGrabando(false);
    const texto = $('#texto').value.trim();
    if (texto) {
      $('#pista').textContent = '';
      enviar(texto);
    } else if (!$('#pista').textContent.startsWith('Error') && !$('#pista').textContent.includes('permiso')) {
      $('#pista').textContent = PISTA_INICIAL;
    }
  };
}

function alternarMicrofono() {
  if (!VOZ_DISPONIBLE) {
    abrirHoja({ enfocarTexto: true });
    $('#pista').textContent = MOTIVO_SIN_VOZ;
    return;
  }
  if (!reconocedor) return;
  if (escuchando) reconocedor.stop();
  else {
    speechSynthesis.cancel();
    try { reconocedor.start(); } catch { /* ya estaba activo */ }
  }
}

/* ══════════════════════════════════════════════════════════════════
   Eventos
   ══════════════════════════════════════════════════════════════════ */

$('#nav').addEventListener('click', (e) => {
  const boton = e.target.closest('.nav-item');
  if (!boton) return;
  $$('.nav-item').forEach((b) => b.classList.remove('activo'));
  boton.classList.add('activo');
  estado.vista = boton.dataset.vista;
  estado.vistaAsistente = null;
  estado.cotizacionAbierta = null;
  cerrarHoja();
  pintar();
  $('#contenido').scrollTop = 0;
});

$('#contenido').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const { accion, entidad, id } = boton.dataset;

  if (accion === 'abrir-cotizacion') {
    estado.cotizacionAbierta = Number(id);
    estado.vistaAsistente = null;
    await pintar();
    $('#contenido').scrollTop = 0;
    return;
  }
  if (accion === 'cerrar-cotizacion') {
    estado.cotizacionAbierta = null;
    estado.vista = 'cotizaciones';
    $$('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === 'cotizaciones'));
    await pintar();
    return;
  }

  try {
    if (accion === 'borrar-abono') {
      if (!confirm('¿Quitar este abono?')) return;
      await api(`/abonos/${id}`, { method: 'DELETE' });
      avisar('Abono eliminado');
      await refrescarResumen();
      await pintar();
      return;
    }
    if (accion === 'estado') {
      await api(`/${entidad}/${id}`, { method: 'PATCH', body: { estado: boton.dataset.estado } });
      avisar('Actualizado ✓');
    } else if (accion === 'borrar') {
      if (!confirm('¿Borrar este registro definitivamente?')) return;
      await api(`/${entidad}/${id}`, { method: 'DELETE' });
      avisar('Registro eliminado');
    }
    // Si estábamos viendo un resultado de Ari, lo recargamos desde cero.
    estado.vistaAsistente = null;
    await refrescarTodo();
  } catch (err) {
    avisar(err.message, true);
  }
});

$('#contenido').addEventListener('submit', async (e) => {
  if (e.target.id !== 'form-abono') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const monto = Number(d.monto);
  if (!(monto > 0)) return avisar('El abono tiene que ser mayor que cero.', true);

  try {
    await api('/abonos', {
      method: 'POST',
      body: {
        cotizacion_id: estado.cotizacionAbierta,
        monto,
        fecha: d.fecha || undefined,
        nota: d.nota || undefined,
      },
    });
    avisar('Abono registrado ✓');
    await refrescarResumen();
    await pintar();
  } catch (err) {
    avisar(err.message, true);
  }
});

$('#mic').addEventListener('click', alternarMicrofono);

// Botones flotantes de celular
$('#fab-mic').addEventListener('click', () => { abrirHoja(); alternarMicrofono(); });
$('#fab-teclado').addEventListener('click', () => abrirHoja({ enfocarTexto: true }));
$('#cerrar-hoja').addEventListener('click', cerrarHoja);

$('#salir').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
});
$('#telon').addEventListener('click', cerrarHoja);

$('#enviar').addEventListener('click', () => enviar($('#texto').value));
$('#texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enviar($('#texto').value);
});
$('#btn-refrescar').addEventListener('click', () => {
  estado.vistaAsistente = null;
  refrescarTodo();
  avisar('Actualizado');
});

document.addEventListener('keydown', (e) => {
  // Barra espaciadora = hablar (si no estás escribiendo)
  if (e.code === 'Space' && document.activeElement !== $('#texto') && !e.repeat) {
    e.preventDefault();
    alternarMicrofono();
  }
  if (e.key === 'Escape') cerrarHoja();
});

// Al girar el teléfono o pasar a escritorio, la hoja vuelve a su sitio.
window.addEventListener('resize', () => { if (!esCelular()) cerrarHoja(); });

/* ─────────── Arranque ─────────── */

(async function arrancar() {
  iniciarVoz();
  if (VOZ_DISPONIBLE) $('#pista').textContent = PISTA_INICIAL;

  try {
    const s = await api('/estado');
    $('#estado-modelo').textContent = `modelo · ${s.modelo}`;
    if (s.conAcceso) $('#salir').hidden = false;
    if (!s.vozLista) {
      burbuja('ari error', 'Falta configurar <b>ANTHROPIC_API_KEY</b> en el archivo <code>.env</code> del servidor.');
    }
  } catch { /* el servidor dirá */ }

  await refrescarTodo();
  setInterval(refrescarResumen, 60_000);
})();
