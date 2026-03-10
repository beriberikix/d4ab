# WebHW Productization Checklist

Use this as the release go/no-go checklist for production launches.

## 1. Scope Lock

- [ ] Product name and package identity are `WebHW` only.
- [ ] Release version is finalized (`X.Y.Z`) and recorded in:
  - `backend/package.json`
  - `frontend/package.json`
- [ ] Release notes draft is prepared (key features, bug fixes, known issues).

## 2. CI Gates (Required)

- [ ] `CI Tests` is green on `main` for the target release commit.
- [ ] `CI Installers` is green on `main` for the target release commit.
- [ ] Installer doctor smoke jobs pass on all supported CI OS targets:
  - Ubuntu
  - macOS
  - Windows
- [ ] No unresolved required check failures on the release commit.

## 3. Release Workflow Validation (Required)

- [ ] Create and push a validation tag from the target release commit:
  - Format: `vX.Y.Z-validation.YYYYMMDD.N`
- [ ] `Release` workflow completes successfully for that validation tag.
- [ ] Release artifacts are generated for each expected platform/arch target.
- [ ] Windows installer artifacts required by winget path are present.

## 4. Artifact Quality Checks (Required)

- [ ] Installer artifacts exist and are downloadable from CI for:
  - Windows (`x64`, `arm64`)
  - macOS (`x64`, `arm64`)
  - Linux (`x64`, `arm64`)
- [ ] Homebrew artifacts are generated on Linux and macOS jobs.
- [ ] Extension packages build successfully for supported browsers.

## 5. Installer Runtime Checks (Required)

- [ ] `install_native_host.js install` works in non-interactive mode.
- [ ] `install_native_host.js doctor` exits successfully after install.
- [ ] `install_native_host.js uninstall` removes active host registration.
- [ ] Smoke scripts pass on target OS environments:
  - `installer/smoke_macos_brew.sh`
  - `installer/smoke_linux_brew.sh`
  - `installer/smoke_windows_inno.ps1`

## 6. Security and Dependency Checks (Required)

- [ ] `npm audit --omit=dev` passes at configured threshold.
- [ ] No critical unresolved dependency vulnerabilities in release scope.
- [ ] No secrets or private credentials are present in release artifacts.

## 7. Manual Sanity (Recommended)

- [ ] Firefox extension can connect to native host in a clean profile.
- [ ] Chrome extension path is verified if Chrome registration is enabled.
- [ ] One real-device sanity test passes for each major capability in scope:
  - USB
  - Serial
  - Bluetooth

## 8. External Publishing Inputs (Owner)

- [ ] Store account credentials and approvals are ready (if publishing now).
- [ ] Signing/cert requirements are ready (if required by target channel).
- [ ] Marketplace metadata is finalized (description, icons, changelog).

## 9. Final Go/No-Go

- [ ] Release owner signs off on all required gates.
- [ ] Validation tag and run ID are recorded in release notes.
- [ ] Production tag `vX.Y.Z` is created from the validated commit only.
