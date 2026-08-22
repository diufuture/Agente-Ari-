/* Puente entre la ventana y el sistema. Expone tres cosas y nada más:
   abrir un archivo, guardar uno y copiar al portapapeles. La interfaz
   no ve Node ni el sistema de archivos. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ari', {
  abrirTexto:   () => ipcRenderer.invoke('abrir-texto'),
  guardarTexto: (nombre, contenido) => ipcRenderer.invoke('guardar-texto', { nombre, contenido }),
  copiar:       (texto) => ipcRenderer.invoke('copiar', texto),
  alMenu:       (atender) => ipcRenderer.on('menu', (_e, orden) => atender(orden)),
});
