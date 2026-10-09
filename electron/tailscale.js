'use strict';
// Reads the Mac's Tailscale device list so Windows VMs can be imported without any port forwarding.
const fs = require('fs');
const { execFile } = require('child_process');

const CANDIDATES = [
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/opt/homebrew/bin/tailscale',
  '/usr/local/bin/tailscale',
  '/usr/bin/tailscale',
];

function findCli() {
  return CANDIDATES.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function run(cli, args) {
  return new Promise((resolve, reject) =>
    execFile(cli, args, { timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout),
    ),
  );
}

/** Pure transform of `tailscale status --json`, exported for tests. */
function parseStatus(json) {
  const peers = Object.values(json.Peer || {}).map((p) => ({
    id: p.ID || p.PublicKey,
    name: p.HostName || (p.DNSName || '').split('.')[0],
    dnsName: (p.DNSName || '').replace(/\.$/, ''),
    ip: (p.TailscaleIPs || []).find((ip) => ip.includes('.')) || (p.TailscaleIPs || [])[0] || '',
    os: String(p.OS || '').toLowerCase(),
    online: !!p.Online,
    lastSeen: p.LastSeen || '',
  }));
  return {
    backendState: json.BackendState || 'Unknown',
    self: json.Self ? { name: json.Self.HostName, ip: (json.Self.TailscaleIPs || [])[0] || '' } : null,
    peers: peers.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
  };
}

async function status() {
  const cli = findCli();
  if (!cli) return { installed: false, backendState: 'NotInstalled', self: null, peers: [] };
  const out = await run(cli, ['status', '--json']);
  return { installed: true, ...parseStatus(JSON.parse(out)) };
}

module.exports = { status, parseStatus };
