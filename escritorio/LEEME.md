# Sintetizador de Prompts 🧠

App de escritorio para Mac que agarra un dictado largo —hablado de corrido,
con vueltas, muletillas y repeticiones— y lo deja hecho **un prompt corto,
ordenado y listo para pegar en un proyecto de Claude**.

```
7.021 palabras dictadas  →  139 palabras de prompt
−98 % más corto  ·  ~10.800 tokens menos en cada consulta
```

**No sale a internet, no llama a ninguna IA y no gasta un solo token.**
Todo el análisis es texto puro corriendo dentro de tu Mac. Funciona sin
señal, en un avión, con la clave de la API vencida: da igual.

---

## Arranque rápido

### Opción 1 — sin instalar nada (30 segundos)

Doble clic en **`dist/sintetizador-de-prompts.html`**. Se abre en Safari o
Chrome y funciona completo: síntesis, biblioteca, exportar. Es un solo
archivo, se puede copiar a donde sea.

### Opción 2 — la app de verdad, en el Dock

```bash
cd escritorio
npm install          # baja Electron, una sola vez
npm start            # la abre
```

Y para tener el `.app` y el `.dmg` instalables:

```bash
npm run dist         # queda en escritorio/entregas/
```

> Al abrirla la primera vez macOS avisa que viene de un desarrollador sin
> identificar, porque no está firmada con una cuenta de Apple. Clic derecho
> sobre la app → **Abrir** → **Abrir**. Una sola vez y listo.

---

## Cómo se usa

1. **Hablá.** Poné el cursor en la caja de la izquierda y tocá **dos veces la
   tecla Fn**: se activa el dictado del Mac. Hablá todo lo que quieras, sin
   pensar en ordenarlo. También podés pegar un correo, una transcripción de
   reunión o arrastrar un `.txt` encima.
2. **Mirá la derecha.** El prompt se rehace solo, a cada palabra.
3. **Copiá** (`⌘⇧C`) y pegalo en tu proyecto.

### Los tres niveles

| Nivel | Para qué | Tope |
|---|---|---|
| **Detallado** | Cuando cada matiz importa | 22 viñetas |
| **Equilibrado** | El de todos los días | 12 viñetas |
| **Esencial** | Lo mínimo que hay que decir | 8 viñetas |

### Las cinco plantillas

- **Estructurado** — secciones en Markdown. El de siempre.
- **Claude / XML** — etiquetas `<objetivo>`, `<contexto>`…: es lo que mejor
  sigue Claude dentro de un proyecto.
- **Instrucciones** — redactado para pegar en las instrucciones del proyecto.
- **Brief** — resumen de encargo, para pasárselo a una persona.
- **Esencia** — diez líneas y punto.

### Atajos

| | |
|---|---|
| `⌘↩` | Sintetizar ya |
| `⌘⇧C` | Copiar el prompt |
| `⌘D` | Guardar en la biblioteca |
| `⌘S` | Exportar a `.md` |
| `⌘O` | Abrir un archivo |
| `⌘K` | Buscar en la biblioteca |
| `⌘1` `⌘2` `⌘3` | Esencial / Equilibrado / Detallado |
| `⌘N` | Empezar de cero |

---

## Qué hace por dentro

Ningún modelo de lenguaje: siete pasos de análisis de texto.

1. **Limpia el dictado.** Tartamudeos (*«me me me»* → *«me»*), muletillas
   (*«o sea»*, *«digamos»*, *«¿me entiendes?»*) y coletillas.
2. **Parte en frases**, aunque vengas hablando de corrido sin puntuación:
   ahí corta por los conectores del habla (*«además»*, *«entonces»*, *«pero»*).
3. **Clasifica cada frase** en su sección —objetivo, contexto, requisitos,
   restricciones, formato, audiencia, ejemplos, criterios de éxito— según
   cómo la dijiste. *«Nunca uses…»* es una restricción; *«tiene que
   incluir…»* es un requisito.
4. **Rescata los datos duros**: cifras, plazos, fechas, enlaces, correos.
   Eso nunca se recorta, aunque el resto se apriete.
5. **Comprime cada frase** y **tira las repetidas**: si dijiste tres veces lo
   del soporte, en el prompt aparece una.
6. **Ordena por importancia** y se queda con las mejores, hasta el tope del
   nivel elegido.
7. **Te pregunta lo que falta.** Si no dijiste en qué formato lo querés, o
   para quién es, o cómo vas a saber que quedó bien, te lo avisa abajo.

---

## La biblioteca

Cada prompt guardado (`⌘D`) queda en tu Mac, en el almacenamiento local de la
app. Se busca, se reabre con su texto original y su configuración, y se
exporta entero a `.json` para pasarlo a otro equipo (**Exportar todo** /
**Importar**).

---

## Desde la terminal

El mismo motor, sin ventana:

```bash
node bin/sintetizar.mjs reunion.txt
pbpaste | node bin/sintetizar.mjs --nivel esencial --plantilla claude
node bin/sintetizar.mjs dictado.md > prompt.md
```

---

## Ajustarlo a tu forma de hablar

Todo el criterio vive en listas de palabras al principio de
[`src/motor.js`](src/motor.js), en castellano y a la vista:

- `PISTAS` — qué frases mandan a cada sección. Si en tu rubro *«cotización»*
  siempre es un entregable, agregá la palabra a `formato`.
- `MULETILLAS` y `MULETILLAS_SUELTAS` — las que se borran siempre y las que
  sólo se borran cuando van sueltas entre pausas.
- `RELLENO_INICIAL` — los arranques de frase que no dicen nada.
- `NIVELES` — cuántas viñetas y de qué largo en cada nivel.

Tocás la lista, corrés `npm run construir` y ya.

---

## Pruebas

```bash
npm test
```

18 pruebas sobre el motor: limpieza, corte de frases, clasificación,
compresión, rescate de datos, topes por nivel, las cinco plantillas y las
entradas absurdas (vacío, `null`, tres letras).

---

## Estructura

```
escritorio/
├── main.js                  ventana de Electron, menú y diálogos del sistema
├── preload.cjs              el único puente con el sistema (abrir, guardar, copiar)
├── src/
│   ├── motor.js             el análisis. No depende de nada ni de nadie
│   ├── index.html           la interfaz
│   ├── estilos.css          apariencia, sigue el tema claro/oscuro del Mac
│   └── app.js               lo que hace la ventana
├── bin/sintetizar.mjs       el mismo motor desde la terminal
├── build/empaquetar.mjs     junta todo en un HTML de un solo archivo
├── dist/                    ese archivo, listo para doble clic
└── test/motor.test.js       las pruebas
```
