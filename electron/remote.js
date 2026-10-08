'use strict';
// Agentless remote execution over WinRM (nodejs-winrm). Nothing is installed on the Windows hosts.
const net = require('net');
const { shell, command } = require('nodejs-winrm');

const DEFAULT_TIMEOUT_MS = 30000;

function unwrap(value) {
  if (value instanceof Error) throw value;
  return value;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Scripts are sent as -EncodedCommand so quoting and special characters never break the command line.
function encodePowerShell(script) {
  const wrapped = `$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Continue';${script}`;
  return `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(wrapped, 'utf16le').toString('base64')}`;
}

async function runPowerShell(server, script, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const params = {
    host: server.host,
    port: Number(server.port) || 5985,
    path: '/wsman',
    auth: 'Basic ' + Buffer.from(`${server.username}:${server.password}`, 'utf8').toString('base64'),
  };
  const run = async () => {
    params.shellId = unwrap(await shell.doCreateShell(params));
    try {
      params.command = encodePowerShell(script);
      params.commandId = unwrap(await command.doExecuteCommand(params));
      return String(unwrap(await command.doReceiveOutput(params)) ?? '');
    } finally {
      shell.doDeleteShell(params).catch(() => {});
    }
  };
  try {
    return await withTimeout(run(), timeoutMs, 'WinRM command');
  } catch (err) {
    throw new Error(describeError(err));
  }
}

function describeError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Host name could not be resolved — check the Host field (put the port in the port box).';
  if (/ECONNREFUSED/.test(msg)) return 'Connection refused — is WinRM enabled (winrm quickconfig)?';
  if (/ETIMEDOUT|EHOSTUNREACH|timed out/.test(msg)) return 'Host unreachable or timed out';
  if (/401|Unauthorized|AccessDenied|status Code/i.test(msg)) return 'WinRM rejected the request — check credentials, Basic auth and AllowUnencrypted';
  return msg;
}

function parseJson(output) {
  const start = output.search(/[[{]/);
  if (start < 0) throw new Error(output.trim() || 'Empty response from host');
  return JSON.parse(output.slice(start));
}

// TCP connect latency to the WinRM port: works without ICMP and without root.
function tcpPing(host, port = 5985, timeoutMs = 2000) {
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

module.exports = { runPowerShell, parseJson, tcpPing, SCRIPTS };
