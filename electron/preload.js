'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServer: (server) => ipcRenderer.invoke('servers:save', server),
  deleteServer: (id) => ipcRenderer.invoke('servers:delete', id),
  ping: (id) => ipcRenderer.invoke('server:ping', id),
  telemetry: (id) => ipcRenderer.invoke('server:telemetry', id),
  processes: (id) => ipcRenderer.invoke('server:processes', id),
  killProcess: (id, pid) => ipcRenderer.invoke('server:kill', id, pid),
  smartBoost: (id) => ipcRenderer.invoke('action:smartBoost', id),
  networkReset: (id) => ipcRenderer.invoke('action:networkReset', id),
  diskCleanup: (id) => ipcRenderer.invoke('action:diskCleanup', id),
  power: (id, mode) => ipcRenderer.invoke('action:power', id, mode),
  onBoostProgress: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('boost:progress', listener);
    return () => ipcRenderer.removeListener('boost:progress', listener);
  },
});
