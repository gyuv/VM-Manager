'use strict';
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const Store = require('electron-store');
const { runPowerShell, parseJson, tcpPing, SCRIPTS } = require('./remote');

const store = new Store({ name: 'servers', defaults: { servers: [] } });

// Passwords are encrypted with the macOS Keychain-backed safeStorage key before hitting disk.
function encrypt(plain) {
  if (!plain) return '';
  return safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(plain).toString('base64')
    : 'raw:' + Buffer.from(plain, 'utf8').toString('base64');
}
function decrypt(stored) {
  if (!stored) return '';
  const [kind, data] = [stored.slice(0, 4), stored.slice(4)];
  if (kind === 'enc:') return safeStorage.decryptString(Buffer.from(data, 'base64'));
  return Buffer.from(data, 'base64').toString('utf8');
}

const getRaw = () => store.get('servers');
const publicView = (s) => ({ id: s.id, name: s.name, host: s.host, port: s.port, username: s.username, hasPassword: !!s.password });

function getServer(id) {
  const s = getRaw().find((x) => x.id === id);
  if (!s) throw new Error('Unknown server');
  return { ...s, password: decrypt(s.password) };
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

handle('servers:list', () => getRaw().map(publicView));

handle('servers:save', (_e, input) => {
  const host = String(input.host || '').trim();
  if (!host || !/^[A-Za-z0-9.\-:\[\]]+$/.test(host)) throw new Error('Invalid host / IP');
  const servers = getRaw();
  const existing = servers.find((s) => s.id === input.id);
  const record = {
    id: existing ? existing.id : crypto.randomUUID(),
    name: String(input.name || host).trim(),
    host,
    port: Number(input.port) || 5985,
    username: String(input.username || '').trim(),
    // Blank password on edit keeps the stored one.
    password: input.password ? encrypt(input.password) : existing ? existing.password : '',
  };
  store.set('servers', existing ? servers.map((s) => (s.id === record.id ? record : s)) : [...servers, record]);
  return publicView(record);
});

handle('servers:delete', (_e, id) => {
  store.set('servers', getRaw().filter((s) => s.id !== id));
  return true;
});

handle('server:ping', (_e, id) => {
  const s = getRaw().find((x) => x.id === id);
  if (!s) throw new Error('Unknown server');
  return tcpPing(s.host, s.port);
});

handle('server:telemetry', async (_e, id) => parseJson(await runPowerShell(getServer(id), SCRIPTS.telemetry)));

handle('server:processes', async (_e, id) => {
  const data = parseJson(await runPowerShell(getServer(id), SCRIPTS.processes));
  return Array.isArray(data) ? data : [data];
});

handle('server:kill', async (_e, id, pid) => {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 4) throw new Error('Invalid or protected PID');
  return runPowerShell(getServer(id), SCRIPTS.kill(n));
});

handle('action:smartBoost', async (e, id) => {
  const server = getServer(id);
  const results = [];
  const total = SCRIPTS.boostSteps.length;
  for (let i = 0; i < total; i++) {
    const step = SCRIPTS.boostSteps[i];
    e.sender.send('boost:progress', { serverId: id, step: i, total, id: step.id, label: step.label, status: 'running' });
    try {
      const out = await runPowerShell(server, step.script, 120000);
      results.push({ id: step.id, ok: true, output: out.trim() });
      e.sender.send('boost:progress', { serverId: id, step: i, total, id: step.id, label: step.label, status: 'done' });
    } catch (err) {
      results.push({ id: step.id, ok: false, output: err.message });
      e.sender.send('boost:progress', { serverId: id, step: i, total, id: step.id, label: step.label, status: 'error', error: err.message });
    }
  }
  return results;
});

handle('action:networkReset', async (_e, id) => runPowerShell(getServer(id), SCRIPTS.networkReset, 60000));
handle('action:diskCleanup', async (_e, id) => runPowerShell(getServer(id), SCRIPTS.diskCleanup, 600000));
handle('action:power', async (_e, id, mode) => {
  if (mode !== 'reboot' && mode !== 'shutdown') throw new Error('Invalid power action');
  return runPowerShell(getServer(id), SCRIPTS[mode]);
});

function createWindow() {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'WinRemoteOps',
    backgroundColor: isMac ? '#00000000' : '#0b1020',
    transparent: isMac,
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: 'active',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
