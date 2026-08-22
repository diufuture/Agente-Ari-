/* ══════════════════════════════════════════════════════════════════
   Motor de síntesis de prompts — 100 % local
   ══════════════════════════════════════════════════════════════════

   Convierte un dictado largo y desordenado (hablado, transcrito, "un
   libro") en un prompt corto, ordenado y listo para pegar en un
   proyecto de Claude.

   No usa red, ni IA, ni API keys: es análisis de texto puro. Por eso
   no consume un solo token y funciona sin internet.

   Cómo trabaja, en orden:
     1. Limpia el dictado (muletillas, tartamudeos, relleno).
     2. Parte el texto en frases, aunque venga sin puntuación.
     3. Clasifica cada frase en una sección (objetivo, contexto…).
     4. Rescata los datos duros (cifras, fechas, plazos, enlaces).
     5. Comprime cada frase a una viñeta y descarta las repetidas.
     6. Ordena por importancia y se queda con las mejores.
     7. Lo arma en la plantilla que se elija.
   ══════════════════════════════════════════════════════════════════ */

/* ─────────── Ajustes ─────────── */

/** Qué tan apretada queda la síntesis. */
export const NIVELES = {
  detallado:   { viñetas: 8, total: 22, largo: 230, etiqueta: 'Detallado' },
  equilibrado: { viñetas: 5, total: 12, largo: 150, etiqueta: 'Equilibrado' },
  esencial:    { viñetas: 3, total: 8,  largo: 100, etiqueta: 'Esencial' },
};

export const NIVEL_POR_DEFECTO = 'equilibrado';

/** Las secciones del prompt, en el orden en que se leen mejor. */
export const SECCIONES = [
  { id: 'objetivo',      titulo: 'Objetivo' },
  { id: 'contexto',      titulo: 'Contexto' },
  { id: 'requisitos',    titulo: 'Requisitos' },
  { id: 'restricciones', titulo: 'Restricciones' },
  { id: 'formato',       titulo: 'Formato de salida' },
  { id: 'audiencia',     titulo: 'Audiencia y tono' },
  { id: 'ejemplos',      titulo: 'Ejemplos y referencias' },
  { id: 'criterios',     titulo: 'Criterios de éxito' },
  { id: 'preguntas',     titulo: 'Dudas por resolver' },
];

/* ─────────── Léxico ─────────── */

