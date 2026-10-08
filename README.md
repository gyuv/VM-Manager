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

## Preparing the Windows servers
Run in an elevated PowerShell on each server (lab / trusted network — HTTP + Basic auth):
```powershell
winrm quickconfig -q
Set-Item WSMan:\localhost\Service\Auth\Basic $true
Set-Item WSMan:\localhost\Service\AllowUnencrypted $true
```
Use a local administrator account. `nodejs-winrm` speaks HTTP only, so use this on a trusted LAN or through a VPN/SSH tunnel.

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
