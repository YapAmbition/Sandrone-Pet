const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('speechAPI', {
  onText: (callback) => ipcRenderer.on('speech:text', (_event, text) => callback(text))
});
