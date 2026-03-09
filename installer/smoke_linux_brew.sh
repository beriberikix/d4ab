#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WITH_CHROME=0
CHROME_EXTENSION_ID="${WEBHW_CHROME_EXTENSION_ID:-}"

usage() {
  cat <<'EOF'
Usage: bash installer/smoke_linux_brew.sh [options]

Options:
  --with-chrome                       Enable Chrome/Chromium registration checks.
  --chrome-extension-id <id>          Chrome extension ID for host manifest allowed_origins.
  --chrome-extension-id=<id>          Same as above.
  -h, --help                          Show this help message.

Notes:
  - Firefox is always verified.
  - If --with-chrome is set and no Chrome extension ID is provided,
    the installer uses --allow-placeholder-ids for local scaffolding.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-chrome)
      WITH_CHROME=1
      shift
      ;;
    --chrome-extension-id)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --chrome-extension-id"
        exit 1
      fi
      CHROME_EXTENSION_ID="$2"
      shift 2
      ;;
    --chrome-extension-id=*)
      CHROME_EXTENSION_ID="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This smoke script is intended for Linux only."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required but was not found in PATH."
  exit 1
fi

cd "$REPO_ROOT"

verify_manifest_path_target() {
  local manifest_path="$1"
  local label="$2"
  local required_key="$3"

  node -e "
const fs = require('fs');
const manifestPath = process.argv[1];
const label = process.argv[2];
const requiredKey = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.path) {
  throw new Error(label + ' manifest path is missing');
}
if (!fs.existsSync(manifest.path)) {
  throw new Error(label + ' manifest path target does not exist: ' + manifest.path);
}
if (!Object.prototype.hasOwnProperty.call(manifest, requiredKey)) {
  throw new Error(label + ' manifest is missing key: ' + requiredKey);
}
console.log(label + ' manifest path target exists:', manifest.path);
" "$manifest_path" "$label" "$required_key"
}

echo "[1/5] Building local Homebrew artifacts..."
node installer/build_installer.js --target brew

FORMULA_PATH="$REPO_ROOT/dist/homebrew/Formula/webhw-hardware-bridge.rb"
if [[ ! -f "$FORMULA_PATH" ]]; then
  echo "Formula not found: $FORMULA_PATH"
  exit 1
fi

echo "[2/5] Installing/reinstalling Homebrew formula..."
TAP_NAME="webhw/local"
if ! brew tap | grep -qx "$TAP_NAME"; then
  brew tap-new "$TAP_NAME" --no-git
fi

TAP_REPO="$(brew --repo "$TAP_NAME")"
mkdir -p "$TAP_REPO/Formula"
cp "$FORMULA_PATH" "$TAP_REPO/Formula/webhw-hardware-bridge.rb"

if brew list "$TAP_NAME/webhw-hardware-bridge" >/dev/null 2>&1; then
  brew reinstall --build-from-source "$TAP_NAME/webhw-hardware-bridge"
else
  brew install --build-from-source "$TAP_NAME/webhw-hardware-bridge"
fi

echo "[3/5] Running native host installer..."
INSTALL_ARGS=(install --non-interactive)
if [[ "$WITH_CHROME" -eq 1 ]]; then
  INSTALL_ARGS+=(--browsers firefox,chrome)
  if [[ -n "$CHROME_EXTENSION_ID" ]]; then
    INSTALL_ARGS+=(--chrome-extension-id "$CHROME_EXTENSION_ID")
  else
    echo "No Chrome extension ID provided. Using placeholder ID for local verification."
    INSTALL_ARGS+=(--allow-placeholder-ids)
  fi
fi

node installer/install_native_host.js "${INSTALL_ARGS[@]}"

echo "[4/5] Verifying Firefox native messaging manifest..."
FIREFOX_MANIFEST="$HOME/.mozilla/native-messaging-hosts/com.webhw.hardware_bridge.json"
if [[ ! -f "$FIREFOX_MANIFEST" ]]; then
  echo "Missing Firefox manifest: $FIREFOX_MANIFEST"
  exit 1
fi

verify_manifest_path_target "$FIREFOX_MANIFEST" "Firefox" "allowed_extensions"

if [[ "$WITH_CHROME" -eq 1 ]]; then
  echo "[5/5] Verifying Chrome/Chromium native messaging manifest locations..."
  CHROME_CANDIDATES=(
    "$HOME/.config/google-chrome/NativeMessagingHosts/com.webhw.hardware_bridge.json"
    "$HOME/.config/chromium/NativeMessagingHosts/com.webhw.hardware_bridge.json"
    "$HOME/.config/chromium-browser/NativeMessagingHosts/com.webhw.hardware_bridge.json"
  )

  FOUND_CHROME_MANIFESTS=()
  for candidate in "${CHROME_CANDIDATES[@]}"; do
    if [[ -f "$candidate" ]]; then
      FOUND_CHROME_MANIFESTS+=("$candidate")
    fi
  done

  if [[ ${#FOUND_CHROME_MANIFESTS[@]} -eq 0 ]]; then
    echo "Chrome/Chromium manifest not found in expected profile directories."
    echo "Checked:"
    printf '  - %s\n' "${CHROME_CANDIDATES[@]}"
    exit 1
  fi

  for manifest_path in "${FOUND_CHROME_MANIFESTS[@]}"; do
    echo "Found Chromium-family manifest: $manifest_path"
    verify_manifest_path_target "$manifest_path" "Chrome/Chromium" "allowed_origins"
  done
fi

echo "Smoke test completed successfully."