// Pistas de cada sección. Se escriben sin tildes: el texto se compara
// normalizado. El orden de la lista define el desempate.
const PISTAS = {
  restricciones: [
    'no quiero', 'no queremos', 'no necesito', 'no debe', 'no debes', 'no deben',
    'no puede', 'no pueden', 'no uses', 'no usar', 'no incluyas', 'no incluir',
    'no hagas', 'no hacer', 'nunca', 'jamas', 'evita', 'evitar', 'sin que',
    'nada de', 'prohibido', 'esta prohibido', 'no mas de', 'como maximo',
    'maximo', 'no exceder', 'limite', 'limitado a', 'presupuesto', 'no gastar',
    'antes de', 'antes del', 'a mas tardar', 'a más tardar', 'para antes',
    'plazo', 'fecha limite', 'no se puede', 'olvidate de', 'no menciones',
    'no hables de', 'nada mas', 'solamente', 'unicamente', 'únicamente',
  ],
  formato: [
    'formato', 'en markdown', 'markdown', 'json', 'csv', 'xml', 'tabla', 'tablas',
    'lista', 'listas', 'viñetas', 'bullets', 'puntos', 'pasos', 'paso a paso',
    'resumen', 'esquema', 'plantilla', 'estructura', 'secciones', 'titulos',
    'parrafos', 'palabras', 'caracteres', 'extension', 'de largo', 'una hoja',
    'pdf', 'excel', 'presentacion', 'diapositivas', 'codigo', 'entregame',
    'devuelveme', 'dame la salida', 'que me lo des', 'me lo entregas',
    'sintetizado', 'sintetizada', 'sintetico', 'sintético', 'resumido',
    'organizado', 'organizada', 'ordenado', 'ordenada', 'breve', 'conciso',
    'concisa', 'al grano', 'corto', 'que se entienda', 'que lo entienda',
  ],
  audiencia: [
    'dirigido a', 'para el cliente', 'para los clientes', 'publico', 'audiencia',
    'lector', 'lectores', 'tono', 'estilo', 'lenguaje', 'voz', 'formal',
    'informal', 'cercano', 'tecnico', 'sencillo', 'simple', 'coloquial',
    'profesional', 'para gente', 'para personas', 'para alguien',
    'sin tecnicismos', 'lenguaje sencillo', 'hablale', 'háblale', 'tratame de',
  ],
  criterios: [
    'exito', 'esta listo cuando', 'listo cuando', 'sabre que', 'sabremos que',
    'voy a saber', 'vamos a saber', 'sabre', 'sabremos', 'quedo bien',
    'quede bien', 'este bien', 'me sirve si', 'lo apruebo', 'doy por',
    'criterio', 'criterios', 'aceptacion', 'kpi', 'metrica', 'metricas',
    'medir', 'validar', 'verificar', 'comprobar', 'que funcione', 'funcione bien',
    'resultado esperado', 'esperado es', 'objetivo de negocio', 'meta de',
    'calidad', 'que quede bien', 'bien hecho', 'sin errores',
  ],
  ejemplos: [
    'por ejemplo', 'un ejemplo', 'ejemplo', 'ejemplos', 'tal como', 'igual que',
    'parecido a', 'similar a', 'como el de', 'como lo hace', 'referencia',
    'referencias', 'inspirate', 'basate en', 'te paso', 'te comparto', 'mira el',
    'como este', 'del estilo de',
  ],
  requisitos: [
    'debe', 'debes', 'deben', 'deberia', 'debería', 'tiene que', 'tienen que',
    'hay que', 'es obligatorio', 'obligatorio', 'requisito', 'requisitos',
    'necesario que', 'imprescindible', 'siempre', 'asegurate', 'asegurar',
    'incluye', 'incluir', 'considera', 'considerar', 'ten en cuenta',
    'importante que', 'clave que', 'es clave', 'es importante', 'ojo con',
    'no olvides', 'me tiene que', 'que respete', 'que cumpla',
  ],
  objetivo: [
    'quiero', 'queremos', 'necesito', 'necesitamos', 'quisiera', 'me gustaria',
    'busco', 'buscamos', 'el objetivo', 'la meta', 'la idea es', 'se trata de',
    'la intencion', 'el proposito', 'ayudame a', 'ayudame', 'hazme', 'haceme',
    'hacer', 'crea', 'crear', 'creame', 'genera', 'generar', 'desarrolla',
    'desarrollar', 'diseña', 'diseñar', 'construye', 'construir', 'arma',
    'armar', 'redacta', 'redactar', 'escribe', 'escribir', 'analiza', 'analizar',
    'resume', 'resumir', 'traduce', 'organiza', 'organizar', 'optimiza',
    'mejora', 'mejorar', 'automatiza', 'implementa', 'propone', 'proponme',
    'dame', 'requiero', 'lo que pido',
  ],
  contexto: [
    'tengo', 'tenemos', 'trabajo en', 'trabajamos', 'actualmente', 'hoy en dia',
    'hoy', 'ahora mismo', 'en este momento', 'mi empresa', 'mi negocio',
    'mi equipo', 'mi cliente', 'nuestros clientes', 'el proyecto', 'la empresa',
    'contamos con', 'usamos', 'utilizamos', 'manejo', 'manejamos', 'llevo',
    'llevamos', 'venimos', 'el problema es', 'nos pasa', 'me pasa', 'resulta que',
    'la situacion', 'el caso es', 'somos', 'soy',
  ],
};

// El rol que se le pide al asistente ("actúa como…").
const PISTAS_ROL = [
  'actua como', 'actues como', 'comportate como', 'eres un', 'eres una',
  'sos un', 'sos una', 'como experto', 'como experta', 'experto en',
  'experta en', 'especialista en', 'en el papel de', 'asume el rol',
  'tu rol es', 'haz de',
];

// Muletillas del habla que siempre sobran, digan lo que digan.
const MULETILLAS = [
  'o sea', 'osea', 'eh', 'ehh', 'ehhh', 'em', 'mmm', 'mm', 'ajam', 'ajá',
  'digamos que', 'digamos', 'como que', 'mas o menos', 'más o menos', 'a ver',
  'si me entiendes', 'me entiendes', 'me explico', 'me sigues', 'me sigue',
  'por asi decirlo', 'por así decirlo', 'como te digo', 'como te decia',
  'como te decía', 'que se yo', 'basicamente', 'básicamente', 'obviamente',
  'practicamente', 'prácticamente', 'literalmente', 'en realidad',
];

// Estas también son muletillas, pero sólo cuando van sueltas entre pausas:
// «este, entonces…» sobra; «este proyecto» no se toca.
const MULETILLAS_SUELTAS = [
  'este', 'esteee', 'bueno', 'pues', 'nada', 'total', 'en fin', 'mira', 'mire',
  'oye', 'oiga', 'vale', 'ok', 'okey', 'verdad', 'cierto', 'no cierto', 'sabes',
  'la verdad', 'de verdad', 'realmente', 'tipo', 'igual', 'y eso', 'y ya',
  'veamos',
];

