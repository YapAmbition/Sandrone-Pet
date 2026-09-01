const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('statsAPI', {
  rendererReady: () => ipcRenderer.send('stats:renderer-ready'),
  snapshot: () => ipcRenderer.invoke('stats:snapshot'),
  reset: () => ipcRenderer.invoke('stats:reset'),
  giveGift: (identifier) => ipcRenderer.invoke('stats:give-gift', identifier),
  markGiftsSeen: () => ipcRenderer.send('stats:mark-gifts-seen'),
  onChanged: (callback) => ipcRenderer.on('stats:changed', () => callback())
});
