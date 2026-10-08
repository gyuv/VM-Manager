# WinRemoteOps

Agentless macOS desktop app (Electron + React + Vite + Tailwind + TypeScript) for monitoring and managing remote Windows servers over **WinRM / PowerShell**. Nothing is installed on the Windows hosts.

## Features
- **Fleet overview** — grid of servers with live 60 s CPU/RAM area charts (Recharts), RAM used/total, free space on `C:\`, and glowing online/offline dots driven by continuous TCP latency checks to the WinRM port.
- **Server detail** — radial CPU / RAM / disk gauges and a detailed load-history chart.
- **Command Center** sidebar
  - *Smart Boost* with a live multi-step progress bar: clears `%TEMP%` + `C:\Windows\Temp`, clears the Windows Update download cache, flushes DNS.
  - *Network Reset*: `netsh winsock reset` + `netsh int ip reset`.
  - *Disk Cleanup*: configures `StateFlags0001` and runs `cleanmgr.exe /sagerun:1` hidden.
  - Reboot / Shutdown with click-to-confirm.
- **Live process manager** — top 10 processes (CPU % sampled over 500 ms, working set), sortable, refreshed every 3 s, inline Kill with a red confirm animation (`Stop-Process -Id <PID> -Force`).
- Credentials stored with `electron-store`; passwords are encrypted with Electron `safeStorage` (macOS Keychain).
- macOS glass look via `vibrancy: 'under-window'` and a hidden-inset title bar.

## In-app updates
WinRemoteOps updates itself from this repo's GitHub Releases. It doesn't use Squirrel.Mac, which rejects ad-hoc-signed apps.
- Checks on launch and every 4 hours. You can also use **WinRemoteOps → Check for Updates…** or the version pill at the bottom of the sidebar.
- Downloads the new portable ZIP in the background with live progress and speed, then verifies its SHA-512 against `latest-mac.yml`.
- A banner offers **Restart now**. The app quits, swaps the `.app` bundle in place (rolling back if the swap fails), clears quarantine and relaunches.
- Auto-check and auto-download can be turned off in the Update Center.
- The app must be in a writable folder such as `/Applications`, not running from the DMG. The repo must be public, because the app checks GitHub without signing in.

To ship an update, bump `version` in `package.json` and let the **Build macOS** workflow run. It publishes `v<version>` with the DMGs, ZIPs and `latest-mac.yml`.

## Preparing the Windows servers
WinRemoteOps talks WS-Management directly over **HTTPS (5986, recommended)** or **HTTP (5985)** with Basic auth. It connects to a forwarded port such as `IP:14071` too, as long as that port forwards to WinRM and not to Remote Desktop (3389).

**HTTPS (use this for anything reachable from the internet).** Run in an elevated PowerShell:
```powershell
winrm quickconfig -q
$c = New-SelfSignedCertificate -DnsName $env:COMPUTERNAME -CertStoreLocation Cert:\LocalMachine\My
New-Item WSMan:\localhost\Listener -Transport HTTPS -Address * -CertificateThumbPrint $c.Thumbprint -Force
Set-Item WSMan:\localhost\Service\Auth\Basic $true
New-NetFirewallRule -DisplayName "WinRM HTTPS" -Direction Inbound -Protocol TCP -LocalPort 5986 -Action Allow
```
In the app, choose **HTTPS** and tick **Trust self-signed certificate**. The certificate is pinned the first time you connect; if it ever changes, the app refuses to connect.

**HTTP (LAN or VPN only):**
```powershell
winrm quickconfig -q
Set-Item WSMan:\localhost\Service\Auth\Basic $true
Set-Item WSMan:\localhost\Service\AllowUnencrypted $true
```

Use a **local** administrator account (Basic auth doesn't accept domain accounts).

**Test connection** in the server form checks, in order: the TCP port, whether a WinRM listener answers, whether Basic auth is offered, the TLS certificate, and the sign-in itself. It says which step failed. A dot on a server card means:
- green: WinRM is working
- amber: the port is open but WinRM fails
- red: the port is unreachable

## Development
```bash
npm install
npm run dev          # Vite + Electron with hot reload
npm run build        # typecheck + renderer build
```

## Packaging (free, ad-hoc signed — no Apple Developer certificate)
```bash
npm run build:mac-universal   # DMG + portable ZIP for x64, arm64 and universal
npm run build:mac             # universal DMG only
```
Outputs land in `dist/`:
- `WinRemoteOps-1.0.0-<arch>.dmg` — installer with custom background and drag-to-Applications.
- `WinRemoteOps-1.0.0-<arch>-portable.zip` — standalone `.app`, runs from anywhere.

DMG creation requires macOS (`hdiutil`). On a non-Mac, use the **Build macOS** GitHub Actions workflow (Actions → Build macOS → Run workflow) and download the artifact.

Because the app is ad-hoc signed, Gatekeeper will warn on first launch: right-click the app → **Open**, or run
`xattr -dr com.apple.quarantine /Applications/WinRemoteOps.app`.
