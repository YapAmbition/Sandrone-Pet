const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('statsAPI', {
  snapshot: () => ipcRenderer.invoke('stats:snapshot'),
  reset: () => ipcRenderer.invoke('stats:reset'),
  onChanged: (callback) => ipcRenderer.on('stats:changed', () => callback())
});
