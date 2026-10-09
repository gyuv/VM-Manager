'use strict';
// One-time PowerShell script the user pastes into a VM (over RDP): joins it to their Tailscale
// network and enables WinRM reachable *only* from Tailscale addresses. No provider ports needed.

const psQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;

function tailscaleSetupScript({ authKey = '', hostnamePrefix = '' } = {}) {
  const keyLine = authKey
    ? `$authKey = ${psQuote(authKey.trim())}`
    : `$authKey = Read-Host 'Paste your Tailscale auth key (tskey-auth-...)'`;
  return `# WinRemoteOps VM setup: Tailscale + WinRM (run in an elevated PowerShell)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
${keyLine}
$hostname = ${psQuote(hostnamePrefix)} + $env:COMPUTERNAME

# 1. Install Tailscale (skipped if already installed)
$ts = Join-Path $env:ProgramFiles 'Tailscale\\tailscale.exe'
if (-not (Test-Path $ts)) {
  $msi = Join-Path $env:TEMP 'tailscale-setup.msi'
  Write-Host 'Downloading Tailscale...'
  try {
    Invoke-WebRequest 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi' -OutFile $msi -UseBasicParsing
  } catch {
    throw "Could not download Tailscale ($($_.Exception.Message)). Install it manually from https://tailscale.com/download/windows, then run this script again."
  }
  Start-Process msiexec.exe -Wait -ArgumentList "/i \`"$msi\`" /quiet TS_UNATTENDEDMODE=always"
  if (-not (Test-Path $ts)) { throw 'Tailscale did not install — install it manually from https://tailscale.com/download/windows and re-run.' }
}

# 2. Join your tailnet (unattended so it stays connected without anyone logged in)
& $ts up --authkey $authKey --unattended --hostname $hostname --reset
if ($LASTEXITCODE -ne 0) { throw 'tailscale up failed — check the auth key' }

# 3. WinRM over HTTP, reachable only from Tailscale (WireGuard already encrypts it)
Enable-PSRemoting -SkipNetworkProfileCheck -Force | Out-Null
Set-Item WSMan:\\localhost\\Service\\Auth\\Basic $true
Set-Item WSMan:\\localhost\\Service\\AllowUnencrypted $true
Get-NetFirewallRule -DisplayName 'WinRemoteOps WinRM (Tailscale)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'WinRemoteOps WinRM (Tailscale)' -Direction Inbound -Protocol TCP -LocalPort 5985 -RemoteAddress 100.64.0.0/10 -Action Allow | Out-Null

$ip = (& $ts ip -4 | Select-Object -First 1)
Write-Host ''
Write-Host "Done. $hostname is on your tailnet at $ip" -ForegroundColor Green
Write-Host 'In WinRemoteOps: Import from Tailscale (or add it with WinRM HTTP, port 5985).'
`;
}

module.exports = { tailscaleSetupScript };
