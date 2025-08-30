const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAPI', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
})

