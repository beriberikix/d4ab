#!/usr/bin/env node

/**
 * Build script for browser-specific extension packages
 * Usage: node build-browser.js [chrome|firefox|all]
 */

const fs = require('fs');
const path = require('path');

function copyManifestForBrowser(browser) {
  const manifestSrc = path.join(__dirname, `manifest-${browser}.json`);
  const manifestDest = path.join(__dirname, 'manifest.json');

  if (!fs.existsSync(manifestSrc)) {
    console.error(`❌ Manifest not found: ${manifestSrc}`);
    process.exit(1);
  }

  fs.copyFileSync(manifestSrc, manifestDest);
  console.log(`✅ Copied manifest for ${browser}`);
}

function buildForBrowser(browser) {
  console.log(`\n🔨 Building for ${browser.toUpperCase()}...`);

  copyManifestForBrowser(browser);

  // Create browser-specific build directory
  const buildDir = path.join(__dirname, 'build', browser);
  if (!fs.existsSync(path.dirname(buildDir))) {
    fs.mkdirSync(path.dirname(buildDir), { recursive: true });
  }
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Copy extension files
  const filesToCopy = [
    'manifest.json',
    'src/',
    'icons/',
  ];

  const { execSync } = require('child_process');

  filesToCopy.forEach(file => {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(buildDir, file);

    if (fs.existsSync(srcPath)) {
      if (fs.statSync(srcPath).isDirectory()) {
        execSync(`cp -r "${srcPath}" "${destPath}"`, { stdio: 'inherit' });
      } else {
        execSync(`cp "${srcPath}" "${destPath}"`, { stdio: 'inherit' });
      }
    }
  });

  console.log(`✅ ${browser} build complete in: ${buildDir}`);

  // Clean up
  if (fs.existsSync(path.join(__dirname, 'manifest.json'))) {
    fs.unlinkSync(path.join(__dirname, 'manifest.json'));
  }
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