'use strict';
// Minimal WinRM (WS-Management) client over HTTP or HTTPS with Basic auth.
// Replaces nodejs-winrm so we get TLS, certificate pinning, timeouts and a
// Receive loop that waits for the command to finish instead of reading once.
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const NS = {
  s: 'http://www.w3.org/2003/05/soap-envelope',
  a: 'http://schemas.xmlsoap.org/ws/2004/08/addressing',
  w: 'http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd',
  p: 'http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd',
  rsp: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell',
};
const RESOURCE_CMD = 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd';
const ACTIONS = {
  create: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Create',
  delete: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete',
  command: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command',
  receive: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive',
  signal: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Signal',
};

class WinRMError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

function envelope({ url, action, shellId, options, body = '' }) {
  const opts = options
    ? `<w:OptionSet>${Object.entries(options).map(([k, v]) => `<w:Option Name="${k}">${v}</w:Option>`).join('')}</w:OptionSet>`
    : '';
  const selector = shellId ? `<w:SelectorSet><w:Selector Name="ShellId">${xmlEscape(shellId)}</w:Selector></w:SelectorSet>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="${NS.s}" xmlns:a="${NS.a}" xmlns:w="${NS.w}" xmlns:p="${NS.p}" xmlns:rsp="${NS.rsp}">
<s:Header>
<a:To>${xmlEscape(url)}</a:To>
<a:ReplyTo><a:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
<a:Action s:mustUnderstand="true">${action}</a:Action>
<a:MessageID>uuid:${crypto.randomUUID()}</a:MessageID>
<w:ResourceURI s:mustUnderstand="true">${RESOURCE_CMD}</w:ResourceURI>
<w:MaxEnvelopeSize s:mustUnderstand="true">512000</w:MaxEnvelopeSize>
<w:OperationTimeout>PT20S</w:OperationTimeout>
<w:Locale xml:lang="en-US" s:mustUnderstand="false"/>
${selector}${opts}
</s:Header>
<s:Body>${body}</s:Body>
</s:Envelope>`;
}

// Namespace-prefix-agnostic helpers.
const tag = (name) => `(?:[\\w-]+:)?${name}`;
function first(xml, name) {
  const m = xml.match(new RegExp(`<${tag(name)}\\b[^>]*>([\\s\\S]*?)</${tag(name)}>`));
  return m ? m[1].trim() : undefined;
}
function faultMessage(xml) {
  const text = first(xml, 'Message') || first(xml, 'Text') || first(xml, 'Reason');
  return text ? text.replace(/<[^>]+>/g, '').trim() : 'WinRM fault';
}

class WinRMClient {
  /**
   * @param {object} o
   * @param {string} o.host
   * @param {number} o.port
   * @param {boolean} o.https
   * @param {string} o.username
   * @param {string} o.password
   * @param {boolean} [o.allowSelfSigned] accept certificates not signed by a trusted CA
   * @param {string} [o.fingerprint] pinned SHA-256 certificate fingerprint (AA:BB:...)
   * @param {number} [o.timeoutMs]
   */
  constructor(o) {
    this.o = o;
    const scheme = o.https ? 'https' : 'http';
    const hostPart = o.host.includes(':') ? `[${o.host}]` : o.host;
    this.url = `${scheme}://${hostPart}:${o.port}/wsman`;
    this.auth = 'Basic ' + Buffer.from(`${o.username}:${o.password}`, 'utf8').toString('base64');
    this.agent = o.https
      ? new https.Agent({ keepAlive: true, maxSockets: 1, rejectUnauthorized: false })
      : new http.Agent({ keepAlive: true, maxSockets: 1 });
    this.peerFingerprint = undefined;
  }

  close() {
    this.agent.destroy();
  }

  verifyCert(socket) {
    const { o } = this;
    const cert = socket.getPeerCertificate();
    if (!cert || !cert.fingerprint256) throw new WinRMError('Server sent no TLS certificate', 'ETLS');
    this.peerFingerprint = cert.fingerprint256;
    if (o.fingerprint) {
      if (o.fingerprint.toUpperCase() !== cert.fingerprint256.toUpperCase()) {
        throw new WinRMError(
          'Server certificate changed since it was pinned — possible interception. Re-pin it in the server settings if this is expected.',
          'ECERTPIN',
          { fingerprint: cert.fingerprint256 },
        );
      }
      return;
    }
    if (!socket.authorized && !o.allowSelfSigned) {
      throw new WinRMError(`Untrusted certificate (${socket.authorizationError}). Enable "Trust self-signed certificate".`, 'ECERTUNTRUSTED', {
        fingerprint: cert.fingerprint256,
      });
    }
  }

