# Release PR: `vX.Y.Z`

## Release Metadata

- Version: `vX.Y.Z`
- Target commit SHA:
- Validation tag used: `vX.Y.Z-validation.YYYYMMDD.N`
- Release workflow run ID:

## Summary

Describe what is included in this release.

## Go/No-Go Gates

### 1) Scope Lock

- [ ] Product identity is `WebHW`.
- [ ] Release version is finalized in:
  - [ ] `backend/package.json`
  - [ ] `frontend/package.json`
- [ ] Release notes draft is prepared.

### 2) CI Gates (Required)

- [ ] `CI Tests` is green on the release commit.
- [ ] `CI Installers` is green on the release commit.
- [ ] Installer doctor smoke jobs pass on Ubuntu, macOS, and Windows.
- [ ] No unresolved required check failures remain.

### 3) Release Validation (Required)

- [ ] Validation tag was created from the target release commit.
- [ ] `Release` workflow completed successfully for the validation tag.
- [ ] Expected release artifacts were generated for all required platform/arch targets.
- [ ] Windows installer artifacts required for winget path are present.

### 4) Artifact Quality (Required)

- [ ] Installer artifacts are present for:
  - [ ] Windows `x64`
  - [ ] Windows `arm64`
  - [ ] macOS `x64`
  - [ ] macOS `arm64`
  - [ ] Linux `x64`
  - [ ] Linux `arm64`
- [ ] Homebrew artifacts generated on Linux and macOS.
- [ ] Browser extension packages build successfully.

### 5) Installer Runtime Checks (Required)

- [ ] `install_native_host.js install` succeeds in non-interactive mode.
- [ ] `install_native_host.js doctor` exits successfully after install.
- [ ] `install_native_host.js uninstall` removes active host registration.
- [ ] Smoke scripts pass for their target environments.

### 6) Security and Dependencies (Required)

- [ ] `npm audit --omit=dev` passes at configured threshold.
- [ ] No critical unresolved dependency vulnerabilities in release scope.
- [ ] No secrets/private credentials are included in release artifacts.

### 7) Manual Sanity (Recommended)

- [ ] Firefox extension connects to native host in a clean profile.
- [ ] Chrome extension path verified (when Chrome registration is enabled).
- [ ] Real-device sanity checks completed for in-scope capabilities.

### 8) External Publishing Inputs (Owner)

- [ ] Store credentials/approvals are ready.
- [ ] Signing/certificate requirements are satisfied.
- [ ] Marketplace metadata is finalized.

### 9) Final Sign-Off

- [ ] Release owner approves go decision.
- [ ] Validation tag and workflow run IDs are recorded in this PR.
- [ ] Production tag `vX.Y.Z` will be created from the validated commit only.

## References

- Productization checklist: `PRODUCTIZATION_CHECKLIST.md`
