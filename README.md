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

## Recommended: connect VMs with Tailscale (no port forwarding)
If your VMs sit behind a provider's NAT with only a Remote Desktop port each, don't forward ports at all. Put every VM and your Mac on one **Tailscale** network (free for up to 100 devices). Each VM connects **outbound** and gets a private `100.x.y.z` IP your Mac reaches directly, encrypted with WireGuard.

1. Install Tailscale on the Mac and sign in.
2. In WinRemoteOps, click **Tailscale**, then **1 · Set up each VM**. Paste a reusable auth key (from login.tailscale.com, under Settings → Keys) and copy the generated script.
3. On each VM, connect with Remote Desktop as usual and paste the script into an **admin PowerShell**. It installs Tailscale, joins the network and enables WinRM on 5985, firewalled to Tailscale addresses only (`100.64.0.0/10`). Existing services and provider ports aren't touched.
4. Back in the app, go to **2 · Import**, pick the Windows VMs, enter the login and click **Import**.

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

## SSH connection method (when WinRM won't work)
WinRM depends on Windows' web server (HTTP.sys), TLS certificates and the `Host:` header, any of which a provider's port forwarding can break. **SSH** uses Windows' built-in OpenSSH server instead and can listen on whatever port your provider forwards. On the VM, in an admin PowerShell:
```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
# No Windows Update access? Install OpenSSH-Win64.msi from github.com/PowerShell/Win32-OpenSSH/releases instead.
$cfg = "$env:ProgramData\ssh\sshd_config"
Start-Service sshd; Stop-Service sshd          # first start creates sshd_config
(Get-Content $cfg) -replace '^#?Port .*', 'Port 15071' | Set-Content $cfg   # the port your provider forwards
Set-Service sshd -StartupType Automatic; Start-Service sshd
New-NetFirewallRule -DisplayName "OpenSSH 15071" -Direction Inbound -Protocol TCP -LocalPort 15071 -Action Allow
```
In the app, choose **Connection method → SSH**, enter the public IP and port, and fill in the login (password or private key). The host key is pinned the first time you connect.

**Detect what's on this port** in the server form tells you what's actually listening: SSH, WinRM over HTTPS or HTTP, Remote Desktop, a web server, or nothing. Test connection runs the same check first.

## Jump host mode (many VMs behind one public IP)
Hosting providers often put many VMs behind one shared IP and give each VM only a Remote Desktop port (for example `IP:14071`). Opening a WinRM port on every VM is a lot of work, so expose just **one** VM and reach the rest through it:

1. **Jump host.** Pick one VM, have its WinRM port forwarded (HTTPS 5986 recommended), and add it as a normal **Direct** server.
2. **Every other VM.** Run once, in an admin PowerShell over Remote Desktop:
   ```powershell
   Enable-PSRemoting -Force
   # Only if you sign in with a local admin that is NOT the built-in Administrator:
   Set-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System LocalAccountTokenFilterPolicy 1
   ```
   Find its private IP with `ipconfig`, e.g. `10.0.0.12`.
3. **In the app,** add the VM with **Route → Via jump host**. Enter its private IP, port 5985 (HTTP inside the private network) and its own credentials. Then click **Test connection**. It checks the jump host, then whether the jump host can reach the target, then the sign-in.

The app connects only to the jump host, which runs `Invoke-Command` against the target. WinRM encrypts that inner hop itself (NTLM or Kerberos), even over HTTP. In a workgroup, the app adds just that target's IP to the jump host's `TrustedHosts`. A server's status dot follows its jump host's reachability, and turns amber if the target fails.

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
