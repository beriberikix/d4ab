#!/usr/bin/env node

/**
 * Package browser-specific extension artifacts for release.
 * Usage: node scripts/package-extension.js [chrome|firefox|all]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const version = packageJson.version;

const browsers = {
  chrome: {
    ext: 'zip',
    outputName: `webhw-hardware-bridge-chrome-${version}.zip`
  },
  firefox: {
    ext: 'xpi',
    outputName: `webhw-hardware-bridge-firefox-${version}.xpi`
  }
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function packageBrowser(browser) {
  const config = browsers[browser];
  if (!config) {
    console.error(`Unsupported browser: ${browser}`);
    process.exit(1);
  }

  const nodeCmd = process.execPath;
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const sourceDir = path.join('build', browser);
  const artifactsDir = path.join('dist', 'extensions');

  console.log(`\n📦 Packaging ${browser} extension...`);

  fs.mkdirSync(path.join(projectRoot, artifactsDir), { recursive: true });

  run(nodeCmd, ['build-browser.js', browser], projectRoot);

  run(
    npxCmd,
    [
      'web-ext',
      'build',
      '--source-dir',
      sourceDir,
      '--artifacts-dir',
      artifactsDir,
      '--filename',
      config.outputName,
      '--overwrite-dest'
    ],
    projectRoot
  );

  console.log(`✅ Built ${config.outputName}`);
}

function main() {
  const target = process.argv[2] || 'all';

  if (target === 'all') {
    packageBrowser('chrome');
    packageBrowser('firefox');
    return;
  }

  packageBrowser(target);
}

main();
