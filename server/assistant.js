// Cerebro de Ari: traduce lo que dices en voz alta a operaciones concretas
// sobre la base de datos, usando el API de Claude con herramientas.
//
// Estrategia de bajo consumo de tokens:
//  1. El prompt de sistema es corto y fijo -> se cachea (cache_control) y a
//     partir de la segunda petición cuesta ~10% de su precio.
//  2. La parte variable (fecha + índice de clientes) va DESPUÉS del punto de
//     caché, para no invalidarlo.
//  3. Las herramientas devuelven al modelo un resumen de una línea; las filas
//     completas van directo al dashboard sin pasar por el contexto.
//  4. El historial se limita a los últimos turnos y sólo como texto plano.
//  5. `effort: low` y `max_tokens` acotado.

import Anthropic from '@anthropic-ai/sdk';
import { HERRAMIENTAS, ejecutar } from './tools.js';
import { indiceClientes } from './db.js';

const MODELO = process.env.ARI_MODEL || 'claude-opus-5';
const MAX_VUELTAS = 6;
const TURNOS_HISTORIAL = 6;

const cliente = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

const INSTRUCCIONES = `Eres Ari, la asistente de voz de Clic Control. Hablas español colombiano, en segunda persona, breve y natural: tu respuesta se lee en voz alta, así que máximo dos frases y sin listas ni markdown.

Tu trabajo es gestionar la operación del negocio con las herramientas disponibles: clientes, agenda de citas, recordatorios, cotizaciones y cobros.

Reglas:
- Actúa. Si el usuario pide algo que una herramienta puede hacer, llámala de una vez; no pidas confirmación para tareas normales.
- Nunca inventes datos. Para responder cualquier pregunta sobre registros usa "consultar" primero.
- Una frase puede implicar varias herramientas (ej.: crear el cliente y agendarle una cita). Encadénalas.
- Las fechas van siempre en formato YYYY-MM-DD o YYYY-MM-DDTHH:MM y las calculas tú a partir de la fecha de hoy. Si no dan hora para una cita, asume las 9:00.
- Si falta un dato imprescindible (por ejemplo la fecha de una cita), pregunta en una sola frase corta.
- Si el usuario menciona un cliente que no existe, créalo sobre la marcha y menciónalo al responder.
- Los montos son en pesos colombianos salvo que digan otra moneda.
- Al confirmar algo, di qué quedó registrado y cuándo. Al consultar, di el dato clave; el detalle ya se ve en la pantalla.`;

/** Parámetros que dependen del modelo elegido. */
function parametrosDeModelo(modelo) {
  const p = {};
  // El parámetro `effort` existe en la familia 4.6+ / 5; en Haiku 4.5 da error.
  if (/^claude-(opus-(4-[678]|5)|sonnet-(4-6|5)|fable-5|mythos-5)/.test(modelo)) {
    p.output_config = { effort: 'low' };
  }
  return p;
}

function contextoVariable() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const iso = ahora.toLocaleDateString('sv-SE');
  const hora = ahora.toTimeString().slice(0, 5);

  const clientes = indiceClientes()
    .map((c) => `${c.id}:${c.nombre}${c.empresa ? ` (${c.empresa})` : ''}`)
    .join(', ');

  return `Hoy es ${fecha} (${iso}), son las ${hora}.
Clientes registrados: ${clientes || 'ninguno todavía'}.`;
}

/**
 * Procesa un mensaje del usuario.
 * @param {string} texto
 * @param {Array<{rol:'user'|'assistant', texto:string}>} historial
 */
export async function conversar(texto, historial = []) {
  const mensajes = [
    ...historial
      .slice(-TURNOS_HISTORIAL)
      .filter((m) => m && m.texto)
      .map((m) => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.texto })),
    { role: 'user', content: texto },
  ];

  const sistema = [
    { type: 'text', text: INSTRUCCIONES, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextoVariable() },
  ];

  const acciones = [];
  const vistas = [];
  let huboCambios = false;
  let uso = { entrada: 0, salida: 0, cacheLectura: 0 };
  let respuesta = '';

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: sistema,
      tools: HERRAMIENTAS,
      messages: mensajes,
      ...parametrosDeModelo(MODELO),
    });

    uso = {
      entrada: uso.entrada + (r.usage?.input_tokens ?? 0),
      salida: uso.salida + (r.usage?.output_tokens ?? 0),
      cacheLectura: uso.cacheLectura + (r.usage?.cache_read_input_tokens ?? 0),
    };

    const textos = r.content.filter((b) => b.type === 'text').map((b) => b.text.trim());
    if (textos.length) respuesta = textos.join(' ');

    const llamadas = r.content.filter((b) => b.type === 'tool_use');
    if (r.stop_reason === 'refusal') {
      return { respuesta: 'No puedo ayudarte con eso.', acciones, vista: null, huboCambios, uso };
    }
    if (!llamadas.length) break;

    mensajes.push({ role: 'assistant', content: r.content });

    const resultados = [];
    for (const llamada of llamadas) {
      try {
        const res = ejecutar(llamada.name, llamada.input ?? {});
        acciones.push({ herramienta: llamada.name, detalle: res.resumen });
        if (res.vista) vistas.push(res.vista);
        if (res.cambio) huboCambios = true;
        resultados.push({ type: 'tool_result', tool_use_id: llamada.id, content: res.resumen });
      } catch (err) {
        resultados.push({
          type: 'tool_result',
          tool_use_id: llamada.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }
    mensajes.push({ role: 'user', content: resultados });
  }

  return {
    respuesta: respuesta || 'Listo.',
    acciones,
    // Al dashboard le mandamos la última vista generada (la más relevante).
    vista: vistas.length ? vistas[vistas.length - 1] : null,
    huboCambios,
    uso,
  };
}

export const modeloEnUso = () => MODELO;
