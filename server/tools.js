// Definición de herramientas que puede usar Ari y su ejecución contra la base
// de datos.
//
// Regla de oro para el consumo de tokens: al modelo sólo le devolvemos un
// resumen corto en texto. Las filas completas viajan aparte, directamente al
// dashboard, sin pasar nunca por el contexto del modelo.

import * as db from './db.js';

/* ------------------------------------------------------------------ */
/* Utilidades de fecha                                                 */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Acepta lo que el modelo devuelva y lo normaliza a 'YYYY-MM-DD' o
 * 'YYYY-MM-DDTHH:MM'. Sirve de red de seguridad para expresiones relativas
 * que se le hayan escapado al modelo ("mañana", "el viernes").
 */
export function normalizarFecha(valor) {
  if (!valor) return null;
  let s = String(valor).trim().toLowerCase();

  // Ya viene en formato ISO
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:[t ](\d{1,2}):(\d{2}))?/);
  if (iso) {
    return iso[2] ? `${iso[1]}T${pad(iso[2])}:${iso[3]}` : iso[1];
  }

  const base = new Date();
  const hora = s.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm|de la (?:mañana|tarde|noche))?/);
  let dias = null;

  if (/\bhoy\b/.test(s)) dias = 0;
  else if (/\bmañana\b|\bmanana\b/.test(s)) dias = 1;
  else if (/pasado\s*mañana|pasado\s*manana/.test(s)) dias = 2;
  else {
    const sinTildes = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dia = DIAS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(sinTildes));
    if (dia >= 0) {
      dias = (dia - base.getDay() + 7) % 7;
      if (dias === 0) dias = 7;
    }
  }

  if (dias === null) return null;

  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  if (!hora) return aISO(d);

  let h = Number(hora[1]);
  const m = hora[2] ? Number(hora[2]) : 0;
  const sufijo = hora[3] || '';
  if (/p\.?m|tarde|noche/.test(sufijo) && h < 12) h += 12;
  if (/a\.?m|mañana/.test(sufijo) && h === 12) h = 0;
  return `${aISO(d)}T${pad(h)}:${pad(m)}`;
}

const dinero = (n, moneda = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, maximumFractionDigits: 0 })
    .format(Number(n) || 0);

/* ------------------------------------------------------------------ */
/* Esquemas de herramientas                                            */
/* ------------------------------------------------------------------ */

const clienteProp = {
  type: 'string',
  description: 'Nombre o empresa del cliente. Se busca por coincidencia parcial.',
};

