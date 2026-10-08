'use strict';
// Agentless remote execution over WinRM (HTTP or HTTPS, see winrm.js). Nothing is installed on the Windows hosts.
const net = require('net');
const { WinRMClient, envelope } = require('./winrm');

const DEFAULT_TIMEOUT_MS = 60000;

// Scripts are sent as -EncodedCommand so quoting and special characters never break the command line.
function encodePowerShell(script) {
  const wrapped = `$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Continue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;${script}`;
  return `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(wrapped, 'utf16le').toString('base64')}`;
}

function clientFor(server, timeoutMs) {
  return new WinRMClient({
    host: server.host,
    port: Number(server.port) || (server.https ? 5986 : 5985),
    https: !!server.https,
    username: server.username,
    password: server.password,
    allowSelfSigned: !!server.allowSelfSigned,
    fingerprint: server.fingerprint || undefined,
    timeoutMs: Math.min(timeoutMs, 60000),
  });
}

// PowerShell writes progress/errors to stderr as CLIXML; turn that into readable text.
function cleanStderr(text) {
  if (!text.includes('#< CLIXML')) return text.trim();
  return [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((m) => m[1].replace(/_x000D__x000A_/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    .join('')
    .trim();
}

/**
 * Runs a PowerShell script. Resolves with stdout; `onPeerFingerprint` receives the
 * server's certificate fingerprint over HTTPS so the caller can pin it (trust on first use).
 */
async function runPowerShell(server, script, timeoutMs = DEFAULT_TIMEOUT_MS, onPeerFingerprint) {
  const client = clientFor(server, timeoutMs);
  try {
    const { stdout, stderr, exitCode } = await client.run(encodePowerShell(script), { deadlineMs: timeoutMs });
    if (client.peerFingerprint && onPeerFingerprint) onPeerFingerprint(client.peerFingerprint);
    const err = cleanStderr(stderr);
    if (exitCode && !stdout.trim()) throw new Error(err || `Command failed with exit code ${exitCode}`);
    return stdout;
  } catch (err) {
    throw new Error(describeError(err));
  } finally {
    client.close();
  }
}

function describeError(err) {
  const msg = err && err.message ? err.message : String(err);
  const code = err && err.code;
  if (['EAUTH', 'ECERTPIN', 'ECERTUNTRUSTED', 'EFAULT', 'EHTTP'].includes(code)) return msg;
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Host name could not be resolved — check the Host field (put the port in the port box).';
  if (/ECONNREFUSED/.test(msg)) return 'Connection refused — is WinRM listening on this port?';
  if (/ECONNRESET|socket hang up|HPE_|Parse Error/i.test(msg)) return 'Connection reset — the port may not be WinRM, or HTTP/HTTPS is set the wrong way round.';
  if (/EPROTO|SSL|TLS|wrong version number/i.test(msg)) return 'TLS handshake failed — this port is probably not WinRM over HTTPS.';
  if (/ETIMEDOUT|EHOSTUNREACH|timed out/i.test(msg)) return 'Host unreachable or timed out';
  return msg;
}

const psQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * Wraps a script so it runs on `target` *through* a jump host: the jump host
 * executes Invoke-Command against the target's private address. Only the jump
 * host needs a WinRM port reachable from the Mac.
 */
function wrapForJump(target, script) {
  const port = Number(target.port) || (target.https ? 5986 : 5985);
  const inner = Buffer.from(`$ProgressPreference='SilentlyContinue';${script}`, 'utf8').toString('base64');
  return `$t=${psQuote(target.host)}
${
  target.https
    ? ''
    : // Workgroup machines only accept NTLM over HTTP to hosts listed in TrustedHosts; add just this target.
      `$th=[string](Get-Item WSMan:\\localhost\\Client\\TrustedHosts).Value
if($th -ne '*' -and (($th -split ',') | ForEach-Object { $_.Trim() }) -notcontains $t){ Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value ((@($th,$t) | Where-Object { $_ }) -join ',') -Force }`
}
$cred=New-Object System.Management.Automation.PSCredential(${psQuote(target.username)},(ConvertTo-SecureString ${psQuote(target.password)} -AsPlainText -Force))
$sb=[scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${inner}')))
$p=@{ComputerName=$t;Port=${port};Credential=$cred;ScriptBlock=$sb;ErrorAction='Stop'}
${target.https ? "$p.UseSSL=$true;$p.SessionOption=New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck" : ''}
try { Invoke-Command @p } catch { [Console]::Error.WriteLine("Jump host could not run the command on $($t): $($_.Exception.Message)"); exit 1 }`;
}

const INFO_SCRIPT = `$os=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{host=$env:COMPUTERNAME; os=$os.Caption; build=$os.BuildNumber; ps=$PSVersionTable.PSVersion.ToString()} | ConvertTo-Json -Compress`;

/** Connection test for a server reached through a jump host. */
async function testViaJump(jump, target) {
  const steps = [];
  const add = (id, ok, detail) => steps.push({ id, ok, detail });
  const done = (extra = {}) => ({ ok: steps.every((x) => x.ok !== false), steps, ...extra });
  try {
    const j = parseJson(await runPowerShell(jump, INFO_SCRIPT, 30000));
    add('jump', true, `Jump host ${j.host} reachable (${jump.host}:${jump.port})`);
  } catch (err) {
    add('jump', false, `Jump host failed: ${err.message}`);
    return done();
  }
  const port = Number(target.port) || (target.https ? 5986 : 5985);
  try {
    const probe = await runPowerShell(jump, `(Test-NetConnection -ComputerName ${psQuote(target.host)} -Port ${port} -WarningAction SilentlyContinue).TcpTestSucceeded`, 30000);
    if (!/True/i.test(probe)) {
      add('tcp', false, `Jump host cannot reach ${target.host}:${port} — run Enable-PSRemoting -Force on the target and check its firewall`);
      return done();
    }
    add('tcp', true, `Jump host reaches ${target.host}:${port}`);
  } catch (err) {
    add('tcp', false, err.message);
    return done();
  }
  try {
    const info = parseJson(await runPowerShell(jump, wrapForJump(target, INFO_SCRIPT), 60000));
    add('auth', true, `Signed in via jump · ${info.host} · ${info.os} (build ${info.build}) · PowerShell ${info.ps}`);
    return done({ info });
  } catch (err) {
    add('auth', false, err.message);
    return done();
  }
}

/** Step-by-step diagnosis used by the "Test connection" button. */
async function testConnection(server) {
  const steps = [];
  const add = (id, ok, detail) => steps.push({ id, ok, detail });
  const port = Number(server.port) || (server.https ? 5986 : 5985);
  const result = (extra = {}) => ({ ok: steps.every((s) => s.ok !== false), steps, ...extra });

  const ping = await tcpPing(server.host, port, 4000);
  if (!ping.online) {
    add('tcp', false, `TCP port ${port} is closed or filtered`);
    return result();
  }
  add('tcp', true, `TCP port ${port} open (${ping.latencyMs} ms)`);

  // Unauthenticated probe: a WinRM listener answers 401 with its auth schemes.
  const probe = clientFor({ ...server, port, allowSelfSigned: true, fingerprint: undefined }, 10000);
  let fingerprint;
  try {
    const res = await probe.post(envelope({ url: probe.url, action: 'probe' }), { auth: false });
    fingerprint = probe.peerFingerprint;
    const schemes = String(res.headers['www-authenticate'] || '');
    const isWinRM = (res.status === 401 && /Microsoft-HTTPAPI/i.test(String(res.headers.server || ''))) || /Negotiate|Basic|Kerberos/i.test(schemes);
    if (!isWinRM) {
      add('winrm', false, `Something answered (HTTP ${res.status}) but it does not look like WinRM`);
      return result({ fingerprint });
    }
    add('winrm', true, `WinRM ${server.https ? 'HTTPS' : 'HTTP'} listener found${schemes ? ` · offers ${schemes.split(',').map((x) => x.trim().split(' ')[0]).join(', ')}` : ''}`);
    if (schemes && !/Basic/i.test(schemes)) {
      add('basic', false, 'Basic authentication is disabled on the server: Set-Item WSMan:\\localhost\\Service\\Auth\\Basic $true');
      return result({ fingerprint });
    }
  } catch (err) {
    const detail = server.https
      ? 'No TLS/WinRM on this port — try HTTP, or this may be an RDP port'
      : 'No HTTP/WinRM on this port — try HTTPS, or this may be an RDP port';
    add('winrm', false, `${detail} (${describeError(err)})`);
    return result();
  } finally {
    probe.close();
  }

  if (server.https && fingerprint) {
    if (server.fingerprint && server.fingerprint.toUpperCase() !== fingerprint.toUpperCase()) {
      add('cert', false, 'Certificate does not match the pinned fingerprint');
      return result({ fingerprint });
    }
    add('cert', true, server.fingerprint ? 'Certificate matches pinned fingerprint' : `Certificate SHA-256 ${fingerprint.slice(0, 23)}…`);
  }

  try {
    const out = await runPowerShell(
      { ...server, port },
      INFO_SCRIPT,
      30000,
    );
    const info = parseJson(out);
    add('auth', true, `Signed in · ${info.host} · ${info.os} (build ${info.build}) · PowerShell ${info.ps}`);
    return result({ fingerprint, info });
  } catch (err) {
    add('auth', false, err.message);
    return result({ fingerprint });
  }
}

function parseJson(output) {
  const start = output.search(/[[{]/);
  if (start < 0) throw new Error(output.trim() || 'Empty response from host');
  return JSON.parse(output.slice(start));
}

// TCP connect latency to the WinRM port: works without ICMP and without root.
function tcpPing(host, port = 5985, timeoutMs = 2000) {
  port = Number(port) || 5985;
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const socket = net.connect({ host, port: Number(port) || 5985 });
    const done = (online) => {
      socket.destroy();
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      resolve({ online, latencyMs: online ? Math.round(ms * 10) / 10 : null });
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

const SCRIPTS = {
  telemetry: `
$cpu=(Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os=Get-WmiObject Win32_OperatingSystem
$d=Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
[pscustomobject]@{
 cpu=[double]$cpu
 ramTotalMB=[math]::Round($os.TotalVisibleMemorySize/1KB,0)
 ramFreeMB=[math]::Round($os.FreePhysicalMemory/1KB,0)
 diskTotalGB=[math]::Round($d.Size/1GB,1)
 diskFreeGB=[math]::Round($d.FreeSpace/1GB,1)
 hostname=$env:COMPUTERNAME
 os=$os.Caption
 uptimeHours=[math]::Round(((Get-Date)-$os.ConvertToDateTime($os.LastBootUpTime)).TotalHours,1)
} | ConvertTo-Json -Compress`,

  processes: `
$cores=[Environment]::ProcessorCount
$s1=@{};Get-Process | ForEach-Object { $s1[$_.Id]=$_.TotalProcessorTime.TotalMilliseconds }
Start-Sleep -Milliseconds 500
$list=Get-Process | ForEach-Object {
 $prev=$s1[$_.Id]; $cpu=0
 if($prev -ne $null){ $cpu=[math]::Round((($_.TotalProcessorTime.TotalMilliseconds-$prev)/500/$cores)*100,1) }
 [pscustomobject]@{pid=$_.Id;name=$_.ProcessName;cpu=$cpu;memMB=[math]::Round($_.WorkingSet64/1MB,1)}
}
$top=@($list | Sort-Object cpu -Descending | Select-Object -First 10)+@($list | Sort-Object memMB -Descending | Select-Object -First 10)
@($top | Sort-Object pid -Unique) | ConvertTo-Json -Compress`,

  boostSteps: [
    { id: 'temp', label: 'Clearing %TEMP% files', script: `Remove-Item -Path $env:TEMP\\* -Force -Recurse -ErrorAction SilentlyContinue; Remove-Item -Path C:\\Windows\\Temp\\* -Force -Recurse -ErrorAction SilentlyContinue; 'Temp folders cleared'` },
    { id: 'wu', label: 'Clearing Windows Update cache', script: `Stop-Service wuauserv -Force -ErrorAction SilentlyContinue; Remove-Item -Path C:\\Windows\\SoftwareDistribution\\Download\\* -Force -Recurse -ErrorAction SilentlyContinue; Start-Service wuauserv -ErrorAction SilentlyContinue; 'Update cache cleared'` },
    { id: 'dns', label: 'Flushing DNS cache', script: `ipconfig /flushdns | Out-String` },
  ],

  networkReset: `netsh winsock reset | Out-String; netsh int ip reset | Out-String; 'A reboot is required to complete the network reset.'`,

  // StateFlags0001 marks the categories for /sagerun:1, then runs cleanmgr hidden.
  diskCleanup: `
$k='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VolumeCaches'
Get-ChildItem $k -ErrorAction SilentlyContinue | ForEach-Object { New-ItemProperty -Path $_.PSPath -Name StateFlags0001 -Value 2 -PropertyType DWord -Force -ErrorAction SilentlyContinue | Out-Null }
$before=(Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace
if(Test-Path "$env:SystemRoot\\System32\\cleanmgr.exe"){ Start-Process cleanmgr.exe -ArgumentList '/sagerun:1' -WindowStyle Hidden -Wait }
else { Remove-Item "$env:SystemRoot\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue; Clear-RecycleBin -Force -ErrorAction SilentlyContinue }
$after=(Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'").FreeSpace
"Disk cleanup finished. Freed $([math]::Round(($after-$before)/1MB,1)) MB"`,

  reboot: `Restart-Computer -Force; 'Reboot initiated'`,
  shutdown: `Stop-Computer -Force; 'Shutdown initiated'`,
  kill: (pid) => `Stop-Process -Id ${pid} -Force -ErrorAction Stop; 'Process ${pid} terminated'`,
};

module.exports = { runPowerShell, parseJson, tcpPing, testConnection, testViaJump, wrapForJump, encodePowerShell, SCRIPTS };
