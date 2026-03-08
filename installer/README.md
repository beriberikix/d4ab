# D4AB Installer Contract

This document defines installer behavior for local development builds across macOS, Linux, and Windows.

## Scope

- Local installer workflows only (pre-store extension distribution).
- Native messaging host installation and registration.
- Browser selection policy and cleanup behavior.

## Browser Policy

- Supported host registration browsers: `firefox`, `chrome`.
- Default policy when `--non-interactive` is used and no explicit `--browsers` value is provided:
  - `firefox`: selected when detected.
  - `chrome`: detected but disabled by default.
- Safari is detection-only (informational) on macOS in the current milestone.

## Common Installer Flags

Command:

```bash
node installer/install_native_host.js install [options]
```

Options:

- `--browsers firefox,chrome`: explicit browser target selection.
- `--non-interactive`: skip prompts and apply defaults.
- `--chrome-extension-id <id>`: required for real Chrome registration; otherwise use `--allow-placeholder-ids` only for scaffolding.
- `--open-guidance`: open extension setup pages after install.
- `--no-open-guidance`: disable browser page opening.
- `--cleanup-stale-manifests`: remove stale host registrations for unselected browsers (default).
- `--no-cleanup-stale-manifests`: keep existing stale host registrations.

## Registration Locations

macOS:

- Firefox: `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.d4ab.hardware_bridge.json`
- Chrome: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.d4ab.hardware_bridge.json`

Linux:

- Firefox: `~/.mozilla/native-messaging-hosts/com.d4ab.hardware_bridge.json`
- Chromium-family candidates:
  - `~/.config/google-chrome/NativeMessagingHosts/com.d4ab.hardware_bridge.json`
  - `~/.config/chromium/NativeMessagingHosts/com.d4ab.hardware_bridge.json`
  - `~/.config/chromium-browser/NativeMessagingHosts/com.d4ab.hardware_bridge.json`

Windows:

- Firefox registry key:
  - `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\com.d4ab.hardware_bridge`
- Chrome registry key:
  - `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.d4ab.hardware_bridge`

## Build Artifacts

- Homebrew artifacts: `dist/homebrew/`
- Windows installer scaffold output: `dist/win32-x64/installer.iss`
- Windows package archive: `dist/d4ab-bridge-<version>-windows.zip`

## Local Smoke Commands

macOS:

```bash
bash installer/smoke_macos_brew.sh
```

Linux:

```bash
bash installer/smoke_linux_brew.sh
bash installer/smoke_linux_brew.sh --with-chrome --chrome-extension-id <id>
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\smoke_windows_inno.ps1
powershell -ExecutionPolicy Bypass -File .\installer\smoke_windows_inno.ps1 -WithChrome -ChromeExtensionId <id>
```

Matrix runner (current host only, others are reported as skipped):

```bash
node installer/run_local_matrix.js
node installer/run_local_matrix.js --with-chrome --chrome-extension-id <id>
```