// Relleno con el que arrancan las frases habladas y que no aporta nada.
const RELLENO_INICIAL = [
  'lo que yo quiero es que', 'lo que quiero es que', 'lo que necesito es que',
  'lo que yo necesito es', 'lo que quiero', 'lo que necesito',
  'yo lo que quiero es', 'yo lo que necesito es que', 'yo lo que necesito es',
  'yo necesito que', 'yo quiero que', 'yo lo que', 'ah', 'ay', 'oh', 'uy',
  'la idea es que', 'la idea seria que',
  'me gustaria que', 'me gustaría que', 'quisiera que', 'yo creo que',
  'yo pienso que', 'pienso que', 'creo que', 'siento que', 'la verdad es que',
  'resulta que', 'sucede que', 'el tema es que', 'el punto es que',
  'lo importante es que', 'lo que pasa es que', 'te cuento que', 'te digo que',
  'ah no espera', 'no espera', 'espera', 'una ultima cosa', 'una última cosa',
  'ultima cosa', 'última cosa', 'y otra cosa', 'otra cosa', 'una cosa mas',
  'una cosa más', 'lo otro', 'volviendo a', 'como te venia diciendo',
  'quiero que', 'necesito que', 'entonces', 'y entonces', 'asi que', 'así que',
  'por eso', 'y bueno', 'bueno', 'pues', 'y', 'pero', 'ademas', 'además',
  'tambien', 'también', 'o sea', 'es decir', 'igual', 'aparte',
];

const VACIAS = new Set(`a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque
cada casi como con contra cual cuales cuando cuanto de del desde donde dos e el ella ellas ello ellos
en entre era eran eres es esa esas ese eso esos esta estaba estan estar estas este esto estos ha haber
habia han hasta hay la las le les lo los mas me mi mis mucho muchos muy nada ni no nos nosotros o os
otra otras otro otros para pero poco por porque que quien quienes se ser si sin sobre solo son su sus
tal tan tanto te tener tiene tienen todo todos tras tu tus un una uno unas unos usted ustedes va vamos
van vez y ya yo he hemos has hube hacia donde cuyo cuya sea sean fue fueron sido siendo estoy estamos
entonces ahora luego despues después ademas además tambien también sino mismo misma tema temas cosa cosas
forma formas manera maneras parte partes punto puntos veces bien mal mucha muchas poca pocas siempre nunca
aqui allí alli aquel aquella todas otra otras hace hacer hizo hicimos hacen dice dijo decir digo tengo
tenemos quiero queremos necesito necesitamos puede pueden poder podemos ser estar estan están hay tipo
gente cual cuales debe deben debes ahi ahí eso esas esos algo alguien nadie porque pues
tres cuatro cinco seis siete ocho nueve diez once doce quince veinte treinta cien mil
año años mes meses dia dias día días semana semanas hora horas minuto minutos
the of and to in for with a an is are it this that on be by or as at from`.split(/\s+/));

/* ─────────── Utilidades de texto ─────────── */

