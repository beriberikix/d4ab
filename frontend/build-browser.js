#!/usr/bin/env node

/**
 * Build script for browser-specific extension packages
 * Usage: node build-browser.js [chrome|firefox|all]
 */

const fs = require('fs');
const path = require('path');

function ensureCleanDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildForBrowser(browser) {
  console.log(`\n🔨 Building for ${browser.toUpperCase()}...`);

  const browserManifestPath = path.join(__dirname, `manifest-${browser}.json`);
  if (!fs.existsSync(browserManifestPath)) {
    console.error(`❌ Manifest not found: ${browserManifestPath}`);
    process.exit(1);
  }

  const buildDir = path.join(__dirname, 'build', browser);
  ensureCleanDirectory(buildDir);

  // Write browser-specific manifest directly into the target build directory.
  fs.copyFileSync(browserManifestPath, path.join(buildDir, 'manifest.json'));

  const entriesToCopy = ['src', 'icons'];
  for (const entry of entriesToCopy) {
    const srcPath = path.join(__dirname, entry);
    const destPath = path.join(buildDir, entry);

    if (!fs.existsSync(srcPath)) {
      continue;
    }

    fs.cpSync(srcPath, destPath, { recursive: true });
  }

  console.log(`✅ ${browser} build complete in: ${buildDir}`);
}

function main() {
  const browser = process.argv[2] || 'all';

  console.log('🚀 D4AB Extension Builder');

  if (browser === 'all') {
    buildForBrowser('chrome');
    buildForBrowser('firefox');
  } else if (['chrome', 'firefox'].includes(browser)) {
    buildForBrowser(browser);
  } else {
    console.error('❌ Invalid browser. Use: chrome, firefox, or all');
    process.exit(1);
  }

  console.log('\n🎉 Build complete!');
  console.log('\nNext steps:');
  console.log('  Chrome: Load frontend/build/chrome/ as unpacked extension');
  console.log('  Firefox: Load frontend/build/firefox/manifest.json as temporary add-on');
}

if (require.main === module) {
  main();
}