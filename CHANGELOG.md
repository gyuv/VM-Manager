# Changelog

## 1.6.1
### Improved
- "What's new" in the update window now shows a real list of changes for each version, with proper headings and bullet points.
- Release notes on GitHub now list the changes instead of generic installer text.

## 1.6.0
### New
- **One simple "Add VM" button**: save your Windows login once, paste one script on each VM over Remote Desktop, and the VM appears on its own.
- VMs are added automatically whenever a new one comes online.
### Changed
- Manual options (WinRM HTTPS or HTTP, SSH, jump host) moved under "Advanced".

## 1.5.0
### New
- Tailscale support: connect VMs without opening any ports at your provider.
- Setup script generator and "Import from Tailscale".
### Fixed
- The Edit server and other dialogs were blurry. They're now solid and sharp.

## 1.4.0
### New
- SSH connection method, using Windows' built-in OpenSSH.
- "Detect what's on this port" tells you whether a port is SSH, WinRM, Remote Desktop or a web server.
- Test connection explains when a port speaks a different protocol than expected.

## 1.3.2
### Fixed
- Connections through forwarded ports that answer with "400 Invalid Hostname".
### Improved
- Test connection shows which machine's certificate answered, so a port pointing at the wrong VM is obvious.

## 1.3.1
### Fixed
- "Connection reset" when connecting to WinRM through a provider's port forwarding.

## 1.3.0
### New
- Jump host mode: manage VMs that have no public port through one VM that does.

## 1.2.0
### New
- WinRM over HTTPS with certificate pinning.
- Test connection button with step-by-step diagnosis.
- Warning when plain HTTP is used to a public IP.
### Improved
- Amber status when the port is open but WinRM isn't answering.
- Long actions (network reset, disk cleanup) now wait for the command to finish.

## 1.1.2
### Fixed
- Typing "IP:port" in the Host field caused "getaddrinfo ENOTFOUND". It's now split automatically.

## 1.1.1
- Test release for the in-app updater.

## 1.1.0
### New
- In-app updates: automatic checks, background download, checksum verification and one-click restart.

## 1.0.0
- First release: dashboard, live CPU/RAM charts, Smart Boost, network reset, disk cleanup, process manager, reboot and shutdown.