  post(xml, { auth = true } = {}) {
    const { o } = this;
    const mod = o.https ? https : http;
    return new Promise((resolve, reject) => {
      const req = mod.request(
        {
          host: o.host,
          port: o.port,
          path: '/wsman',
          method: 'POST',
          agent: this.agent,
          servername: o.https && !/^[\d.:]+$/.test(o.host) ? o.host : undefined,
          headers: {
            'Content-Type': 'application/soap+xml;charset=UTF-8',
            'Content-Length': Buffer.byteLength(xml),
            'User-Agent': 'WinRemoteOps',
            ...(auth ? { Authorization: this.auth } : {}),
          },
          timeout: o.timeoutMs || 30000,
        },
        (res) => {
          if (o.https) {
            try {
              this.verifyCert(res.socket);
            } catch (e) {
              res.destroy();
              return reject(e);
            }
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new WinRMError('Request timed out', 'ETIMEDOUT')));
      req.on('error', reject);
      req.end(xml);
    });
  }

  async soap(params) {
    const res = await this.post(envelope({ url: this.url, ...params }));
    if (res.status === 401) throw new WinRMError('Access denied — check username/password and that Basic auth is enabled.', 'EAUTH');
    if (res.status >= 500 || /<(?:\w+:)?Fault\b/.test(res.body)) {
      const timedOut = /2150858793|OperationTimeout|TimedOut/i.test(res.body);
      throw new WinRMError(faultMessage(res.body), timedOut ? 'EOPTIMEOUT' : 'EFAULT', { status: res.status });
    }
    if (res.status !== 200) {
      const hint = res.status === 415 || res.status === 404 ? ' (HTTP endpoint is not accepting WS-Man; is AllowUnencrypted on for HTTP?)' : '';
      throw new WinRMError(`WinRM returned HTTP ${res.status}${hint}`, 'EHTTP', { status: res.status });
    }
    return res.body;
  }

  async createShell() {
    const body = await this.soap({
      action: ACTIONS.create,
      options: { WINRS_NOPROFILE: 'TRUE', WINRS_CODEPAGE: '65001' },
      body: '<rsp:Shell><rsp:InputStreams>stdin</rsp:InputStreams><rsp:OutputStreams>stdout stderr</rsp:OutputStreams></rsp:Shell>',
    });
    const id = first(body, 'ShellId') || (body.match(/Name="ShellId"[^>]*>([^<]+)</) || [])[1];
    if (!id) throw new WinRMError('WinRM did not return a shell id', 'EPROTO');
    return id;
  }

  async deleteShell(shellId) {
    try {
      await this.soap({ action: ACTIONS.delete, shellId });
    } catch {
      /* best effort */
    }
  }

  /** Run a command line and wait for it to finish. */
  async run(commandLine, { deadlineMs = 120000 } = {}) {
    const shellId = await this.createShell();
    try {
      const cmdBody = await this.soap({
        action: ACTIONS.command,
        shellId,
        options: { WINRS_CONSOLEMODE_STDIN: 'TRUE', WINRS_SKIP_CMD_SHELL: 'FALSE' },
        body: `<rsp:CommandLine><rsp:Command>${xmlEscape(commandLine)}</rsp:Command></rsp:CommandLine>`,
      });
      const commandId = first(cmdBody, 'CommandId');
      if (!commandId) throw new WinRMError('WinRM did not return a command id', 'EPROTO');

      const stdout = [];
      const stderr = [];
      let exitCode = null;
      const deadline = Date.now() + deadlineMs;
      for (;;) {
        if (Date.now() > deadline) throw new WinRMError(`Command did not finish within ${Math.round(deadlineMs / 1000)}s`, 'ETIMEDOUT');
        let rb;
        try {
          rb = await this.soap({
            action: ACTIONS.receive,
            shellId,
            options: { WSMAN_CMDSHELL_OPTION_KEEPALIVE: 'TRUE' },
            body: `<rsp:Receive><rsp:DesiredStream CommandId="${xmlEscape(commandId)}">stdout stderr</rsp:DesiredStream></rsp:Receive>`,
          });
        } catch (e) {
          if (e.code === 'EOPTIMEOUT') continue; // no output yet, keep waiting
          throw e;
        }
        const re = new RegExp(`<${tag('Stream')}\\b([^>]*?)(?:/>|>([^<]*)</${tag('Stream')}>)`, 'g');
        let m;
        while ((m = re.exec(rb))) {
          if (!m[2]) continue;
          const name = (m[1].match(/Name="(\w+)"/) || [])[1];
          (name === 'stderr' ? stderr : stdout).push(Buffer.from(m[2], 'base64'));
        }
        const state = rb.match(/CommandState\b[^>]*State="([^"]+)"/);
        if (state && /Done$/.test(state[1])) {
          const ec = first(rb, 'ExitCode');
          exitCode = ec !== undefined ? Number(ec) : 0;
          break;
        }
      }
      return { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode };
    } finally {
      await this.deleteShell(shellId);
    }
  }
}

module.exports = { WinRMClient, WinRMError, envelope };
