/* ══════════════════════════════════════════════════════════════════
   Sintetizador de Prompts — interfaz
   ══════════════════════════════════════════════════════════════════
   Todo pasa acá dentro: el motor corre en la misma ventana y la
   biblioteca vive en el almacenamiento local del Mac. Nunca sale nada
   a la red.
   ══════════════════════════════════════════════════════════════════ */

import { optimizar, NIVELES, NIVEL_POR_DEFECTO, PLANTILLAS } from './motor.js';

const $ = (s) => document.querySelector(s);

// En Electron existe el puente `ari`; abierto como archivo suelto en el
// navegador, no. La app funciona igual en los dos casos.
const puente = globalThis.ari || null;

const LLAVES = { prompts: 'ari.prompts', ajustes: 'ari.ajustes', borrador: 'ari.borrador' };

const estado = {
  nivel: NIVEL_POR_DEFECTO,
  plantilla: 'estructurado',
  datos: true,
  conceptos: true,
  preguntas: true,
  resultado: null,
  guardados: [],
  busqueda: '',
  abierto: null,          // id del prompt de la biblioteca que se está viendo
  conBiblioteca: true,
  seGuarda: true,         // el navegador deja conservar la biblioteca
};

/* ─────────── Guardado local ─────────── */

function leer(llave, siNoHay) {
  try {
    const crudo = localStorage.getItem(llave);
    return crudo ? JSON.parse(crudo) : siNoHay;
  } catch {
    return siNoHay;
  }
}

/**
 * ¿Este navegador deja guardar? Safari no guarda nada en un archivo
 * abierto con doble clic, y en ventana privada no guarda ninguno. Hay
 * que saberlo al arrancar para avisar de una, en vez de dejar que el
 * usuario pierda la biblioteca al cerrar.
 */
function aquiSeGuarda() {
  try {
    localStorage.setItem('ari.prueba', '1');
    localStorage.removeItem('ari.prueba');
    return true;
  } catch {
    return false;
  }
}

function escribir(llave, valor) {
  if (!estado.seGuarda) return;   // ya se avisó al arrancar, no se insiste
  try {
    localStorage.setItem(llave, JSON.stringify(valor));
  } catch (falla) {
    const lleno = falla?.name === 'QuotaExceededError' || falla?.code === 22;
    avisar(lleno
      ? 'La biblioteca llegó al tope: borrá alguno o exportalos'
      : 'Este navegador no deja guardar; la biblioteca no se conserva');
  }
}

const guardarAjustes = () => escribir(LLAVES.ajustes, {
  nivel: estado.nivel,
  plantilla: estado.plantilla,
  datos: estado.datos,
  conceptos: estado.conceptos,
  preguntas: estado.preguntas,
  conBiblioteca: estado.conBiblioteca,
});

/* ─────────── Avisos ─────────── */

let relojAviso = null;

function avisar(texto) {
  const caja = $('#aviso');
  caja.textContent = texto;
  caja.classList.add('visible');
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => caja.classList.remove('visible'), 2200);
}

/* ─────────── Síntesis ─────────── */

let relojSintesis = null;

/** Rehace el prompt. Se llama a cada tecla, con un respiro de por medio. */
function sintetizar({ yaMismo = false } = {}) {
  clearTimeout(relojSintesis);
  const hacerlo = () => {
    const entrada = $('#entrada').value;
    escribir(LLAVES.borrador, entrada);

    if (!entrada.trim()) {
      estado.resultado = null;
      pintarSalida();
      return;
    }

    estado.resultado = optimizar(entrada, {
      nivel: estado.nivel,
      plantilla: estado.plantilla,
      datos: estado.datos,
      conceptos: estado.conceptos,
      preguntas: estado.preguntas,
    });
    pintarSalida();
  };
  if (yaMismo) hacerlo();
  else relojSintesis = setTimeout(hacerlo, 220);
}

const numero = (n) => n.toLocaleString('es-CO');