/** Minúsculas, sin tildes y con la puntuación vuelta espacio. */
export function normalizar(texto) {
  return ` ${texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

/** ¿El texto normalizado contiene esta pista como palabra completa? */
function contiene(normalizado, pista) {
  return normalizado.includes(` ${pista.normalize('NFD').replace(/[̀-ͯ]/g, '')} `);
}

/** Limpia el dictado: tartamudeos, muletillas y espacios de más. */
export function limpiarDictado(texto) {
  let t = String(texto || '').replace(/\r\n?/g, '\n');

  // «me me me da» → «me da»; «en en en los» → «en los»
  t = t.replace(/\b(\p{L}{1,8})(\s+\1\b)+/giu, '$1');

  const escapar = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Las que siempre sobran: basta con que estén entre separadores.
  for (const m of MULETILLAS) {
    t = t.replace(new RegExp(`(^|[\\s,;:.¡!¿?])${escapar(m)}([\\s,;:.¡!¿?]|$)`, 'giu'), '$1$2');
  }

  // Las ambiguas: sólo si vienen aisladas por pausas o al empezar la frase.
  for (const m of MULETILLAS_SUELTAS) {
    t = t.replace(new RegExp(`(^|[.¡!¿?\\n])\\s*${escapar(m)}\\s*[,;]`, 'giu'), '$1 ');
    t = t.replace(new RegExp(`[,;]\\s*${escapar(m)}\\s*(?=[,;.!?\\n]|$)`, 'giu'), '');
    t = t.replace(new RegExp(`(^|[.¡!¿?\\n])\\s*${escapar(m)}\\s+(?=[a-záéíóúñ])`, 'giu'), '$1 ');
  }

  // Coletillas de confirmación: «…, ¿no?», «…, ¿sí?», «…, ¿ya?»
  t = t.replace(/[,\s]*¿?\s*(no|si|sí|ya|ok|va)\s*\?/gi, '');

  // Si al quitar la muletilla quedó una pregunta hueca («¿?»), fuera.
  t = t.replace(/¿\s*\?/g, '').replace(/¿\s*(?=[,;.])/g, '');

  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/([,;:])\1+/g, '$1')
    .replace(/,\s*([.;:])/g, '$1')
    .replace(/\.{4,}/g, '…')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Une los renglones que están cortados por el ancho del texto, no por
 * el punto final. Un correo o una transcripción pegada vienen así, y si
 * no se unen cada pedazo se clasifica por su cuenta y sale cualquier cosa.
 */
export function unirRenglones(texto) {
  const lineas = texto.split('\n');
  const salida = [];

  for (const cruda of lineas) {
    const linea = cruda.trim();
    const anterior = salida[salida.length - 1];
    const sigue =
      anterior &&
      linea &&
      !/[.!?…:;]$/.test(anterior) &&        // la anterior no cerró idea
      !/^[-*•\d]/.test(linea) &&            // esta no abre una lista
      !/^#{1,6}\s/.test(linea) &&           // ni un título
      !/^[A-ZÁÉÍÓÚÑ\s]{6,}$/.test(anterior); // ni la anterior era un encabezado

    if (sigue) salida[salida.length - 1] = `${anterior} ${linea}`;
    else salida.push(linea);
  }

  return salida.join('\n');
}

/**
 * Parte el texto en frases. Aguanta dictado sin puntuación: si un tramo
 * se va de largo, lo corta por los conectores del habla.
 */
export function partirEnFrases(texto) {
  const crudas = [];
  for (const parrafo of unirRenglones(texto).split(/\n+/)) {
    for (const tramo of parrafo.split(/(?<=[.!?…])\s+|(?<=[a-záéíóúñ]\.)(?=[A-ZÁÉÍÓÚÑ¿¡])/)) {
      if (tramo.trim()) crudas.push(tramo.trim());
    }
  }

  const conectores = /\s+(?=(?:y luego|luego|despues|después|ademas|además|tambien|también|pero|aunque|entonces|por otro lado|por otra parte|aparte|igualmente|asimismo|y ademas|y además|y tambien|y también|otra cosa|otra cosa es|lo otro|y lo otro)\b)/i;
  const frases = [];

  for (const cruda of crudas) {
    let tramos = cruda.length > 200 ? cruda.split(/\s*;\s*/) : [cruda];
    tramos = tramos.flatMap((t) => (t.length > 200 ? t.split(conectores) : [t]));
    // Una negación colgada de otra idea es una restricción propia.
    tramos = tramos.flatMap((t) =>
      t.split(/,\s+(?=(?:(?:y|pero)\s+)?(?:nunca|jamas|jamás|tampoco)\b|(?:y|pero)\s+no\s)/i));

    // Último recurso: sigue larguísimo y sin puntos → corto por comas.
    tramos = tramos.flatMap((t) => (t.length > 320 ? t.split(/,\s+/) : [t]));
    for (const t of tramos) {
      const frase = t.trim().replace(/^[,;:\s]+/, '');
      if (frase.split(/\s+/).length >= 3) frases.push(frase);
    }
  }

  return frases;
}

/* ─────────── Clasificación ─────────── */

/** Puntúa una frase contra las pistas de una sección. */
function puntuarSeccion(normalizada, pistas) {
  let puntos = 0;
  for (const pista of pistas) {
    if (!contiene(normalizada, pista)) continue;
    const peso = pista.split(' ').length * 2 + 1;
    // Lo que se dice al principio manda más que lo que se dice al final.
    const alPrincipio = normalizada.indexOf(` ${pista} `) < 45;
    puntos += alPrincipio ? peso * 1.6 : peso;
  }
  return puntos;
}

/** Decide a qué sección pertenece una frase. */
export function clasificar(frase) {
  if (/\?\s*$/.test(frase.trim())) return { seccion: 'preguntas', fuerza: 6 };

  const norma = normalizar(frase);
  let mejor = { seccion: 'contexto', fuerza: 0 };

  for (const [seccion, pistas] of Object.entries(PISTAS)) {
    const fuerza = puntuarSeccion(norma, pistas);
    if (fuerza > mejor.fuerza) mejor = { seccion, fuerza };
  }

  return mejor;
}

/** Busca el rol que se le pide al asistente, si es que se pide alguno. */
export function detectarRol(texto) {
  const norma = normalizar(texto);
  for (const pista of PISTAS_ROL) {
    const i = norma.indexOf(` ${pista} `);
    if (i === -1) continue;
    const cola = norma.slice(i + pista.length + 2).split(' ').filter(Boolean).slice(0, 7);
    const util = [];
    for (const palabra of cola) {
      util.push(palabra);
      if (util.length >= 3 && VACIAS.has(palabra)) break;
    }
    const rol = util.join(' ').replace(/\s+(que|y|para|con|de|en)$/, '').trim();
    if (rol.length > 3) return rol;
  }
  return null;
}

/* ─────────── Compresión ─────────── */

/** Deja una frase hablada como una viñeta corta y directa. */
export function comprimir(frase, largoMaximo) {
  let t = frase.trim();

  // Fuera el relleno con el que arranca (puede venir encadenado).
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const antes = t;
    for (const relleno of RELLENO_INICIAL) {
      const patron = new RegExp(`^${relleno.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[,:;\\s]*`, 'iu');
      if (patron.test(t)) { t = t.replace(patron, ''); break; }
    }
    if (t === antes) break;
  }

  t = t.replace(/^[,;:\s]+/, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\.\s*([,;])/g, '$1');
  t = t.replace(/[\s,;:]+$/, '').replace(/\s+(y|o|que|pero|de|para|con|en)$/i, '');

  if (t.length > largoMaximo) {
    const corte = t.slice(0, largoMaximo);
    const espacio = corte.lastIndexOf(' ');
    t = `${(espacio > largoMaximo * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,;:]+$/, '')}…`;
  }

  return t ? t[0].toLocaleUpperCase('es') + t.slice(1) : '';
}

/** Palabras con contenido de una frase, para comparar y contar. */
function contenido(texto) {
  return normalizar(texto).split(' ').filter((p) => p.length > 3 && !VACIAS.has(p));
}

/** Qué tanto se parecen dos frases (0 = nada, 1 = lo mismo). */
export function parecido(a, b) {
  const uno = new Set(contenido(a));
  const dos = new Set(contenido(b));
  if (!uno.size || !dos.size) return 0;
  let comunes = 0;
  for (const p of uno) if (dos.has(p)) comunes++;
  return comunes / Math.min(uno.size, dos.size);
}

/* ─────────── Conceptos y datos duros ─────────── */

/** Las palabras y parejas de palabras que más se repiten. */
export function conceptosClave(texto, cuantos = 10) {
  const palabras = normalizar(texto).split(' ').filter(Boolean);
  const utiles = palabras.filter((p) => p.length > 3 && !VACIAS.has(p) && !/^\d+$/.test(p));

  // Para mostrarlos con sus tildes, guardo cómo se escribió cada palabra.
  const conTildes = texto.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const original = new Map();
  palabras.forEach((p, i) => {
    if (!original.has(p) && conTildes[i]) original.set(p, conTildes[i].toLocaleLowerCase('es'));
  });
  const comoSeDijo = (t) => t.split(' ').map((p) => original.get(p) || p).join(' ');

  const veces = new Map();
  for (const p of utiles) veces.set(p, (veces.get(p) || 0) + 1);

  // Parejas seguidas ("lista de precios") pesan más que las sueltas.
  const parejas = new Map();
  for (let i = 0; i < palabras.length - 1; i++) {
    const [a, b] = [palabras[i], palabras[i + 1]];
    if (a.length < 4 || b.length < 4 || VACIAS.has(a) || VACIAS.has(b)) continue;
    const pareja = `${a} ${b}`;
    parejas.set(pareja, (parejas.get(pareja) || 0) + 1);
  }

  const candidatos = [
    ...[...parejas].filter(([, n]) => n >= 2).map(([t, n]) => ({ texto: t, peso: n * 2.5 })),
    ...[...veces].filter(([, n]) => n >= 2).map(([t, n]) => ({ texto: t, peso: n })),
  ].sort((a, b) => b.peso - a.peso);

  // Si una pareja ya entró, no repito sus palabras sueltas.
  const elegidos = [];
  const sumar = (c) => {
    if (elegidos.some((e) => e.texto.includes(c.texto) || c.texto.includes(e.texto))) return;
    elegidos.push(c);
  };
  for (const c of candidatos) {
    sumar(c);
    if (elegidos.length >= cuantos) break;
  }

  // En textos cortos nada llega a repetirse: entonces valen las palabras
  // largas de una sola aparición, que suelen ser las que cargan el tema.
  if (elegidos.length < 4) {
    const sueltas = [...new Set(utiles)]
      .map((t) => ({ texto: t, peso: t.length / 10 }))
      .sort((a, b) => b.peso - a.peso);
    for (const c of sueltas) {
      sumar(c);
      if (elegidos.length >= Math.min(cuantos, 6)) break;
    }
  }

  return elegidos.map((c) => ({ ...c, texto: comoSeDijo(c.texto) }));
}

/** Cifras, plazos, enlaces: lo que no se puede perder al resumir. */
export function datosDuros(texto) {
  const patrones = [
    /\b\d+(?:[.,]\d+)?\s*(?:millones?|mil|k|%|por ciento|pesos|dolares|dólares|usd|cop|eur|euros)\b/gi,
    /[$€£]\s?\d[\d.,]*/g,
    /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?/gi,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/gi,
    /\b\d+\s*(?:dias?|días?|semanas?|meses?|años?|horas?|minutos?|paginas?|páginas?|palabras|caracteres|slides?|diapositivas)\b/gi,
    /https?:\/\/\S+/g,
    /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,
  ];

  const vistos = new Map();
  for (const patron of patrones) {
    for (const hallazgo of texto.match(patron) || []) {
      const limpio = hallazgo.trim().replace(/[.,;]$/, '');
      const clave = limpio.toLowerCase();
      if (!vistos.has(clave)) vistos.set(clave, limpio);
    }
  }
  return [...vistos.values()].slice(0, 14);
}

/* ─────────── Análisis ─────────── */

/** Preguntas que conviene resolver cuando falta una parte del prompt. */
const FALTANTES = {
  objetivo:      '¿Cuál es la acción concreta que debe ejecutar? (analizar, redactar, diseñar…)',
  formato:       '¿En qué formato querés la respuesta? (lista, tabla, documento, código…)',
  audiencia:     '¿Para quién es y con qué tono? (cliente, equipo técnico, formal, cercano…)',
  criterios:     '¿Cómo vas a saber que el resultado quedó bien?',
  restricciones: '¿Qué NO debe hacer o incluir? (largo máximo, temas a evitar…)',
  ejemplos:      '¿Tenés un ejemplo o una referencia a seguir?',
};

/**
 * Analiza el dictado y devuelve todo lo que hace falta para armar el
 * prompt: secciones con viñetas, conceptos, datos duros y métricas.
 */
export function analizar(texto, opciones = {}) {
  const nivel = NIVELES[opciones.nivel] || NIVELES[NIVEL_POR_DEFECTO];
  const original = String(texto || '');
  const limpio = limpiarDictado(original);
  const frases = partirEnFrases(limpio);
  const conceptos = conceptosClave(limpio);
  const clavesTop = new Set(conceptos.slice(0, 6).flatMap((c) => c.texto.split(' ')));

  const cubos = Object.fromEntries(SECCIONES.map((s) => [s.id, []]));

  frases.forEach((frase, i) => {
    const { seccion, fuerza } = clasificar(frase);
    const viñeta = comprimir(frase, nivel.largo);
    if (viñeta.split(/\s+/).length < 3) return;

    const palabras = contenido(frase);
    const aciertos = palabras.filter((p) => clavesTop.has(p)).length;
    const peso =
      1 +
      Math.min(fuerza, 12) * 0.35 +          // qué tan claramente es de su sección
      Math.min(aciertos, 5) * 0.7 +          // habla de lo que el texto repite
      (/\d/.test(frase) ? 0.9 : 0) +         // trae cifras
      (i < frases.length * 0.25 ? 0.5 : 0) - // lo primero suele ser el encargo
      (frase.length > 260 ? 0.6 : 0);

    cubos[seccion].push({ texto: viñeta, peso, orden: i });
  });

  // Fuera repetidas y contenidas dentro de otra, y me quedo con las mejores.
  const secciones = {};
  for (const { id } of SECCIONES) {
    const candidatas = [...cubos[id]].sort((a, b) => b.peso - a.peso);
    const elegidas = [];
    for (const c of candidatas) {
      const repetida = elegidas.some(
        (e) => parecido(e.texto, c.texto) > 0.7 ||
               normalizar(e.texto).includes(normalizar(c.texto).trim()),
      );
      if (repetida) continue;
      elegidas.push(c);
      if (elegidas.length >= nivel.viñetas) break;
    }
    secciones[id] = elegidas.sort((a, b) => a.orden - b.orden);
  }

  // Tope global: aunque cada sección respete su cupo, un prompt de
  // cuarenta viñetas no es una síntesis. Se salva la mejor de cada
  // sección y el resto compite por los lugares que queden.
  const todas = SECCIONES.flatMap(({ id }) => secciones[id].map((v) => ({ ...v, id })));
  if (todas.length > nivel.total) {
    const salvadas = new Set();
    for (const { id } of SECCIONES) {
      const mejor = [...secciones[id]].sort((a, b) => b.peso - a.peso)[0];
      if (mejor) salvadas.add(mejor.texto);
    }
    for (const v of [...todas].sort((a, b) => b.peso - a.peso)) {
      if (salvadas.size >= nivel.total) break;
      salvadas.add(v.texto);
    }
    for (const { id } of SECCIONES) {
      secciones[id] = secciones[id].filter((v) => salvadas.has(v.texto));
    }
  }

  for (const { id } of SECCIONES) secciones[id] = secciones[id].map((v) => v.texto);

  // El objetivo no puede quedar vacío: si nadie lo reclamó, uso la mejor frase.
  if (!secciones.objetivo.length) {
    const rescate = [...cubos.contexto].sort((a, b) => b.peso - a.peso)[0];
    if (rescate) {
      secciones.objetivo = [rescate.texto];
      secciones.contexto = secciones.contexto.filter((t) => t !== rescate.texto);
    }
  }

  const preguntas = Object.entries(FALTANTES)
    .filter(([id]) => !secciones[id]?.length)
    .map(([, pregunta]) => pregunta);

  const datos = datosDuros(limpio);
  const rol = detectarRol(limpio);
  const titulo = titular(secciones, conceptos);

  return {
    titulo,
    rol,
    secciones,
    conceptos,
    datos,
    preguntas,
    faltantes: preguntas,
    nivel: opciones.nivel || NIVEL_POR_DEFECTO,
    fuente: { original, limpio, frases: frases.length },
  };
}

/** Un título corto para reconocer el prompt en la biblioteca. */
function titular(secciones, conceptos) {
  const base = secciones.objetivo[0] || secciones.contexto[0];
  if (base) {
    let corto = comprimir(base, 68).replace(/…$/, '');
    let antes;
    do {
      antes = corto;
      corto = corto.replace(/[\s,;:]+$/, '').replace(/\s+\p{L}{1,4}$/u, (cola) =>
        VACIAS.has(cola.trim().toLowerCase()) ? '' : cola);
    } while (corto !== antes);
    if (corto.length > 12) return corto;
  }
  const claves = conceptos.slice(0, 3).map((c) => c.texto).join(', ');
  return claves ? `Prompt sobre ${claves}` : 'Prompt sin título';
}

/* ─────────── Plantillas ─────────── */

export const PLANTILLAS = [
  { id: 'estructurado', nombre: 'Estructurado', pie: 'Secciones en Markdown. El de todos los días.' },
  { id: 'claude',       nombre: 'Claude / XML',  pie: 'Etiquetas XML: lo que mejor sigue Claude en un proyecto.' },
  { id: 'sistema',      nombre: 'Instrucciones', pie: 'Para pegar en las instrucciones del proyecto.' },
  { id: 'brief',        nombre: 'Brief',         pie: 'Resumen de encargo para pasarle a una persona.' },
  { id: 'esencia',      nombre: 'Esencia',       pie: 'Diez líneas y punto.' },
];

const listar = (viñetas) => viñetas.map((v) => `- ${v}`).join('\n');

function plantillaEstructurado(a, o) {
  const partes = [`# ${a.titulo}`];
  if (a.rol) partes.push(`**Rol:** actuá como ${a.rol}.`);

  for (const { id, titulo } of SECCIONES) {
    if (id === 'preguntas') continue;
    const viñetas = a.secciones[id];
    if (viñetas?.length) partes.push(`## ${titulo}\n${listar(viñetas)}`);
  }
  if (o.datos && a.datos.length) partes.push(`## Datos que no se pueden perder\n${listar(a.datos)}`);
  if (o.conceptos && a.conceptos.length) {
    partes.push(`## Conceptos clave\n${a.conceptos.map((c) => c.texto).join(' · ')}`);
  }
  if (o.preguntas && (a.secciones.preguntas.length || a.preguntas.length)) {
    partes.push(`## Antes de empezar, resolvé\n${listar([...a.secciones.preguntas, ...a.preguntas])}`);
  }
  return partes.join('\n\n');
}

