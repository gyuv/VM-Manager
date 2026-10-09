'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServer: (server) => ipcRenderer.invoke('servers:save', server),
  deleteServer: (id) => ipcRenderer.invoke('servers:delete', id),
  detectProtocol: (server) => ipcRenderer.invoke('server:detect', server),
  testConnection: (server) => ipcRenderer.invoke('server:test', server),
  ping: (id) => ipcRenderer.invoke('server:ping', id),
  telemetry: (id) => ipcRenderer.invoke('server:telemetry', id),
  processes: (id) => ipcRenderer.invoke('server:processes', id),
  killProcess: (id, pid) => ipcRenderer.invoke('server:kill', id, pid),
  smartBoost: (id) => ipcRenderer.invoke('action:smartBoost', id),
  networkReset: (id) => ipcRenderer.invoke('action:networkReset', id),
  diskCleanup: (id) => ipcRenderer.invoke('action:diskCleanup', id),
  power: (id, mode) => ipcRenderer.invoke('action:power', id, mode),
  appInfo: () => ipcRenderer.invoke('app:info'),
  updater: {
    state: () => ipcRenderer.invoke('updater:state'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    cancel: () => ipcRenderer.invoke('updater:cancel'),
    install: () => ipcRenderer.invoke('updater:install'),
    getSettings: () => ipcRenderer.invoke('updater:getSettings'),
    setSettings: (patch) => ipcRenderer.invoke('updater:setSettings', patch),
    onState: (cb) => {
      const l = (_e, s) => cb(s);
      ipcRenderer.on('updater:state', l);
      return () => ipcRenderer.removeListener('updater:state', l);
    },
    onOpenRequest: (cb) => {
      const l = () => cb();
      ipcRenderer.on('ui:openUpdates', l);
      return () => ipcRenderer.removeListener('ui:openUpdates', l);
    },
  },
  onBoostProgress: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('boost:progress', listener);
    return () => ipcRenderer.removeListener('boost:progress', listener);
  },
});
