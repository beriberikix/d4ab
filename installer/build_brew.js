#!/usr/bin/env node

/**
 * WebHW Homebrew Builder
 * Generates local Homebrew formula and source tarball for macOS/Linux installs.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class BrewBuilder {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || path.resolve(__dirname, '..');
    this.buildDir = options.buildDir || path.join(this.projectRoot, 'dist');
    this.version = options.version || this.getVersion();
    this.outputDir = path.join(this.buildDir, 'homebrew');
    this.formulaDir = path.join(this.outputDir, 'Formula');
    this.stageName = `webhw-hardware-bridge-${this.version}`;
    this.stageDir = path.join(this.outputDir, this.stageName);
    this.tarballPath = path.join(this.outputDir, `${this.stageName}.tar.gz`);
    this.formulaPath = path.join(this.formulaDir, 'webhw-hardware-bridge.rb');
  }

  getVersion() {
    try {
      const packagePath = path.join(this.projectRoot, 'backend', 'package.json');
      const packageData = JSON.parse(fsSync.readFileSync(packagePath, 'utf8'));
      return packageData.version || '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  async build() {
    console.log('🍺 Building Homebrew artifacts...');

    await this.prepareDirectories();
    await this.stageInstallSources();
    await this.createTarball();
    const sha256 = await this.computeSha256(this.tarballPath);
    await this.writeFormula(sha256);

    console.log('✅ Homebrew artifacts generated');
    console.log(`   • Tarball: ${this.tarballPath}`);
    console.log(`   • Formula: ${this.formulaPath}`);
    console.log('');
    console.log('Next steps:');
    console.log('  brew tap-new webhw/local --no-git  # one-time setup');
    console.log('  mkdir -p "$(brew --repo webhw/local)/Formula"');
    console.log(`  cp "${this.formulaPath}" "$(brew --repo webhw/local)/Formula/webhw-hardware-bridge.rb"`);
    console.log('  brew reinstall --build-from-source webhw/local/webhw-hardware-bridge || brew install --build-from-source webhw/local/webhw-hardware-bridge');
    console.log('  webhw-install-native-host install');
  }

  async prepareDirectories() {
    await fs.mkdir(this.formulaDir, { recursive: true });

    // Keep other dist outputs, only refresh Homebrew assets.
    await fs.rm(this.stageDir, { recursive: true, force: true });
    await fs.rm(this.tarballPath, { force: true });
  }

  async stageInstallSources() {
    await fs.mkdir(this.stageDir, { recursive: true });

    const stageBackendDir = path.join(this.stageDir, 'backend');
    const stageInstallerDir = path.join(this.stageDir, 'installer');
    const stageFrontendDir = path.join(this.stageDir, 'frontend');

    await this.copyDirectory(path.join(this.projectRoot, 'backend', 'src'), path.join(stageBackendDir, 'src'));
    await this.copyFile(path.join(this.projectRoot, 'backend', 'package.json'), path.join(stageBackendDir, 'package.json'));

    const backendLockPath = path.join(this.projectRoot, 'backend', 'package-lock.json');
    if (fsSync.existsSync(backendLockPath)) {
      await this.copyFile(backendLockPath, path.join(stageBackendDir, 'package-lock.json'));
    }

    await this.copyFile(
      path.join(this.projectRoot, 'installer', 'install_native_host.js'),
      path.join(stageInstallerDir, 'install_native_host.js')
    );

    await this.copyFile(
      path.join(this.projectRoot, 'frontend', 'manifest-firefox.json'),
      path.join(stageFrontendDir, 'manifest-firefox.json')
    );
  }

  async createTarball() {
    const command = `tar -czf "${this.tarballPath}" -C "${this.outputDir}" "${this.stageName}"`;
    execSync(command, { stdio: 'inherit' });
  }

  async computeSha256(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async writeFormula(sha256) {
    const url = `file://${this.tarballPath}`;
    const formula = `class WebhwHardwareBridge < Formula
  desc "Native hardware bridge for WebHW browser extension"
  homepage "https://github.com/beriberikix/webhw"
  url "${url}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["backend", "installer", "frontend"]

    chmod 0755, libexec/"installer/install_native_host.js"
    chmod 0755, libexec/"backend/src/bridge_cli.js"

    (bin/"webhw-install-native-host").write_env_script(libexec/"installer/install_native_host.js", {})
    (bin/"webhw-bridge").write_env_script(libexec/"backend/src/bridge_cli.js", {})
  end

  def caveats
    <<~EOS
      Run browser registration after install:
        webhw-install-native-host install

      Browser selection defaults:
      - Firefox is selected by default if detected.
      - Chrome is detected but disabled by default.

      To explicitly enable Chrome:
        webhw-install-native-host install --browsers firefox,chrome
    EOS
  end
end
`;

    await fs.writeFile(this.formulaPath, formula);
  }

  async copyFile(src, dest) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await this.copyFile(srcPath, destPath);
      }
    }
  }
}

if (require.main === module) {
  const builder = new BrewBuilder();
  builder.build().catch(error => {
    console.error('❌ Brew build failed:', error.message);
    process.exit(1);
  });
}

module.exports = BrewBuilder;
