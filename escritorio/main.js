/* ══════════════════════════════════════════════════════════════════
   Sintetizador de Prompts — proceso principal (Electron)
   ══════════════════════════════════════════════════════════════════

   La ventana no tiene permiso para salir a internet: todo el trabajo
   pasa dentro del Mac. Este archivo sólo abre la ventana, arma el menú
   y atiende los tres favores que la interfaz no puede hacer sola
   (abrir un archivo, guardarlo y copiar al portapapeles).
   ══════════════════════════════════════════════════════════════════ */

import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
let ventana = null;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    title: 'Sintetizador de Prompts',
    titleBarStyle: 'hiddenInset',   // el look de las apps de Mac
    backgroundColor: '#12141a',
    show: false,
    webPreferences: {
      preload: join(AQUI, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  ventana.once('ready-to-show', () => ventana.show());
  // Se carga la versión de un solo archivo (la que arma `npm run construir`):
  // desde file:// los módulos sueltos no se pueden importar.
  ventana.loadFile(join(AQUI, 'dist', 'sintetizador-de-prompts.html'));

  // Nada de navegar fuera ni abrir ventanas: esta app no sale a la red.
  ventana.webContents.on('will-navigate', (evento) => evento.preventDefault());
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** Avisa a la interfaz que se eligió algo del menú. */
const desdeElMenu = (orden) => ventana?.webContents.send('menu', orden);

function armarMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'Acerca de' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar' },
        { role: 'hideOthers', label: 'Ocultar otras' },
        { role: 'unhide', label: 'Mostrar todas' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir texto…', accelerator: 'Cmd+O', click: () => desdeElMenu('abrir') },
        { label: 'Guardar prompt…', accelerator: 'Cmd+S', click: () => desdeElMenu('guardar') },
        { type: 'separator' },
        { label: 'Guardar en la biblioteca', accelerator: 'Cmd+D', click: () => desdeElMenu('biblioteca') },
        { label: 'Empezar de cero', accelerator: 'Cmd+N', click: () => desdeElMenu('limpiar') },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
        { type: 'separator' },
        { label: 'Copiar el prompt', accelerator: 'Cmd+Shift+C', click: () => desdeElMenu('copiar') },
        {
          label: 'Dictar (dictado del sistema)',
          accelerator: 'Cmd+Shift+D',
          click: () => desdeElMenu('dictar'),
        },
      ],
    },
    {
      label: 'Prompt',
      submenu: [
        { label: 'Sintetizar', accelerator: 'Cmd+Return', click: () => desdeElMenu('sintetizar') },
        { type: 'separator' },
        { label: 'Nivel esencial', accelerator: 'Cmd+1', click: () => desdeElMenu('nivel:esencial') },
        { label: 'Nivel equilibrado', accelerator: 'Cmd+2', click: () => desdeElMenu('nivel:equilibrado') },
        { label: 'Nivel detallado', accelerator: 'Cmd+3', click: () => desdeElMenu('nivel:detallado') },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño normal' },
        { role: 'zoomIn', label: 'Agrandar' },
        { role: 'zoomOut', label: 'Achicar' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

/* ─────────── Favores que pide la interfaz ─────────── */

ipcMain.handle('abrir-texto', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: 'Abrir un texto para sintetizar',
    filters: [{ name: 'Texto', extensions: ['txt', 'md', 'markdown', 'rtf', 'text'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  return { nombre: filePaths[0].split('/').pop(), contenido: await readFile(filePaths[0], 'utf8') };
});

ipcMain.handle('guardar-texto', async (_evento, { nombre, contenido }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
    title: 'Guardar el prompt',
    defaultPath: nombre,
    filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Texto', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return false;
  await writeFile(filePath, contenido, 'utf8');
  return true;
});

ipcMain.handle('copiar', (_evento, texto) => {
  clipboard.writeText(String(texto ?? ''));
  return true;
});

/* ─────────── Arranque ─────────── */

app.whenReady().then(() => {
  armarMenu();
  crearVentana();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