function pintarSalida() {
  const salida = $('#salida');
  const pieEntrada = $('#pie-entrada');
  const pieSalida = $('#pie-salida');
  const entrada = $('#entrada').value;

  const palabras = entrada.trim() ? entrada.trim().split(/\s+/).length : 0;
  pieEntrada.innerHTML = `<span><b>${numero(palabras)}</b> palabras</span><span><b>${numero(entrada.length)}</b> caracteres</span>`;

  if (!estado.resultado) {
    salida.classList.add('vacia');
    salida.textContent = 'Escribí, dictá o pegá algo a la izquierda y el prompt aparece acá solo.';
    pieSalida.innerHTML = '<span>Sin conexión · no consume tokens</span>';
    return;
  }

  const { prompt, metricas, analisis } = estado.resultado;
  salida.classList.remove('vacia');
  salida.textContent = prompt;

  const recorte = metricas.reduccion > 0
    ? `<span class="bueno">−${metricas.reduccion}% más corto</span>`
    : '<span>ganó estructura</span>';

  const ahorro = metricas.tokensAhorrados > 0
    ? `<span><b>~${numero(metricas.tokensAhorrados)}</b> tokens menos por consulta</span>`
    : `<span><b>~${numero(metricas.tokensSalida)}</b> tokens al usarlo</span>`;

  const pendientes = analisis.preguntas.length
    ? `<span><b>${analisis.preguntas.length}</b> ${analisis.preguntas.length === 1 ? 'duda por resolver' : 'dudas por resolver'}</span>`
    : '<span class="bueno">no le falta nada</span>';

  pieSalida.innerHTML = [
    `<span><b>${numero(metricas.palabrasSalida)}</b> palabras</span>`,
    recorte,
    ahorro,
    pendientes,
  ].join('');
}

/* ─────────── Biblioteca ─────────── */

const fecha = (marca) => new Date(marca).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' });

function pintarBiblioteca() {
  const lista = $('#guardados');
  const busqueda = estado.busqueda.trim().toLowerCase();
  const visibles = estado.guardados.filter((p) =>
    !busqueda || `${p.titulo} ${p.entrada}`.toLowerCase().includes(busqueda));

  lista.innerHTML = '';

  if (!estado.seGuarda) {
    const aviso = document.createElement('li');
    aviso.className = 'nada advertencia';
    aviso.textContent = puente
      ? 'Este Mac no está dejando guardar: lo que armes se pierde al cerrar.'
      : 'Abierto así, este navegador no conserva nada al cerrar. Usá Chrome, '
        + 'o instalá la app, o exportá lo que quieras conservar.';
    lista.append(aviso);
  }

  if (!visibles.length) {
    const nada = document.createElement('li');
    nada.className = 'nada';
    nada.textContent = estado.guardados.length
      ? 'Ningún prompt guardado coincide con esa búsqueda.'
      : 'Todavía no guardaste ninguno. Sintetizá uno y tocá «Guardar».';
    lista.append(nada);
    return;
  }

  for (const prompt of visibles) {
    const fila = document.createElement('li');
    fila.className = prompt.id === estado.abierto ? 'activo' : '';

    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = prompt.titulo;

    const pie = document.createElement('div');
    pie.className = 'fecha';
    const cuando = document.createElement('span');
    cuando.textContent = `${fecha(prompt.marca)} · ${NIVELES[prompt.nivel]?.etiqueta || prompt.nivel}`;
    const borrar = document.createElement('button');
    borrar.className = 'borrar';
    borrar.textContent = 'Borrar';
    borrar.title = 'Borrar este prompt';
    borrar.addEventListener('click', (e) => { e.stopPropagation(); borrarGuardado(prompt.id); });
    pie.append(cuando, borrar);

    fila.append(titulo, pie);
    fila.addEventListener('click', () => abrirGuardado(prompt.id));
    lista.append(fila);
  }
}

function guardarEnBiblioteca() {
  if (!estado.resultado) return avisar('Todavía no hay nada que guardar');

  const registro = {
    id: estado.abierto || `p${Date.now().toString(36)}`,
    titulo: estado.resultado.analisis.titulo,
    entrada: $('#entrada').value,
    nivel: estado.nivel,
    plantilla: estado.plantilla,
    marca: Date.now(),
  };

  const otros = estado.guardados.filter((p) => p.id !== registro.id);
  estado.guardados = [registro, ...otros];
  estado.abierto = registro.id;
  escribir(LLAVES.prompts, estado.guardados);
  pintarBiblioteca();
  avisar('Guardado en la biblioteca');
}

function abrirGuardado(id) {
  const prompt = estado.guardados.find((p) => p.id === id);
  if (!prompt) return;
  estado.abierto = id;
  estado.nivel = prompt.nivel || estado.nivel;
  estado.plantilla = prompt.plantilla || estado.plantilla;
  $('#entrada').value = prompt.entrada;
  pintarControles();
  sintetizar({ yaMismo: true });
  pintarBiblioteca();
}

function borrarGuardado(id) {
  estado.guardados = estado.guardados.filter((p) => p.id !== id);
  if (estado.abierto === id) estado.abierto = null;
  escribir(LLAVES.prompts, estado.guardados);
  pintarBiblioteca();
  avisar('Prompt borrado');
}