function plantillaClaude(a, o) {
  const bloque = (etiqueta, viñetas) =>
    viñetas?.length ? `<${etiqueta}>\n${listar(viñetas)}\n</${etiqueta}>` : '';

  const partes = [];
  if (a.rol) partes.push(`<rol>Actuás como ${a.rol}.</rol>`);
  partes.push(bloque('objetivo', a.secciones.objetivo));
  partes.push(bloque('contexto', a.secciones.contexto));
  partes.push(bloque('requisitos', a.secciones.requisitos));
  partes.push(bloque('restricciones', a.secciones.restricciones));
  partes.push(bloque('formato_de_salida', a.secciones.formato));
  partes.push(bloque('audiencia_y_tono', a.secciones.audiencia));
  partes.push(bloque('ejemplos', a.secciones.ejemplos));
  partes.push(bloque('criterios_de_exito', a.secciones.criterios));
  if (o.datos) partes.push(bloque('datos', a.datos));
  if (o.preguntas) partes.push(bloque('dudas', [...a.secciones.preguntas, ...a.preguntas]));
  return partes.filter(Boolean).join('\n\n');
}

function plantillaSistema(a, o) {
  const partes = [];
  partes.push(`Actuás como ${a.rol || 'un especialista en ' + (a.conceptos[0]?.texto || 'el tema de este proyecto')}.`);

  if (a.secciones.objetivo.length) partes.push(`TU TAREA\n${listar(a.secciones.objetivo)}`);
  if (a.secciones.contexto.length) partes.push(`CONTEXTO\n${listar(a.secciones.contexto)}`);

  const reglas = [
    ...a.secciones.requisitos,
    ...a.secciones.restricciones.map((r) => (/^no\b/i.test(r) ? r : `Evitá: ${r[0].toLowerCase()}${r.slice(1)}`)),
  ];
  if (reglas.length) partes.push(`REGLAS\n${listar(reglas)}`);

  const salida = [...a.secciones.formato, ...a.secciones.audiencia];
  if (salida.length) partes.push(`CÓMO RESPONDER\n${listar(salida)}`);
  if (a.secciones.ejemplos.length) partes.push(`REFERENCIAS\n${listar(a.secciones.ejemplos)}`);
  if (a.secciones.criterios.length) partes.push(`ANTES DE ENTREGAR, VERIFICÁ\n${listar(a.secciones.criterios)}`);
  if (o.datos && a.datos.length) partes.push(`DATOS FIJOS\n${listar(a.datos)}`);
  if (o.preguntas && a.preguntas.length) {
    partes.push(`SI TE FALTA ALGO\nPreguntá antes de suponer, sobre todo:\n${listar(a.preguntas)}`);
  }
  return partes.join('\n\n');
}

