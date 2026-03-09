#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This smoke script is intended for macOS only."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required but was not found in PATH."
  exit 1
fi

cd "$REPO_ROOT"

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

echo "[3/5] Running native host installer with default policy..."
node installer/install_native_host.js install --non-interactive

echo "[4/5] Verifying Firefox native messaging manifest..."
FIREFOX_MANIFEST="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.webhw.hardware_bridge.json"
if [[ ! -f "$FIREFOX_MANIFEST" ]]; then
  echo "Missing Firefox manifest: $FIREFOX_MANIFEST"
  exit 1
fi

node -e "
const fs = require('fs');
const manifestPath = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.path) {
  throw new Error('Manifest path is missing');
}
if (!fs.existsSync(manifest.path)) {
  throw new Error('Manifest path target does not exist: ' + manifest.path);
}
console.log('Firefox manifest path target exists:', manifest.path);
" "$FIREFOX_MANIFEST"

echo "[5/5] Smoke test completed successfully."
echo "You can now load the local extension in Firefox and validate runtime behavior."