function exportarBiblioteca() {
  if (!estado.guardados.length) return avisar('La biblioteca está vacía');
  const contenido = JSON.stringify({ app: 'sintetizador-de-prompts', version: 1, prompts: estado.guardados }, null, 2);
  descargar('mis-prompts.json', contenido);
}

async function importarBiblioteca(archivo) {
  try {
    const datos = JSON.parse(await archivo.text());
    const entrantes = Array.isArray(datos) ? datos : datos.prompts;
    if (!Array.isArray(entrantes)) throw new Error('formato desconocido');

    const conocidos = new Set(estado.guardados.map((p) => p.id));
    const nuevos = entrantes
      .filter((p) => p && p.entrada && !conocidos.has(p.id))
      .map((p) => ({ ...p, id: p.id || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }));

    estado.guardados = [...nuevos, ...estado.guardados];
    escribir(LLAVES.prompts, estado.guardados);
    pintarBiblioteca();
    avisar(nuevos.length ? `Se importaron ${nuevos.length}` : 'Ya los tenías todos');
  } catch {
    avisar('Ese archivo no es una biblioteca de prompts');
  }
}

/* ─────────── Salidas al sistema ─────────── */

async function copiarPrompt() {
  if (!estado.resultado) return avisar('Todavía no hay prompt');
  const texto = estado.resultado.prompt;
  try {
    if (puente) await puente.copiar(texto);
    else await navigator.clipboard.writeText(texto);
    avisar('Copiado: pegalo en tu proyecto');
  } catch {
    avisar('No se pudo copiar; seleccioná el texto a mano');
  }
}

/** Guarda un archivo: con diálogo del sistema en la app, o descarga suelta. */
function descargar(nombre, contenido) {
  if (puente) {
    puente.guardarTexto(nombre, contenido).then((hecho) => hecho && avisar('Archivo guardado'));
    return;
  }
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }));
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