function plantillaBrief(a, o) {
  const partes = [`PROYECTO: ${a.titulo}`];
  if (a.secciones.objetivo.length) partes.push(`QUÉ SE PIDE\n${listar(a.secciones.objetivo)}`);
  if (a.secciones.contexto.length) partes.push(`DE DÓNDE VENIMOS\n${listar(a.secciones.contexto)}`);

  const entregables = [...a.secciones.formato, ...a.secciones.requisitos];
  if (entregables.length) partes.push(`ENTREGABLES Y CONDICIONES\n${listar(entregables)}`);
  if (a.secciones.restricciones.length) partes.push(`FUERA DE ALCANCE / LÍMITES\n${listar(a.secciones.restricciones)}`);
  if (a.secciones.audiencia.length) partes.push(`PARA QUIÉN\n${listar(a.secciones.audiencia)}`);
  if (a.secciones.criterios.length) partes.push(`SE APRUEBA CUANDO\n${listar(a.secciones.criterios)}`);
  if (o.datos && a.datos.length) partes.push(`CIFRAS Y FECHAS\n${listar(a.datos)}`);
  if (o.preguntas && a.preguntas.length) partes.push(`PENDIENTE DE DEFINIR\n${listar(a.preguntas)}`);
  return partes.join('\n\n');
}

