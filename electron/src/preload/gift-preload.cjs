const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('giftAPI', {
  rendererReady: () => ipcRenderer.send('gift:renderer-ready'),
  tapped: () => ipcRenderer.send('gift:tapped'),
  onPresentation: (callback) => ipcRenderer.on('gift:presentation', (_event, value) => callback(value))
});
