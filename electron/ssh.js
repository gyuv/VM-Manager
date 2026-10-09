'use strict';
// Runs PowerShell on Windows over its built-in OpenSSH server (alternative to WinRM).
// Avoids HTTP.sys, TLS certificates and Host-header issues entirely.
const crypto = require('crypto');
const { Client } = require('ssh2');

class SSHError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const fingerprintOf = (key) => 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');

/**
 * Executes a command line over SSH.
 * @param {object} o host, port, username, password, privateKey?, hostKey? (pinned SHA256:...), timeoutMs
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number|null, hostKey:string}>}
 */
function sshExec(o, commandLine, { deadlineMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let seenKey = '';
    let keyMismatch = false;
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new SSHError(`Command did not finish within ${Math.round(deadlineMs / 1000)}s`, 'ETIMEDOUT')), deadlineMs);

    conn.on('ready', () => {
      conn.exec(commandLine, (err, stream) => {
        if (err) return finish(err);
        const out = [];
        const errOut = [];
        let exitCode = null;
        stream.on('data', (d) => out.push(d));
        stream.stderr.on('data', (d) => errOut.push(d));
        stream.on('exit', (code) => (exitCode = code));
        stream.on('close', () =>
          finish(null, { stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(errOut).toString('utf8'), exitCode, hostKey: seenKey }),
        );
      });
    });
    conn.on('error', (err) => {
      if (keyMismatch)
        return finish(
          new SSHError('SSH host key changed since it was pinned — possible interception. Clear the pin in server settings if this is expected.', 'EHOSTKEY', {
            fingerprint: seenKey,
          }),
        );
      if (err.level === 'client-authentication') return finish(new SSHError('SSH sign-in failed — check username/password (or key).', 'EAUTH'));
      finish(err);
    });

    conn.connect({
      host: o.host,
      port: Number(o.port) || 22,
      username: o.username,
      password: o.password || undefined,
      privateKey: o.privateKey || undefined,
      tryKeyboard: true,
      readyTimeout: Math.min(o.timeoutMs || 20000, 30000),
      keepaliveInterval: 10000,
      hostVerifier: (key) => {
        seenKey = fingerprintOf(key);
        if (o.hostKey && o.hostKey !== seenKey) {
          keyMismatch = true; // reported from the 'error' handler ssh2 fires next
          return false;
        }
        return true;
      },
    });
    conn.on('keyboard-interactive', (_n, _i, _l, prompts, cb) => cb(prompts.map(() => o.password || '')));
  });
}

module.exports = { sshExec, SSHError, fingerprintOf };
