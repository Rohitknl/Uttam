const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),
});

window.addEventListener('DOMContentLoaded', () => {
  document.title = 'Uttam Laboratory';
});
