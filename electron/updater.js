'use strict';
// Self-contained auto-updater backed by GitHub Releases.
// Squirrel.Mac (electron-updater) refuses ad-hoc-signed apps, so we do it ourselves:
// check -> download portable ZIP -> verify sha512 from latest-mac.yml -> swap .app bundle -> relaunch.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { app } = require('electron');

const REPO = 'gyuv/VM-Manager';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

// Minimal parser for electron-builder's latest-mac.yml "files" list.
function parseShaMap(yml) {
  const map = {};
  const re = /-\s*url:\s*(\S+)\s*\n\s*sha512:\s*(\S+)/g;
  let m;
  while ((m = re.exec(yml))) map[m[1]] = m[2];
  return map;
}

class Updater {
  constructor(store) {
    this.store = store;
    this.win = null;
    this.timer = null;
    this.abort = null;
    this.state = { status: 'idle', currentVersion: app.getVersion() };
  }

  attach(win) {
    this.win = win;
  }

  get settings() {
    return { autoCheck: true, autoDownload: true, ...this.store.get('updater', {}) };
  }

  setSettings(patch) {
    this.store.set('updater', { ...this.settings, ...patch });
    this.schedule();
    return this.settings;
  }

  set(patch) {
    this.state = { ...this.state, ...patch, currentVersion: app.getVersion() };
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('updater:state', this.state);
  }

  schedule() {
    clearInterval(this.timer);
    if (!this.settings.autoCheck) return;
    this.timer = setInterval(() => this.check({ silent: true }), CHECK_INTERVAL_MS);
  }

  start() {
    this.schedule();
    if (this.settings.autoCheck) setTimeout(() => this.check({ silent: true }), 5000);
  }

  pickAsset(assets, version) {
    const names = ['universal', process.arch].map((a) => `WinRemoteOps-${version}-${a}-portable.zip`);
    for (const n of names) {
      const a = assets.find((x) => x.name === n);
      if (a) return a;
    }
    return assets.find((x) => /-portable\.zip$/.test(x.name));
  }

  async check({ silent = false } = {}) {
    if (['checking', 'downloading', 'installing'].includes(this.state.status)) return this.state;
    if (this.state.status === 'ready') return this.state;
    this.set({ status: 'checking', error: undefined, silent });
    try {
      const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WinRemoteOps' } });
      if (res.status === 404) throw new Error('No published release found (or the repository is private).');
      if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit reached or access blocked — try again later.');
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
      const rel = await res.json();
      const latest = String(rel.tag_name || '').replace(/^v/, '');
      const checkedAt = Date.now();
      if (!latest || cmpVersion(latest, app.getVersion()) <= 0) {
        this.set({ status: 'up-to-date', latestVersion: latest, checkedAt });
        return this.state;
      }
      const asset = this.pickAsset(rel.assets || [], latest);
      if (!asset) throw new Error(`Release v${latest} has no macOS portable ZIP.`);
      const yml = (rel.assets || []).find((a) => a.name === 'latest-mac.yml');
      this.release = { version: latest, asset, ymlUrl: yml && yml.browser_download_url };
      this.set({
        status: 'available',
        latestVersion: latest,
        releaseName: rel.name,
        releaseNotes: rel.body || '',
        releaseUrl: rel.html_url,
        publishedAt: rel.published_at,
        size: asset.size,
        checkedAt,
      });
      if (this.settings.autoDownload) this.download();
      return this.state;
    } catch (err) {
      this.set({ status: 'error', error: err.message, checkedAt: Date.now() });
      return this.state;
    }
  }

  async download() {
    if (!this.release || this.state.status === 'downloading') return this.state;
    const { asset, version, ymlUrl } = this.release;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winremoteops-update-'));
    const file = path.join(dir, asset.name);
    this.abort = new AbortController();
    this.set({ status: 'downloading', progress: { percent: 0, transferred: 0, total: asset.size, bytesPerSecond: 0 } });
    try {
      const res = await fetch(asset.browser_download_url, { signal: this.abort.signal, headers: { 'User-Agent': 'WinRemoteOps' } });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const total = Number(res.headers.get('content-length')) || asset.size;
      const hash = crypto.createHash('sha512');
      const out = fs.createWriteStream(file);
      const started = Date.now();
      let transferred = 0;
      let lastEmit = 0;
      for await (const chunk of res.body) {
        const buf = Buffer.from(chunk);
        hash.update(buf);
        transferred += buf.length;
        if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
        const now = Date.now();
        if (now - lastEmit > 150) {
          lastEmit = now;
          const secs = Math.max((now - started) / 1000, 0.001);
          this.set({ progress: { percent: (transferred / total) * 100, transferred, total, bytesPerSecond: transferred / secs } });
        }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));

      if (ymlUrl) {
        const yml = await (await fetch(ymlUrl, { headers: { 'User-Agent': 'WinRemoteOps' } })).text();
        const expected = parseShaMap(yml)[asset.name];
        const actual = hash.digest('base64');
        if (expected && expected !== actual) throw new Error('Checksum mismatch — download discarded.');
        this.verified = !!expected;
      }
      this.downloaded = { file, dir, version };
      this.set({ status: 'ready', verified: !!this.verified, progress: { percent: 100, transferred, total, bytesPerSecond: 0 } });
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true });
      this.set({ status: err.name === 'AbortError' ? 'available' : 'error', error: err.name === 'AbortError' ? undefined : err.message, progress: undefined });
    } finally {
      this.abort = null;
    }
    return this.state;
  }

  cancel() {
    if (this.abort) this.abort.abort();
  }

  appBundlePath() {
    // .../WinRemoteOps.app/Contents/MacOS/WinRemoteOps -> .../WinRemoteOps.app
    return path.resolve(path.dirname(process.execPath), '..', '..');
  }

  install() {
    if (!this.downloaded) throw new Error('No update downloaded');
    if (process.platform !== 'darwin' || !app.isPackaged) throw new Error('In-place install only works in the packaged macOS app.');
    const bundle = this.appBundlePath();
    if (bundle.startsWith('/Volumes/')) throw new Error('Move WinRemoteOps to Applications before updating (running from the DMG).');
    try {
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    } catch {
      throw new Error(`No write permission to ${path.dirname(bundle)}.`);
    }

    this.set({ status: 'installing' });
    const { file, dir } = this.downloaded;
    const script = path.join(dir, 'install.sh');
    fs.writeFileSync(
      script,
      `#!/bin/bash
set -e
PID=${process.pid}
APP=${JSON.stringify(bundle)}
ZIP=${JSON.stringify(file)}
STAGE=${JSON.stringify(path.join(dir, 'stage'))}
LOG=${JSON.stringify(path.join(dir, 'install.log'))}
exec >"$LOG" 2>&1
while kill -0 $PID 2>/dev/null; do sleep 0.2; done
rm -rf "$STAGE"; mkdir -p "$STAGE"
/usr/bin/ditto -x -k "$ZIP" "$STAGE"
NEW=$(find "$STAGE" -maxdepth 1 -name "*.app" | head -n 1)
[ -d "$NEW" ] || { echo "no app in zip"; open "$APP"; exit 1; }
/usr/bin/xattr -dr com.apple.quarantine "$NEW" || true
mv "$APP" "$APP.old-update"
if mv "$NEW" "$APP"; then rm -rf "$APP.old-update"; else mv "$APP.old-update" "$APP"; fi
/usr/bin/open "$APP"
rm -rf "$STAGE" "$ZIP"
`,
      { mode: 0o755 },
    );
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.exit(0), 300);
  }
}

module.exports = { Updater, cmpVersion, parseShaMap };