export const HERRAMIENTAS = [
  {
    name: 'crear_cliente',
    description:
      'Registra un cliente nuevo en Clic Control. Úsala cuando el usuario diga "crea un cliente", "agrega a", "nuevo cliente".',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona o de la empresa.' },
        empresa: { type: 'string' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        direccion: { type: 'string' },
        notas: { type: 'string', description: 'Cualquier detalle adicional que mencione el usuario.' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'agendar_cita',
    description:
      'Agenda una cita, reunión o visita en la agenda. Úsala para "agéndame", "tengo una reunión", "visita el jueves".',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'De qué se trata la cita.' },
        fecha_hora: {
          type: 'string',
          description: 'Fecha y hora en formato YYYY-MM-DDTHH:MM. Calcúlala a partir de la fecha de hoy.',
        },
        duracion_min: { type: 'integer', description: 'Duración en minutos. Por defecto 60.' },
        cliente: clienteProp,
        lugar: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['titulo', 'fecha_hora'],
    },
  },
  {
    name: 'crear_recordatorio',
    description:
      'Crea un recordatorio o tarea pendiente. Úsala para "recuérdame", "no se me olvide", "tengo que".',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Qué hay que recordar.' },
        fecha_hora: { type: 'string', description: 'Cuándo, en formato YYYY-MM-DD o YYYY-MM-DDTHH:MM.' },
        prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
        cliente: clienteProp,
      },
      required: ['texto'],
    },
  },
  {
    name: 'crear_cotizacion',
    description:
      'Empieza una cotización NUEVA para un cliente, vacía. Úsala sólo cuando el usuario pide una nueva con todas las letras: "hazle una cotización a Fulano", "armemos otra cotización", "cotización nueva para". NO la uses cuando pide agregar o cambiar algo sobre una cotización que ya existe ("agregale X a la cotización de Fulano") — para eso está agregar_item_cotizacion, que encuentra la que ya tiene abierta.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        titulo: { type: 'string', description: 'Qué se está cotizando.' },
        monto: { type: 'number', description: 'Valor total. Si no lo dicen, omítelo.' },
        moneda: { type: 'string', description: 'Por defecto COP.' },
        descripcion: { type: 'string' },
        vence_en: { type: 'string', description: 'Fecha de vencimiento YYYY-MM-DD.' },
        estado: { type: 'string', enum: ['pendiente', 'enviada', 'aprobada', 'rechazada'] },
        porcentaje_servicio: { type: 'number', description: 'Porcentaje de servicio/instalación sobre los productos.' },
        porcentaje_iva: { type: 'number', description: 'Porcentaje de IVA. En Colombia suele ser 19.' },
        nivel_precio: {
          type: 'string',
          enum: ['canal', 'constructor', 'cliente'],
          description: 'Con cuál de los tres precios del catálogo se cotiza. Por defecto "cliente".',
        },
      },
      required: ['cliente', 'titulo'],
    },
  },
  {
    name: 'agregar_item_cotizacion',
    description:
      'Agrega un renglón a una cotización que ya existe. Úsala para "agregá 2 interruptores de dos canales", "ponele 3 cámaras", "sumale mano de obra por 2 millones", y también para "agregale esto a la cotización de Fulano". SI HAY UNA COTIZACIÓN EN CURSO, no hace falta nombrar al cliente: el renglón va ahí. Si el usuario nombra un cliente, pasa "cliente" y el renglón va a la cotización abierta de ESE cliente — NO uses crear_cotizacion para eso, que le duplicaría la cotización. Si el producto no está en el catálogo, pasa descripcion y precio_unitario a mano (sirve para mano de obra, obra civil, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        cliente: {
          ...clienteProp,
          description: 'Sólo si el usuario nombra otro cliente. Omítelo para seguir con la cotización en curso.',
        },
        cotizacion: {
          type: 'string',
          description: 'Número o parte del título. Omítelo para seguir con la cotización en curso.',
        },
        producto: {
          type: 'string',
          description: 'Nombre o referencia del producto en el catálogo. Su precio y descripción se copian de ahí.',
        },
        descripcion: {
          type: 'string',
          description: 'Sólo si NO es un producto del catálogo (mano de obra, obra civil, un ítem suelto).',
        },
        cantidad: { type: 'number', description: 'Cuántas unidades. Por defecto 1.' },
        precio_unitario: {
          type: 'number',
          description: 'Sólo si el usuario dicta un precio distinto al del catálogo, o si el renglón es libre.',
        },
        seccion: {
          type: 'string',
          description: 'Grupo dentro de la cotización: "Interruptores", "Alarma - Seguridad", "Mano de obra"…',
        },
      },
      required: [],
    },
  },
  {
    name: 'finalizar_cotizacion',
    description:
      'Cierra la cotización que se está armando y da el resumen final. Úsala cuando el usuario diga "listo", "ya está", "finalizá la cotización", "esa es la cotización", "hasta ahí". Después de esto, los renglones nuevos ya no van a esa cotización.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'ajustar_item_cotizacion',
    description:
      'Cambia la cantidad o el precio de un renglón que YA está en una cotización, o le aplica un porcentaje, o lo quita. Úsala para "a ese ítem súbele 15%", "ponelo en 300 mil", "cambiá la cantidad de los interruptores de 3 canales a 7", "quitá ese renglón". Para decir cuál renglón es, lo normal es pasar "producto" con el nombre que usó el usuario (y "cliente" si nombró otra cotización); el item_id sólo si ya lo sabes.',
    input_schema: {
      type: 'object',
      properties: {
        producto: {
          type: 'string',
          description: 'Cómo nombró el usuario el renglón: "los interruptores de 3 canales", "la mano de obra", una referencia. Se busca dentro de la cotización.',
        },
        cliente: {
          ...clienteProp,
          description: 'Sólo si el usuario nombra un cliente distinto al de la cotización en curso.',
        },
        cotizacion: {
          type: 'string',
          description: 'Número o parte del título, si el usuario nombra una cotización puntual.',
        },
        item_id: { type: 'integer', description: 'ID del renglón, si ya lo conoces. Si no, usa "producto".' },
        cantidad: { type: 'number' },
        precio_unitario: { type: 'number', description: 'Precio nuevo, si el usuario dicta un número exacto.' },
        porcentaje: {
          type: 'number',
          description: 'Porcentaje a aplicar sobre el precio actual: 15 lo sube 15%, -10 lo baja 10%.',
        },
        eliminar: { type: 'boolean', description: 'true para quitar el renglón de la cotización.' },
      },
      required: [],
    },
  },
  {
    name: 'ajustar_cotizacion',
    description:
      'Cambia los porcentajes globales de una cotización: el de servicio (que se suma sobre los productos) y el de IVA. Úsala para "ponele 20% de servicio", "agregale el IVA", "quitale el IVA".',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        cotizacion: { type: 'string', description: 'Número o parte del título.' },
        porcentaje_servicio: { type: 'number', description: 'Porcentaje de servicio/instalación. 0 para quitarlo.' },
        porcentaje_iva: { type: 'number', description: 'Porcentaje de IVA (en Colombia suele ser 19). 0 para quitarlo.' },
        nivel_precio: {
          type: 'string',
          enum: ['canal', 'constructor', 'cliente'],
          description: 'Con cuál de los tres precios del catálogo se agregan los productos nuevos.',
        },
      },
      required: [],
    },
  },
  {
    name: 'registrar_cobro',
    description:
      'Registra dinero que un cliente debe. Úsala para "me quedó de dar", "me debe", "hay que cobrarle".',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        concepto: { type: 'string', description: 'Por qué debe ese dinero.' },
        monto: { type: 'number' },
        moneda: { type: 'string', description: 'Por defecto COP.' },
        vence_en: { type: 'string', description: 'Fecha límite de pago YYYY-MM-DD.' },
      },
      required: ['cliente', 'concepto', 'monto'],
    },
  },
  {
    name: 'registrar_abono',
    description:
      'Registra un abono o pago parcial que un cliente hace sobre una cotización. Úsala para "me abonó", "me dio un adelanto sobre", "pagó una parte de". Descuenta del saldo de la cotización.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        cotizacion: {
          type: 'string',
          description:
            'Cotización sobre la que abona: su número, o parte del título. Si el cliente tiene una sola con saldo, puedes omitirlo.',
        },
        monto: { type: 'number', description: 'Cuánto abonó.' },
        fecha: { type: 'string', description: 'Cuándo, en formato YYYY-MM-DD. Si no lo dicen, hoy.' },
        nota: { type: 'string', description: 'Detalle: medio de pago, referencia, etc.' },
      },
      required: ['cliente', 'monto'],
    },
  },
  {
    name: 'agregar_nota',
    description:
      'Guarda una nota libre asociada a un cliente. Úsala cuando el usuario cuente algo del cliente que no es cita, cobro ni cotización.',
    input_schema: {
      type: 'object',
      properties: { cliente: clienteProp, texto: { type: 'string' } },
      required: ['cliente', 'texto'],
    },
  },
  {
    name: 'crear_producto',
    description:
      'Agrega un producto al catálogo de precios. Úsala para "agregá al catálogo", "este producto vale", cuando el usuario dicte un producto y su precio de memoria (para listas grandes es mejor subir el Excel desde la pantalla de Productos).',
    input_schema: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', description: 'Qué es el producto.' },
        categoria: { type: 'string', description: 'Familia o categoría, ej. "Interruptores", "Cámaras".' },
        referencia: { type: 'string', description: 'Código o modelo del proveedor, si lo dan.' },
        marca: { type: 'string' },
        unidad: { type: 'string', description: 'Por defecto UND.' },
        precio_cliente: { type: 'number', description: 'Precio de venta al cliente final.' },
        precio_constructor: { type: 'number' },
        precio_canal: { type: 'number' },
        proveedor: { type: 'string' },
        maneja_inventario: {
          type: 'boolean',
          description: 'true si es un producto propio de Clic Control, del que hay que llevar existencias. false (por defecto) si es de un catálogo de proveedor, sólo para cotizar.',
        },
        stock_inicial: { type: 'number', description: 'Cuánto hay ahora mismo, si maneja_inventario es true.' },
      },
      required: ['descripcion', 'precio_cliente'],
    },
  },
  {
    name: 'ajustar_inventario',
    description:
      'Registra una entrada o salida de inventario de un producto propio de Clic Control (no de los que sólo están en el catálogo para cotizar). Úsala para "entraron", "compré", "salieron", "vendí", "se dañaron", "ajustá el inventario de".',
    input_schema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Nombre, referencia o descripción del producto.' },
        cantidad: {
          type: 'number',
          description: 'Positiva si es una entrada (compra, ajuste al alza). Negativa si es una salida (venta, daño, ajuste a la baja).',
        },
        motivo: { type: 'string', description: 'Por qué: "compra a proveedor", "venta directa", "producto dañado", etc.' },
      },
      required: ['producto', 'cantidad'],
    },
  },
  {
    name: 'consultar',
    description:
      'Busca información y la muestra en el dashboard. Úsala para "muéstrame", "cuáles", "qué tengo", "cuánto me deben", "cuánto cuesta", "buscá en el catálogo". SIEMPRE úsala antes de responder con datos: nunca inventes ni asumas registros ni precios.',
    input_schema: {
      type: 'object',
      properties: {
        entidad: {
          type: 'string',
          enum: ['clientes', 'citas', 'recordatorios', 'cotizaciones', 'cobros', 'notas', 'abonos', 'productos', 'movimientos_stock', 'cotizacion_items'],
        },
        cliente: clienteProp,
        cotizacion: { type: 'string', description: 'Número o parte del título. Con entidad "cotizacion_items" muestra los renglones de esa cotización.' },
        producto: { type: 'string', description: 'Nombre, referencia o descripción de un producto. Útil junto con entidad "movimientos_stock" para ver el historial de inventario de uno puntual.' },
        estado: {
          type: 'string',
          description: 'pendiente | completada | cancelada | enviada | aprobada | rechazada | pagado',
        },
        rango: {
          type: 'string',
          enum: ['hoy', 'semana', 'mes', 'vencidos', 'proximos'],
          description: 'Filtro de fecha relativo a hoy.',
        },
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' },
        texto: { type: 'string', description: 'Búsqueda por palabra clave.' },
      },
      required: ['entidad'],
    },
  },
  {
    name: 'actualizar_estado',
    description:
      'Cambia el estado de un registro: marcar una cita como completada, un cobro como pagado, un recordatorio como hecho, una cotización como aprobada.',
    input_schema: {
      type: 'object',
      properties: {
        entidad: { type: 'string', enum: ['citas', 'recordatorios', 'cotizaciones', 'cobros'] },
        id: { type: 'integer', description: 'ID del registro. Si no lo conoces, consúltalo primero.' },
        estado: { type: 'string' },
      },
      required: ['entidad', 'id', 'estado'],
    },
  },
  {
    name: 'editar',
    description:
      'Cambia algo que YA EXISTE: una cita, un recordatorio, un cobro, una nota, un cliente o una cotización. '
      + 'Úsala para "agregale a esa reunión que lleve el catálogo", "cambiá la cita de mañana para las 4", '
      + '"ponele de lugar la obra", "corregile el teléfono a Fulano", "cambiale el título". '
      + 'MUY IMPORTANTE: nunca uses agendar_cita, crear_recordatorio ni crear_cotizacion para modificar algo '
      + 'que ya está — quedarían dos registros iguales. Para saber cuál es, pasa "que" con las palabras que usó '
      + 'el usuario; si no dijo cuál ("esa reunión", "ese recordatorio"), omítelo y se toma la última.',
    input_schema: {
      type: 'object',
      properties: {
        entidad: {
          type: 'string',
          enum: ['citas', 'recordatorios', 'cotizaciones', 'cobros', 'clientes', 'notas'],
        },
        que: {
          type: 'string',
          description: 'Cómo la nombró el usuario: parte del título, el nombre del cliente, o el número. Omítelo si dijo "esa" o "ese".',
        },
        cliente: { ...clienteProp, description: 'Sólo si el usuario nombra un cliente para ubicarla.' },
        titulo: { type: 'string', description: 'Nuevo asunto o título.' },
        detalle: {
          type: 'string',
          description: 'De qué se trata, qué hay que llevar, qué se acordó. Es lo que se agrega cuando dicen "agregale a esa reunión que…". Se suma a lo que ya había, no lo reemplaza, salvo que el usuario pida cambiarlo.',
        },
        fecha_hora: { type: 'string', description: 'Nueva fecha y hora de una cita, YYYY-MM-DDTHH:MM.' },
        lugar: { type: 'string' },
        vence_en: { type: 'string', description: 'Nueva fecha de vencimiento, YYYY-MM-DD.' },
        prioridad: { type: 'string', enum: ['alta', 'normal', 'baja'] },
        texto: { type: 'string', description: 'Nuevo texto de un recordatorio o una nota.' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        direccion: { type: 'string' },
        monto: { type: 'number' },
        estado: { type: 'string' },
      },
      required: ['entidad'],
    },
  },
  {
    name: 'eliminar',
    description: 'Borra un registro de forma definitiva. Úsala sólo si el usuario lo pide explícitamente.',
    input_schema: {
      type: 'object',
      properties: {
        entidad: {
          type: 'string',
          enum: ['clientes', 'citas', 'recordatorios', 'cotizaciones', 'cobros', 'notas', 'abonos', 'productos', 'movimientos_stock', 'cotizacion_items'],
        },
        id: { type: 'integer' },
      },
      required: ['entidad', 'id'],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

const COLUMNAS = {
  clientes: ['nombre', 'empresa', 'telefono', 'email'],
  citas: ['inicio', 'titulo', 'cliente', 'lugar', 'estado'],
  recordatorios: ['vence_en', 'texto', 'cliente', 'prioridad', 'estado'],
  cotizaciones: ['creado_en', 'titulo', 'cliente', 'monto', 'abonado', 'saldo', 'estado'],
  cobros: ['vence_en', 'concepto', 'cliente', 'monto', 'estado'],
  notas: ['creado_en', 'texto', 'cliente'],
  abonos: ['fecha', 'cotizacion', 'cliente', 'monto', 'nota'],
  productos: ['categoria', 'referencia', 'descripcion', 'marca', 'precio_cliente', 'unidad'],
  movimientos_stock: ['creado_en', 'producto', 'cantidad', 'motivo'],
  cotizacion_items: ['seccion', 'referencia', 'descripcion', 'cantidad', 'precio_unitario', 'total'],
};

const vistaDe = (entidad, titulo, filas) => ({
  entidad,
  titulo,
  columnas: COLUMNAS[entidad],
  filas,
});

/** Resuelve el cliente y lanza un error legible si hay ambigüedad. */
function exigirCliente(texto, { crear = false } = {}) {
  const r = db.resolverCliente(texto, { crearSiNoExiste: crear });
  if (r.error) {
    const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
    throw new Error(`${r.error}${sug}`);
  }
  return r;
}

/** Igual que exigirCliente, para la cotización sobre la que se está trabajando. */
function exigirCotizacion(texto, clienteId) {
  // Al armar una cotización todavía puede valer cero, así que no se exige saldo.
  const r = db.resolverCotizacion(texto, clienteId, { soloConSaldo: false });
  if (r.error) {
    const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
    throw new Error(`${r.error}${sug}`);
  }
  return r;
}

/**
 * A qué cotización va lo que se está dictando. Sin cliente ni número, es la
 * que está en curso: así se puede ir recorriendo la casa diciendo "agregá dos
 * interruptores", "ahora tres de tres canales", sin repetir a quién.
 * Nombrar otro cliente cambia la cotización en curso a esa.
 */
function cotizacionEnCurso({ cliente, cotizacion } = {}) {
  if (!cliente && !cotizacion) {
    const activa = db.cotizacionActiva();
    if (activa) return { id: activa.id, cotizacion: activa };
    throw new Error(
      'No hay ninguna cotización en curso. Decime para qué cliente la armo y la empiezo.',
    );
  }

  const clienteId = cliente ? exigirCliente(cliente).id : null;
  const q = exigirCotizacion(cotizacion ?? '', clienteId);
  db.activarCotizacion(q.id); // pasa a ser la que se está armando
  return q;
}

/** Cómo se llama cada cosa cuando se habla de una sola. */
const SINGULAR = {
  citas: 'la cita', recordatorios: 'el recordatorio', cotizaciones: 'la cotización',
  cobros: 'el cobro', clientes: 'el cliente', notas: 'la nota',
};

const truncar = (v, n) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

const tituloDeItems = (cot, tot) =>
  `«${cot.titulo}» · ${dinero(tot.total, cot.moneda)}`;

/**
 * Ejecuta una herramienta.
 * @returns {{resumen: string, vista?: object, cambio?: boolean}}
 */
export function ejecutar(nombre, args) {
  switch (nombre) {
    case 'crear_cliente': {
      const c = db.crearCliente(args);
      return {
        resumen: `Cliente creado. id=${c.id}, nombre=${c.nombre}`,
        vista: vistaDe('clientes', `Cliente creado: ${c.nombre}`, [c]),
        cambio: true,
      };
    }

    case 'agendar_cita': {
      const { id: cliente_id } = exigirCliente(args.cliente, { crear: true });
      const inicio = normalizarFecha(args.fecha_hora);
      if (!inicio) throw new Error('No entendí la fecha de la cita. Pregúntale al usuario el día y la hora.');
      const cita = db.insertar('citas', {
        titulo: args.titulo,
        cliente_id,
        inicio,
        duracion_min: args.duracion_min ?? 60,
        lugar: args.lugar ?? null,
        notas: args.notas ?? null,
      });
      return {
        resumen: `Cita agendada. id=${cita.id}, ${cita.inicio}, ${cita.titulo}${cita.cliente ? `, cliente=${cita.cliente}` : ''}`,
        vista: vistaDe('citas', 'Cita agendada', [cita]),
        cambio: true,
      };
    }

    case 'crear_recordatorio': {
      const { id: cliente_id } = args.cliente
        ? exigirCliente(args.cliente, { crear: true })
        : { id: null };
      const r = db.insertar('recordatorios', {
        texto: args.texto,
        cliente_id,
        vence_en: normalizarFecha(args.fecha_hora),
        prioridad: args.prioridad ?? 'media',
      });
      return {
        resumen: `Recordatorio creado. id=${r.id}, ${r.vence_en ?? 'sin fecha'}, ${r.texto}`,
        vista: vistaDe('recordatorios', 'Recordatorio creado', [r]),
        cambio: true,
      };
    }

    case 'crear_cotizacion': {
      const { id: cliente_id } = exigirCliente(args.cliente, { crear: true });
      const c = db.insertar('cotizaciones', {
        cliente_id,
        titulo: args.titulo,
        descripcion: args.descripcion ?? null,
        monto: args.monto ?? 0,
        moneda: args.moneda ?? 'COP',
        estado: args.estado ?? 'pendiente',
        vence_en: normalizarFecha(args.vence_en),
        porcentaje_servicio: args.porcentaje_servicio ?? 0,
        porcentaje_iva: args.porcentaje_iva ?? 0,
        nivel_precio: args.nivel_precio ?? 'cliente',
      });
      // Recién creada pasa a ser la que se está armando, para poder dictarle
      // renglones sin repetir el cliente en cada frase.
      db.activarCotizacion(c.id);
      return {
        resumen: `Cotización creada y en curso. id=${c.id}, ${c.titulo}, cliente=${c.cliente}. ` +
          'Los renglones que se dicten ahora van a esta cotización.',
        vista: vistaDe('cotizaciones', 'Cotización creada', [c]),
        cambio: true,
      };
    }

    case 'finalizar_cotizacion': {
      const activa = db.cotizacionActiva();
      if (!activa) throw new Error('No hay ninguna cotización en curso.');

      const items = db.consultar('cotizacion_items', { cotizacion_id: activa.id });
      const tot = db.totalesCotizacion(activa.id);
      db.cerrarCotizacionActiva();

      return {
        resumen:
          `Cotización #${activa.id} "${activa.titulo}" cerrada con ${items.length} renglón(es). ` +
          `Subtotal ${dinero(tot.subtotal, activa.moneda)}` +
          (tot.servicio ? `, servicio ${dinero(tot.servicio, activa.moneda)}` : '') +
          (tot.iva ? `, IVA ${dinero(tot.iva, activa.moneda)}` : '') +
          `, total ${dinero(tot.total, activa.moneda)}.`,
        vista: vistaDe('cotizacion_items', tituloDeItems(activa, tot), items),
        cambio: true,
      };
    }

    case 'agregar_item_cotizacion': {
      const q = cotizacionEnCurso(args);

      const datos = {
        cantidad: args.cantidad ?? 1,
        seccion: args.seccion,
        descripcion: args.descripcion,
        precio_unitario: args.precio_unitario,
      };

      if (args.producto) {
        const p = db.resolverProducto(args.producto);
        if (p.error) {
          const sug = p.sugerencias?.length ? ` Opciones: ${p.sugerencias.join(', ')}.` : '';
          throw new Error(`${p.error}${sug}`);
        }
        datos.producto_id = p.id;
      } else if (!args.descripcion) {
        throw new Error('Decime qué producto agregar, o la descripción del renglón si no está en el catálogo.');
      }

      const item = db.agregarItem(q.id, datos);
      const cot = db.obtenerPorId('cotizaciones', q.id);
      const items = db.consultar('cotizacion_items', { cotizacion_id: q.id });
      const tot = db.totalesCotizacion(q.id);

      return {
        resumen:
          `Agregado a la cotización #${cot.id} "${cot.titulo}": ${item.cantidad} x ${item.descripcion.slice(0, 50)} ` +
          `a ${dinero(item.precio_unitario, cot.moneda)}. ` +
          `Subtotal ${dinero(tot.subtotal, cot.moneda)}, total ${dinero(tot.total, cot.moneda)}.`,
        vista: vistaDe('cotizacion_items', tituloDeItems(cot, tot), items),
        cambio: true,
      };
    }

    case 'editar': {
      const clienteId = args.cliente ? exigirCliente(args.cliente).id : null;
      const r = db.resolverRegistro(args.entidad, args.que ?? '', clienteId);
      if (r.error) {
        const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
        throw new Error(`${r.error}${sug}`);
      }

      // "Detalle" es una sola palabra para el usuario, pero cae en un campo
      // distinto en cada cosa: en una cita son sus notas, en un recordatorio
      // es su propio texto, en una cotización su descripción.
      const CAMPO_DETALLE = {
        citas: 'notas', recordatorios: 'texto', cotizaciones: 'descripcion',
        cobros: 'concepto', clientes: 'notas', notas: 'texto',
      };

      const cambios = {};
      const poner = (campo, valor) => { if (valor !== undefined && valor !== null && valor !== '') cambios[campo] = valor; };

      poner('titulo', args.titulo);
      poner('lugar', args.lugar);
      poner('telefono', args.telefono);
      poner('email', args.email);
      poner('direccion', args.direccion);
      poner('prioridad', args.prioridad);
      poner('estado', args.estado);
      poner('texto', args.texto);
      if (args.monto !== undefined) cambios.monto = Number(args.monto);
      if (args.fecha_hora) cambios.inicio = normalizarFecha(args.fecha_hora) ?? args.fecha_hora;
      if (args.vence_en) cambios.vence_en = normalizarFecha(args.vence_en) ?? args.vence_en;

      // El detalle se suma a lo que ya había: "agregale que lleve el catálogo"
      // y después "y unos bombillos" tienen que quedar los dos.
      if (args.detalle) {
        const campo = CAMPO_DETALLE[args.entidad];
        const antes = String(r.fila[campo] ?? '').trim();
        cambios[campo] = antes && !antes.includes(args.detalle.trim())
          ? `${antes}\n${args.detalle.trim()}`
          : args.detalle.trim();
      }

      if (!Object.keys(cambios).length) throw new Error('No dijiste qué cambiarle.');

      const tabla = db.ENTIDADES[args.entidad].tabla;
      const fila = db.actualizar(tabla, r.id, cambios);
      if (args.entidad === 'cotizaciones' && cambios.estado) db.sincronizarInventario(r.id);

      const nombre = fila.titulo ?? fila.texto ?? fila.concepto ?? fila.nombre ?? `#${fila.id}`;
      return {
        resumen: `Listo, actualicé ${SINGULAR[args.entidad] ?? args.entidad} «${truncar(nombre, 60)}».`,
        vista: vistaDe(args.entidad, truncar(nombre, 60), [fila]),
        cambio: true,
      };
    }

    case 'ajustar_item_cotizacion': {
      // Se puede llegar al renglón por su id o —lo normal al dictar— por cómo
      // lo nombró el usuario dentro de la cotización de la que se está
      // hablando. Nadie dice "el ítem 47".
      let item;
      if (args.item_id) {
        item = db.obtenerPorId('cotizacion_items', args.item_id);
        if (!item) throw new Error(`No existe ningún renglón con id ${args.item_id}.`);
      } else {
        const q = cotizacionEnCurso(args);
        const r = db.resolverItemDeCotizacion(q.id, args.producto ?? args.descripcion ?? '');
        if (r.error) {
          const sug = r.sugerencias?.length ? ` Renglones: ${r.sugerencias.join('; ')}.` : '';
          throw new Error(`${r.error}${sug}`);
        }
        item = r.item;
      }

      if (args.eliminar) {
        db.eliminarItem(item.id);
      } else {
        const cambios = {};
        if (args.cantidad !== undefined) cambios.cantidad = Number(args.cantidad);
        if (args.precio_unitario !== undefined) cambios.precio_unitario = Number(args.precio_unitario);
        else if (args.porcentaje !== undefined) {
          cambios.precio_unitario = Math.round(item.precio_unitario * (1 + Number(args.porcentaje) / 100));
        }
        if (!Object.keys(cambios).length) throw new Error('No dijiste qué cambiarle al renglón.');
        db.actualizarItem(item.id, cambios);
      }

      const cot = db.obtenerPorId('cotizaciones', item.cotizacion_id);
      const items = db.consultar('cotizacion_items', { cotizacion_id: item.cotizacion_id });
      const tot = db.totalesCotizacion(item.cotizacion_id);
      return {
        resumen: args.eliminar
          ? `Renglón quitado. La cotización "${cot.titulo}" queda en ${dinero(tot.total, cot.moneda)}.`
          : `Renglón actualizado. La cotización "${cot.titulo}" queda en ${dinero(tot.total, cot.moneda)}.`,
        vista: vistaDe('cotizacion_items', tituloDeItems(cot, tot), items),
        cambio: true,
      };
    }

    case 'ajustar_cotizacion': {
      const q = cotizacionEnCurso(args);

      const cambios = {};
      for (const campo of ['porcentaje_servicio', 'porcentaje_iva']) {
        if (args[campo] !== undefined) cambios[campo] = Number(args[campo]);
      }
      if (args.nivel_precio) cambios.nivel_precio = args.nivel_precio;
      if (!Object.keys(cambios).length) throw new Error('No dijiste qué ajustar de la cotización.');

      db.actualizar('cotizaciones', q.id, cambios);
      db.recalcularCotizacion(q.id);

      const cot = db.obtenerPorId('cotizaciones', q.id);
      const tot = db.totalesCotizacion(q.id);
      return {
        resumen:
          `Cotización "${cot.titulo}": subtotal ${dinero(tot.subtotal, cot.moneda)}` +
          (tot.servicio ? `, servicio ${cot.porcentaje_servicio}% (${dinero(tot.servicio, cot.moneda)})` : '') +
          (tot.iva ? `, IVA ${cot.porcentaje_iva}% (${dinero(tot.iva, cot.moneda)})` : '') +
          `, total ${dinero(tot.total, cot.moneda)}.`,
        vista: vistaDe('cotizaciones', 'Cotización actualizada', [cot]),
        cambio: true,
      };
    }

    case 'registrar_cobro': {
      const { id: cliente_id } = exigirCliente(args.cliente, { crear: true });
      const c = db.insertar('cobros', {
        cliente_id,
        concepto: args.concepto,
        monto: args.monto,
        moneda: args.moneda ?? 'COP',
        vence_en: normalizarFecha(args.vence_en),
      });
      return {
        resumen: `Cobro registrado. id=${c.id}, ${dinero(c.monto, c.moneda)}, cliente=${c.cliente}`,
        vista: vistaDe('cobros', 'Cobro registrado', [c]),
        cambio: true,
      };
    }

    case 'registrar_abono': {
      const { id: cliente_id } = exigirCliente(args.cliente);
      const r = db.resolverCotizacion(args.cotizacion ?? '', cliente_id);
      if (r.error) {
        const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
        throw new Error(`${r.error}${sug}`);
      }
      if (!(Number(args.monto) > 0)) throw new Error('El abono tiene que ser un monto mayor que cero.');

      db.insertar('abonos', {
        cotizacion_id: r.id,
        monto: args.monto,
        fecha: normalizarFecha(args.fecha) ?? db.hoy(),
        nota: args.nota ?? null,
      });

      // Un abono significa que el cliente aceptó: la oferta pasa a aprobada
      // sola, para que aparezca en los cobros sin tener que marcarla aparte.
      db.trasAbono(r.id);

      // Se relee la cotización para informar el saldo ya actualizado.
      const cot = db.obtenerPorId('cotizaciones', r.id);
      const abonos = db.consultar('abonos', { cotizacion_id: r.id });
      return {
        resumen:
          `Abono de ${dinero(args.monto, cot.moneda)} registrado en la cotización #${cot.id} "${cot.titulo}". ` +
          `Abonado ${dinero(cot.abonado, cot.moneda)} de ${dinero(cot.monto, cot.moneda)}, ` +
          (cot.saldo > 0 ? `saldo ${dinero(cot.saldo, cot.moneda)}.` : 'queda saldada.'),
        vista: vistaDe('abonos', `Abonos de "${cot.titulo}" · saldo ${dinero(cot.saldo, cot.moneda)}`, abonos),
        cambio: true,
      };
    }

    case 'crear_producto': {
      let p = db.insertar('productos', {
        categoria: args.categoria ?? null,
        referencia: args.referencia ?? null,
        descripcion: args.descripcion,
        marca: args.marca ?? null,
        unidad: args.unidad ?? 'UND',
        precio_canal: args.precio_canal ?? null,
        precio_constructor: args.precio_constructor ?? null,
        precio_cliente: args.precio_cliente,
        proveedor: args.proveedor ?? null,
        maneja_inventario: args.maneja_inventario ? 1 : 0,
      });
      if (args.maneja_inventario && Number(args.stock_inicial) > 0) {
        db.insertar('movimientos_stock', {
          producto_id: p.id,
          cantidad: Number(args.stock_inicial),
          motivo: 'Inventario inicial',
        });
        p = db.obtenerPorId('productos', p.id);
      }
      return {
        resumen: `Producto agregado al catálogo. id=${p.id}, ${p.descripcion}, ${dinero(p.precio_cliente)}` +
          (args.maneja_inventario ? `, stock=${p.stock}.` : '.'),
        vista: vistaDe('productos', 'Producto agregado', [p]),
        cambio: true,
      };
    }

    case 'ajustar_inventario': {
      const r = db.resolverProducto(args.producto);
      if (r.error) {
        const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
        throw new Error(`${r.error}${sug}`);
      }
      if (!r.producto.maneja_inventario) {
        throw new Error(
          `"${r.producto.descripcion}" no lleva inventario propio (es de un catálogo de proveedor, sólo para cotizar). ` +
          'Si es un producto de Clic Control, marcalo primero como "maneja inventario" desde su ficha.',
        );
      }
      const cantidad = Number(args.cantidad);
      if (!cantidad) throw new Error('La cantidad tiene que ser distinta de cero.');

      db.insertar('movimientos_stock', {
        producto_id: r.id,
        cantidad,
        motivo: args.motivo ?? null,
      });
      const actualizado = db.obtenerPorId('productos', r.id);
      return {
        resumen: `${cantidad > 0 ? 'Entrada' : 'Salida'} de ${Math.abs(cantidad)} en "${actualizado.descripcion}". Stock actual: ${actualizado.stock}.`,
        vista: vistaDe('productos', `Inventario actualizado · ${actualizado.descripcion}`, [actualizado]),
        cambio: true,
      };
    }

    case 'agregar_nota': {
      const { id: cliente_id } = exigirCliente(args.cliente, { crear: true });
      const n = db.insertar('notas', { cliente_id, texto: args.texto });
      return {
        resumen: `Nota guardada para ${n.cliente}.`,
        vista: vistaDe('notas', `Nota de ${n.cliente}`, [n]),
        cambio: true,
      };
    }

    case 'consultar': {
      const filtros = {
        estado: args.estado,
        rango: args.rango,
        desde: args.desde,
        hasta: args.hasta,
        texto: args.texto,
      };
      if (args.cliente) {
        const r = db.resolverCliente(args.cliente);
        if (r.error) {
          return { resumen: r.error, vista: vistaDe('clientes', 'Sin coincidencias', []) };
        }
        filtros.cliente_id = r.id;
      }
      if (args.producto) {
        const r = db.resolverProducto(args.producto);
        if (r.error) {
          const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
          return { resumen: `${r.error}${sug}`, vista: vistaDe('productos', 'Sin coincidencias', []) };
        }
        filtros.producto_id = r.id;
      }
      if (args.cotizacion || args.entidad === 'cotizacion_items') {
        const r = db.resolverCotizacion(args.cotizacion ?? '', filtros.cliente_id ?? null, { soloConSaldo: false });
        if (r.error) {
          const sug = r.sugerencias?.length ? ` Opciones: ${r.sugerencias.join(', ')}.` : '';
          return { resumen: `${r.error}${sug}`, vista: vistaDe('cotizaciones', 'Sin coincidencias', []) };
        }
        filtros.cotizacion_id = r.id;
      }
      const filas = db.consultar(args.entidad, filtros);

      // Sólo un resumen numérico + las 5 primeras filas abreviadas viajan al
      // modelo. El resto se renderiza en el dashboard sin costo de tokens.
      const muestra = filas.slice(0, 5).map((f) => resumirFila(args.entidad, f)).join(' | ');
      const suma = (campo) => filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0);
      const total =
        args.entidad === 'cobros' || args.entidad === 'abonos'
          ? ` Total: ${dinero(suma('monto'))}.`
          : args.entidad === 'cotizaciones'
            ? ` Cotizado ${dinero(suma('monto'))}, abonado ${dinero(suma('abonado'))}, saldo ${dinero(suma('saldo'))}.`
            : '';
      return {
        resumen: `${filas.length} resultado(s).${total}${muestra ? ` Muestra: ${muestra}` : ''}`,
        vista: vistaDe(args.entidad, tituloConsulta(args, filas.length), filas),
      };
    }

    case 'actualizar_estado': {
      const fila = db.actualizar(args.entidad, args.id, { estado: args.estado });
      if (!fila) throw new Error(`No existe ${args.entidad} con id ${args.id}.`);

      // Aprobar una cotización saca sus productos propios de la bodega.
      let detalleStock = '';
      if (args.entidad === 'cotizaciones') {
        const { descontados } = db.sincronizarInventario(args.id);
        if (descontados.length) {
          detalleStock = ' Descontado del inventario: ' +
            descontados.map((d) => `${d.cantidad} de ${d.descripcion.slice(0, 40)} (quedan ${d.stock})`).join('; ') + '.';
        }
      }
      return {
        resumen: `${args.entidad} id=${args.id} ahora está en estado "${args.estado}".${detalleStock}`,
        vista: vistaDe(args.entidad, 'Registro actualizado', [fila]),
        cambio: true,
      };
    }

    case 'eliminar': {
      // Un renglón se borra por su propia vía, que además recalcula el total
      // de la cotización a la que pertenecía.
      const ok = args.entidad === 'cotizacion_items'
        ? db.eliminarItem(args.id)
        : db.eliminar(args.entidad, args.id);
      if (!ok) throw new Error(`No existe ${args.entidad} con id ${args.id}.`);
      return { resumen: `Registro eliminado de ${args.entidad}.`, cambio: true };
    }

    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}

function resumirFila(entidad, f) {
  switch (entidad) {
    case 'clientes':
      return `#${f.id} ${f.nombre}${f.telefono ? ` (${f.telefono})` : ''}`;
    case 'citas':
      return `#${f.id} ${f.inicio} ${f.titulo}`;
    case 'recordatorios':
      return `#${f.id} ${f.vence_en ?? 's/f'} ${f.texto}`;
    case 'cotizaciones':
      return `#${f.id} ${f.titulo} ${dinero(f.monto, f.moneda)}` +
        (f.saldo !== undefined ? ` (saldo ${dinero(f.saldo, f.moneda)})` : '');
    case 'abonos':
      return `#${f.id} ${f.fecha ?? ''} ${dinero(f.monto, f.moneda)} sobre "${f.cotizacion ?? ''}"`;
    case 'cobros':
      return `#${f.id} ${f.cliente ?? ''} ${dinero(f.monto, f.moneda)}`;
    case 'productos': {
      const desc = String(f.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 70);
      const stock = f.maneja_inventario ? `, stock=${f.stock}` : '';
      return `#${f.id} ${f.referencia ? `${f.referencia} ` : ''}${desc} ${dinero(f.precio_cliente)}${stock}`;
    }
    case 'movimientos_stock':
      return `#${f.id} ${f.cantidad > 0 ? '+' : ''}${f.cantidad} en "${f.producto ?? ''}"${f.motivo ? ` (${f.motivo})` : ''}`;
    case 'cotizacion_items': {
      const desc = String(f.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
      return `#${f.id} ${f.cantidad} x ${desc} a ${dinero(f.precio_unitario)} = ${dinero(f.total)}`;
    }
    default:
      return `#${f.id} ${f.texto ?? ''}`;
  }
}

const PLURAL_ESTADO = {
  pendiente: 'pendientes', completada: 'completadas', cancelada: 'canceladas',
  enviada: 'enviadas', aprobada: 'aprobadas', rechazada: 'rechazadas',
  pagado: 'pagados', vencido: 'vencidos',
};

function tituloConsulta(args, n) {
  const partes = [args.entidad[0].toUpperCase() + args.entidad.slice(1)];
  if (args.estado) partes.push(PLURAL_ESTADO[args.estado] || args.estado);
  if (args.rango) partes.push({ hoy: 'de hoy', semana: 'de esta semana', mes: 'de este mes', vencidos: 'vencidos', proximos: 'próximos' }[args.rango]);
  if (args.cliente) partes.push(`de ${args.cliente}`);
  if (args.texto) partes.push(`"${args.texto}"`);
  return `${partes.join(' ')} · ${n}`;
}
