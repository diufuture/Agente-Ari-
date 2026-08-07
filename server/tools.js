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
      'Registra una cotización para un cliente. Úsala para "hazle una cotización a", "cotización de".',
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
      },
      required: ['cliente', 'titulo'],
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
          enum: ['clientes', 'citas', 'recordatorios', 'cotizaciones', 'cobros', 'notas', 'abonos', 'productos', 'movimientos_stock'],
        },
        cliente: clienteProp,
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
    name: 'eliminar',
    description: 'Borra un registro de forma definitiva. Úsala sólo si el usuario lo pide explícitamente.',
    input_schema: {
      type: 'object',
      properties: {
        entidad: {
          type: 'string',
          enum: ['clientes', 'citas', 'recordatorios', 'cotizaciones', 'cobros', 'notas', 'abonos', 'productos', 'movimientos_stock'],
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
      });
      return {
        resumen: `Cotización creada. id=${c.id}, ${c.titulo}, ${dinero(c.monto, c.moneda)}, cliente=${c.cliente}. Saldo ${dinero(c.saldo ?? c.monto, c.moneda)}.`,
        vista: vistaDe('cotizaciones', 'Cotización creada', [c]),
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
      return {
        resumen: `${args.entidad} id=${args.id} ahora está en estado "${args.estado}".`,
        vista: vistaDe(args.entidad, 'Registro actualizado', [fila]),
        cambio: true,
      };
    }

    case 'eliminar': {
      const ok = db.eliminar(args.entidad, args.id);
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
