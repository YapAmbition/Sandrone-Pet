const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  ready: () => ipcRenderer.invoke('pet:ready'),
  rendererReady: () => ipcRenderer.send('pet:renderer-ready'),
  moveTo: (x, y) => ipcRenderer.send('pet:move-to', { x, y }),
  record: (metric) => ipcRenderer.send('stats:record', metric),
  showSpeech: (text, duration) => ipcRenderer.send('speech:show', { text, duration }),
  hideSpeech: () => ipcRenderer.send('speech:hide'),
  showContextMenu: () => ipcRenderer.send('menu:context'),
  savePosition: () => ipcRenderer.send('pet:save-position'),
  publishState: (state) => ipcRenderer.send('pet:state', state),
  onEnvironment: (callback) => ipcRenderer.on('pet:environment', (_event, value) => callback(value)),
  onMoveResult: (callback) => ipcRenderer.on('pet:move-result', (_event, value) => callback(value)),
  onCommand: (callback) => ipcRenderer.on('pet:command', (_event, value) => callback(value))
});
