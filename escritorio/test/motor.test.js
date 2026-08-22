/* Pruebas del motor de síntesis. Se corren con `npm test` dentro de
   escritorio/, o con `node --test escritorio/test/`. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analizar, clasificar, comprimir, conceptosClave, datosDuros, detectarRol,
  limpiarDictado, medir, optimizar, parecido, partirEnFrases, PLANTILLAS,
} from '../src/motor.js';

// Un dictado como los de verdad: hablado de corrido, con vueltas y repeticiones.
const DICTADO = `Bueno, eh, mira, lo que yo quiero es que me armes una propuesta comercial
para la Ferretería El Tornillo, que es un cliente que llevo desde hace como tres años y que
maneja, o sea, unas catorce sucursales en el eje cafetero. El tema es que ellos hoy están
llevando el inventario en Excel, en unos archivos que se pasan por WhatsApp, y eso les está
generando un desorden bárbaro, ¿me entiendes? Entonces yo lo que necesito es que la propuesta
les explique cómo el sistema POS que nosotros vendemos les resuelve ese desorden.
La propuesta tiene que incluir sí o sí el detalle de la inversión, que son 4 millones 200 mil
pesos, y tiene que dejar claro que el soporte está incluido el primer año. Ah, y debe mencionar
que la implementación toma 30 días. No me pongas lenguaje técnico, porque el que la lee es
don Alberto, que es el dueño, y él no es una persona de tecnología, o sea, nada de hablar de
APIs ni de bases de datos. Nunca uses palabras en inglés. Dirigido a don Alberto, entonces el
tono tiene que ser cercano pero profesional, como de alguien que lo conoce hace rato.
Me lo entregás en formato de documento de máximo dos páginas, con títulos y con una tabla
al final que resuma la inversión. Por ejemplo, algo parecido a la propuesta que le hicimos a
la panadería La Espiga el año pasado, ese formato me gustó mucho. Yo voy a saber que quedó
bien si don Alberto la puede leer en cinco minutos y entiende de una cuánto va a pagar y qué
le va a llegar. Tiene que estar lista antes del 15 de septiembre. ¿Le pongo también el tema
del descuento por pago anticipado?`;

test('limpia tartamudeos y muletillas sin comerse palabras reales', () => {
  const limpio = limpiarDictado('Analiza este prompt y me me me lo pasas, o sea, ya');
  assert.ok(limpio.includes('este prompt'), 'no debe borrar «este» cuando acompaña a un sustantivo');
  assert.ok(!/me me/.test(limpio), 'debe colapsar el tartamudeo');
  assert.ok(!/o sea/.test(limpio), 'debe borrar la muletilla');
});

test('parte dictado sin puntuación por los conectores del habla', () => {
  const corrido = `necesito una propuesta para el cliente ${'x '.repeat(80)}además tiene que incluir la inversión total y el plazo de entrega`;
  const frases = partirEnFrases(corrido);
  assert.ok(frases.length >= 2, 'un tramo larguísimo no puede quedar en una sola frase');
});

test('cada frase cae en su sección', () => {
  assert.equal(clasificar('Necesito que me armes una propuesta comercial').seccion, 'objetivo');
  assert.equal(clasificar('La propuesta tiene que incluir el detalle de la inversión').seccion, 'requisitos');
  assert.equal(clasificar('Nunca uses palabras en inglés').seccion, 'restricciones');
  assert.equal(clasificar('Me lo entregás en formato de documento de máximo dos páginas').seccion, 'formato');
  assert.equal(clasificar('Por ejemplo, algo parecido a la propuesta de la panadería').seccion, 'ejemplos');
  assert.equal(clasificar('¿Le pongo el descuento por pago anticipado?').seccion, 'preguntas');
});

test('comprimir quita el relleno inicial y respeta el largo pedido', () => {
  assert.equal(comprimir('Entonces, lo que yo quiero es que me armes la propuesta', 200), 'Me armes la propuesta');
  const largo = comprimir('palabra '.repeat(80), 60);
  assert.ok(largo.length <= 61, `quedó en ${largo.length}`);
  assert.ok(largo.endsWith('…'));
});

test('el parecido detecta frases repetidas con otras palabras', () => {
  assert.ok(parecido('la propuesta incluye la inversión total', 'incluye la inversión total en la propuesta') > 0.7);
  assert.ok(parecido('la propuesta incluye la inversión', 'el soporte técnico dura un año') < 0.3);
});

test('rescata cifras, plazos y fechas del dictado', () => {
  const datos = datosDuros(DICTADO).join(' | ').toLowerCase();
  assert.ok(datos.includes('4 millones'), 'la inversión no puede perderse');
  assert.ok(datos.includes('30 días'), 'el plazo de implementación no puede perderse');
  assert.ok(datos.includes('15 de septiembre'), 'la fecha límite no puede perderse');
});

test('detecta el rol cuando se pide uno', () => {
  assert.match(detectarRol('Actúa como un abogado laboral y revisá el contrato'), /abogado/);
  assert.equal(detectarRol('Hazme un resumen de esto'), null);
});

test('el análisis llena las secciones que el dictado menciona', () => {
  const a = analizar(DICTADO);
  for (const seccion of ['objetivo', 'contexto', 'requisitos', 'restricciones', 'formato', 'audiencia', 'ejemplos', 'criterios', 'preguntas']) {
    assert.ok(a.secciones[seccion].length > 0, `sección vacía: ${seccion}`);
  }
  assert.ok(a.titulo.length > 12 && a.titulo.length <= 70);
  assert.ok(a.conceptos.some((c) => /tornillo|propuesta|inversion|inversión/i.test(c.texto)));
});

test('pregunta por lo que falta y calla por lo que sí está', () => {
  const a = analizar('Necesito una propuesta para la ferretería del norte con lo que hablamos ayer');
  assert.ok(a.preguntas.some((p) => /formato/i.test(p)));
  assert.equal(analizar(DICTADO).preguntas.length, 0, 'un dictado completo no necesita preguntas');
});

// El caso para el que está hecha la app: hablar de corrido y sin frenos,
// dando vueltas sobre lo mismo. Aquí es donde tiene que recortar en serio.
const LARGUERO = `${DICTADO}

Ah y otra cosa que se me olvidaba, y perdón que me devuelva, pero es que don Alberto
es de esas personas que uno le manda un correo largo y no lo lee, entonces, o sea, la
propuesta tiene que entrar por los ojos, ¿me entiendes? Yo me acuerdo que la vez pasada
le mandamos una cosa de ocho páginas y el hombre ni la abrió, y después me llamó a
preguntarme lo mismo que estaba escrito en la página tres, o sea, imagínate.
Entonces, bueno, volviendo a lo de la propuesta, yo lo que quiero es que sea corta.
Corta y que se entienda. Que se entienda bien, o sea, que él la lea y diga listo, hagámosle.
Y bueno, lo del inventario en Excel ya te lo dije pero te lo repito porque es la clave de
todo: ellos manejan los archivos por WhatsApp, cada sucursal manda el suyo, y al final del
mes nadie sabe cuánto hay. Eso es lo que hay que atacar. Eso es el dolor, digamos.
Y mira, algo que también me parece importante, aunque no sé si vaya en la propuesta o no,
es que ellos ya intentaron con otro proveedor hace como dos años y les fue mal, entonces
vienen con desconfianza, o sea, hay que cuidar mucho el tema de que nosotros sí acompañamos.
Por eso te decía lo del soporte, que quede clarísimo lo del soporte del primer año.
Clarísimo. Que no quede como letra chiquita. Y nada, eso sería, creo que con eso tienes.
Ah no, espera, una última cosa: nada de mencionar a la competencia. Nada. Ni una palabra
de los otros proveedores, porque eso se ve feo y además a don Alberto no le gusta.`;

test('el prompt sale mucho más corto que un dictado hablado de corrido', () => {
  const { metricas } = optimizar(LARGUERO, { nivel: 'equilibrado' });
  assert.ok(metricas.reduccion > 40, `sólo redujo ${metricas.reduccion}%`);
  assert.ok(metricas.tokensAhorrados > 300, `ahorró ${metricas.tokensAhorrados} tokens`);
});

test('al recortar no se pierde ningún dato duro', () => {
  const { prompt } = optimizar(LARGUERO, { nivel: 'esencial' });
  for (const dato of ['4 millones', '15 de septiembre', '30 días']) {
    assert.ok(prompt.includes(dato), `se perdió: ${dato}`);
  }
});

test('el que repite una idea tres veces la ve una sola vez en el prompt', () => {
  const { prompt } = optimizar(LARGUERO, { nivel: 'equilibrado' });
  const vecesSoporte = (prompt.match(/soporte/gi) || []).length;
  assert.ok(vecesSoporte <= 2, `«soporte» aparece ${vecesSoporte} veces`);
});

test('el nivel esencial aprieta más que el detallado', () => {
  const corto = optimizar(DICTADO, { nivel: 'esencial' }).prompt.length;
  const largo = optimizar(DICTADO, { nivel: 'detallado' }).prompt.length;
  assert.ok(corto < largo, `esencial ${corto} vs detallado ${largo}`);
});

test('todas las plantillas generan algo y no pierden lo esencial', () => {
  for (const { id } of PLANTILLAS) {
    const { prompt } = optimizar(DICTADO, { plantilla: id });
    assert.ok(prompt.length > 120, `plantilla vacía: ${id}`);
    assert.match(prompt, /propuesta/i, `plantilla sin el encargo: ${id}`);
  }
  assert.match(optimizar(DICTADO, { plantilla: 'claude' }).prompt, /<objetivo>/);
});

test('los interruptores de datos, conceptos y preguntas se respetan', () => {
  const sin = optimizar(DICTADO, { datos: false, conceptos: false, preguntas: false }).prompt;
  assert.ok(!/Datos que no se pueden perder/.test(sin));
  assert.ok(!/Conceptos clave/.test(sin));
});

test('aguanta entradas vacías o absurdas sin romperse', () => {
  for (const entrada of ['', '   ', '...', 'ah', null, undefined]) {
    const r = optimizar(entrada);
    assert.equal(typeof r.prompt, 'string');
  }
});

test('las métricas cuadran', () => {
  const m = medir('hola mundo', 'hola');
  assert.equal(m.palabrasEntrada, 2);
  assert.equal(m.palabrasSalida, 1);
  assert.equal(m.reduccion, 60);
});

test('los conceptos se muestran como se escribieron', () => {
  const conceptos = conceptosClave('La implementación de la implementación del sistema');
  assert.ok(conceptos.some((c) => c.texto === 'implementación'), JSON.stringify(conceptos));
});

test('una negación colgada de otra idea se lleva su propia viñeta', () => {
  const { secciones } = analizar('Tiene que salir tres veces por semana, y nunca hables de precios');
  assert.ok(secciones.restricciones.some((v) => /nunca hables/i.test(v)), JSON.stringify(secciones));
  assert.ok(secciones.requisitos.some((v) => /tres veces/i.test(v)), JSON.stringify(secciones));
});

test('«no a las empresas» no se corta: es parte de la misma idea', () => {
  const { secciones } = analizar('Necesito contenido que le hable a los maestros de obra, no a las empresas');
  assert.ok(secciones.objetivo.some((v) => /no a las empresas/i.test(v)), JSON.stringify(secciones));
});

test('los plazos entran como restricción, se digan como se digan', () => {
  for (const plazo of ['Que quede listo antes del 30 de agosto', 'Lo necesito a más tardar el viernes']) {
    assert.equal(clasificar(plazo).seccion, 'restricciones', plazo);
  }
});

test('el título no termina en preposición', () => {
  const { titulo } = analizar('Necesito que me armes el plan de contenidos del mes para el Instagram de la ferretería del centro');
  assert.doesNotMatch(titulo, /\s(de|la|el|los|las|del|para|con|en|un|una|y|o|que|a)$/i, titulo);
});