function exportarPrompt() {
  if (!estado.resultado) return avisar('Todavía no hay prompt');
  const nombre = `${estado.resultado.analisis.titulo}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'prompt';
  descargar(`${nombre}.md`, estado.resultado.prompt);
}

async function abrirArchivo() {
  if (puente) {
    const archivo = await puente.abrirTexto();
    if (!archivo) return;
    $('#entrada').value = archivo.contenido;
    estado.abierto = null;
    sintetizar({ yaMismo: true });
    avisar(`Abierto: ${archivo.nombre}`);
    return;
  }
  const selector = document.createElement('input');
  selector.type = 'file';
  selector.accept = '.txt,.md,.markdown,text/plain';
  selector.addEventListener('change', async () => {
    const archivo = selector.files?.[0];
    if (!archivo) return;
    $('#entrada').value = await archivo.text();
    estado.abierto = null;
    sintetizar({ yaMismo: true });
  });
  selector.click();
}

function limpiar() {
  $('#entrada').value = '';
  estado.abierto = null;
  estado.resultado = null;
  sintetizar({ yaMismo: true });
  pintarBiblioteca();
  $('#entrada').focus();
}

/* ─────────── Controles ─────────── */

function pintarControles() {
  for (const boton of document.querySelectorAll('#niveles button')) {
    boton.classList.toggle('activo', boton.dataset.nivel === estado.nivel);
  }
  $('#plantilla').value = estado.plantilla;
  $('#op-datos').checked = estado.datos;
  $('#op-conceptos').checked = estado.conceptos;
  $('#op-preguntas').checked = estado.preguntas;
  $('#ventana').classList.toggle('sin-biblioteca', !estado.conBiblioteca);
}

function armarControles() {
  const niveles = $('#niveles');
  for (const [id, nivel] of Object.entries(NIVELES)) {
    const boton = document.createElement('button');
    boton.dataset.nivel = id;
    boton.textContent = nivel.etiqueta;
    boton.title = `Hasta ${nivel.total} viñetas de ${nivel.largo} caracteres`;
    boton.addEventListener('click', () => {
      estado.nivel = id;
      pintarControles();
      guardarAjustes();
      sintetizar({ yaMismo: true });
    });
    niveles.append(boton);
  }

  const plantillas = $('#plantilla');
  for (const plantilla of PLANTILLAS) {
    const opcion = document.createElement('option');
    opcion.value = plantilla.id;
    opcion.textContent = plantilla.nombre;
    opcion.title = plantilla.pie;
    plantillas.append(opcion);
  }
  plantillas.addEventListener('change', () => {
    estado.plantilla = plantillas.value;
    guardarAjustes();
    sintetizar({ yaMismo: true });
  });

  for (const [id, campo] of [['datos', '#op-datos'], ['conceptos', '#op-conceptos'], ['preguntas', '#op-preguntas']]) {
    $(campo).addEventListener('change', (e) => {
      estado[id] = e.target.checked;
      guardarAjustes();
      sintetizar({ yaMismo: true });
    });
  }
}

/* ─────────── Arrastrar archivos ─────────── */

function armarArrastre() {
  const panel = $('#entrada').closest('.panel');

  for (const evento of ['dragenter', 'dragover']) {
    panel.addEventListener(evento, (e) => { e.preventDefault(); panel.classList.add('soltando'); });
  }
  for (const evento of ['dragleave', 'drop']) {
    panel.addEventListener(evento, () => panel.classList.remove('soltando'));
  }

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    const archivo = e.dataTransfer?.files?.[0];
    if (!archivo) return;
    if (archivo.size > 8 * 1024 * 1024) return avisar('Ese archivo pesa demasiado');
    $('#entrada').value = await archivo.text();
    estado.abierto = null;
    sintetizar({ yaMismo: true });
    avisar(`Listo: ${archivo.name}`);
  });
}

/* ─────────── Atajos y menú ─────────── */

function armarAtajos() {
  document.addEventListener('keydown', (e) => {
    const mando = e.metaKey || e.ctrlKey;
    if (!mando) return;

    if (e.key === 'Enter') { e.preventDefault(); sintetizar({ yaMismo: true }); }
    else if (e.key === 'c' && e.shiftKey) { e.preventDefault(); copiarPrompt(); }
    else if (e.key === 's') { e.preventDefault(); exportarPrompt(); }
    else if (e.key === 'd') { e.preventDefault(); guardarEnBiblioteca(); }
    else if (e.key === 'k') { e.preventDefault(); $('#buscar').focus(); }
  });

  puente?.alMenu((orden) => {
    if (orden.startsWith('nivel:')) {
      estado.nivel = orden.split(':')[1];
      pintarControles();
      guardarAjustes();
      return sintetizar({ yaMismo: true });
    }
    ({
      abrir: abrirArchivo,
      guardar: exportarPrompt,
      biblioteca: guardarEnBiblioteca,
      limpiar,
      copiar: copiarPrompt,
      sintetizar: () => sintetizar({ yaMismo: true }),
      dictar: () => {
        $('#entrada').focus();
        avisar('Tocá dos veces la tecla Fn y hablá: el dictado es el del Mac');
      },
    })[orden]?.();
  });
}

/* ─────────── Arranque ─────────── */

function arrancar() {
  if (!puente) document.body.classList.add('en-navegador');
  const seGuarda = aquiSeGuarda();
  Object.assign(estado, leer(LLAVES.ajustes, {}));
  estado.seGuarda = seGuarda;
  estado.guardados = leer(LLAVES.prompts, []);

  armarControles();
  armarArrastre();
  armarAtajos();
  pintarControles();

  $('#entrada').value = leer(LLAVES.borrador, '') || '';
  $('#entrada').addEventListener('input', () => {
    estado.abierto = null;
    sintetizar();
  });

  $('#btn-copiar').addEventListener('click', copiarPrompt);
  $('#btn-exportar').addEventListener('click', exportarPrompt);
  $('#btn-guardar-biblioteca').addEventListener('click', guardarEnBiblioteca);
  $('#btn-abrir').addEventListener('click', abrirArchivo);
  $('#btn-limpiar').addEventListener('click', limpiar);
  $('#btn-dictar').addEventListener('click', () => {
    $('#entrada').focus();
    avisar('Tocá dos veces la tecla Fn y hablá: el dictado es el del Mac');
  });

  $('#btn-biblioteca').addEventListener('click', () => {
    estado.conBiblioteca = !estado.conBiblioteca;
    pintarControles();
    guardarAjustes();
  });

  $('#buscar').addEventListener('input', (e) => {
    estado.busqueda = e.target.value;
    pintarBiblioteca();
  });

  $('#btn-exportar-todo').addEventListener('click', exportarBiblioteca);
  $('#btn-importar').addEventListener('click', () => $('#archivo-importar').click());
  $('#archivo-importar').addEventListener('change', (e) => {
    const archivo = e.target.files?.[0];
    if (archivo) importarBiblioteca(archivo);
    e.target.value = '';
  });

  pintarBiblioteca();
  sintetizar({ yaMismo: true });
  $('#entrada').focus();
}

arrancar();