function plantillaEsencia(a) {
  const mejores = [
    ...a.secciones.objetivo.slice(0, 2),
    ...a.secciones.requisitos.slice(0, 2),
    ...a.secciones.restricciones.slice(0, 1),
    ...a.secciones.formato.slice(0, 1),
    ...a.secciones.contexto.slice(0, 2),
    ...a.secciones.criterios.slice(0, 1),
  ].slice(0, 8);

  const partes = [a.titulo, listar(mejores.map((m) => comprimir(m, 110)))];
  if (a.datos.length) partes.push(`Datos: ${a.datos.slice(0, 6).join(' · ')}`);
  return partes.join('\n\n');
}

/** Arma el texto final con la plantilla elegida. */
export function renderizar(analisis, opciones = {}) {
  const o = {
    datos: opciones.datos !== false,
    conceptos: opciones.conceptos !== false,
    preguntas: opciones.preguntas !== false,
    ...{},
  };
  switch (opciones.plantilla) {
    case 'claude':  return plantillaClaude(analisis, o);
    case 'sistema': return plantillaSistema(analisis, o);
    case 'brief':   return plantillaBrief(analisis, o);
    case 'esencia': return plantillaEsencia(analisis, o);
    default:        return plantillaEstructurado(analisis, o);
  }
}

/* ─────────── Métricas ─────────── */

/** Tokens aproximados. En español ronda un token cada 3,6 caracteres. */
export const estimarTokens = (texto) => Math.ceil(String(texto || '').length / 3.6);

export function medir(entrada, salida) {
  const palabras = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const tokensEntrada = estimarTokens(entrada);
  const tokensSalida = estimarTokens(salida);
  return {
    caracteresEntrada: entrada.length,
    caracteresSalida: salida.length,
    palabrasEntrada: palabras(entrada),
    palabrasSalida: palabras(salida),
    tokensEntrada,
    tokensSalida,
    tokensAhorrados: Math.max(0, tokensEntrada - tokensSalida),
    reduccion: entrada.length ? Math.round((1 - salida.length / entrada.length) * 100) : 0,
  };
}

/* ─────────── Puerta de entrada ─────────── */

/** Dictado en bruto → prompt listo, con su análisis y sus métricas. */
export function optimizar(texto, opciones = {}) {
  const analisis = analizar(texto, opciones);
  const prompt = renderizar(analisis, opciones);
  return { prompt, analisis, metricas: medir(String(texto || ''), prompt) };
}
