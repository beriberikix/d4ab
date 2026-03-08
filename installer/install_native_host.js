#!/usr/bin/env node

/**
 * D4AB Native Messaging Host Installer
 * Installs the native messaging host for D4AB Hardware Bridge
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class NativeHostInstaller {
  constructor() {
    this.platform = os.platform();
    this.installDir = this.getInstallDir();
    this.projectRoot = path.join(__dirname, '..');
    this.cliOptions = this.parseCliOptions();
  }

  parseCliOptions() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--chrome-extension-id' && args[i + 1]) {
        options.chromeExtensionId = args[i + 1];
        i++;
      } else if (arg.startsWith('--chrome-extension-id=')) {
        options.chromeExtensionId = arg.split('=')[1];
      } else if (arg === '--firefox-extension-id' && args[i + 1]) {
        options.firefoxExtensionId = args[i + 1];
        i++;
      } else if (arg.startsWith('--firefox-extension-id=')) {
        options.firefoxExtensionId = arg.split('=')[1];
      } else if (arg === '--allow-placeholder-ids') {
        options.allowPlaceholderIds = true;
      }
    }

    return options;
  }

  /**
   * Gets the installation directory based on platform
   */
  getInstallDir() {
    const homeDir = os.homedir();

    switch (this.platform) {
      case 'darwin': // macOS
        return path.join(homeDir, 'Applications', 'D4AB');

      case 'linux':
        return path.join(homeDir, '.local', 'share', 'd4ab');

      case 'win32': // Windows
        return path.join(homeDir, 'AppData', 'Local', 'D4AB');

      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Gets the native messaging host registry path
   */
  getHostRegistryPath(browser = 'chrome') {
    const homeDir = os.homedir();

    switch (this.platform) {
      case 'darwin': // macOS
        if (browser === 'firefox') {
          return path.join(homeDir, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts');
        }
        return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');

      case 'linux':
        if (browser === 'firefox') {
          return path.join(homeDir, '.mozilla', 'native-messaging-hosts');
        }
        return path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts');

      case 'win32': // Windows
        if (browser === 'firefox') {
          return 'HKEY_CURRENT_USER\\Software\\Mozilla\\NativeMessagingHosts';
        }
        return 'HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts';

      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Installs the native messaging host
   */
  async install() {
    console.log('Installing D4AB Native Messaging Host...');

    try {
      // Create installation directory
      await this.createInstallDir();

      // Install native bridge binary
      await this.installBinary();

      // Install dependencies
      await this.installDependencies();

      // Register native messaging host
      await this.registerHost();

      console.log('✅ Installation complete!');
      console.log(`📁 Installed to: ${this.installDir}`);
      console.log('🔌 Native messaging host registered');

      // Print next steps
      this.printNextSteps();

    } catch (error) {
      console.error('❌ Installation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Creates the installation directory
   */
  async createInstallDir() {
    console.log(`📁 Creating installation directory: ${this.installDir}`);

    if (!fs.existsSync(this.installDir)) {
      fs.mkdirSync(this.installDir, { recursive: true });
    }

    // Create logs directory
    const logsDir = path.join(this.installDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  /**
   * Installs the native bridge binary
   */
  async installBinary() {
    console.log('📦 Installing native bridge binary...');

    const backendDir = path.join(__dirname, '..', 'backend');
    const targetDir = this.installDir;

    // Copy package.json
    const packageJson = path.join(backendDir, 'package.json');
    const targetPackageJson = path.join(targetDir, 'package.json');
    fs.copyFileSync(packageJson, targetPackageJson);

    // Copy src directory
    const srcDir = path.join(backendDir, 'src');
    const targetSrcDir = path.join(targetDir, 'src');

    if (fs.existsSync(targetSrcDir)) {
      fs.rmSync(targetSrcDir, { recursive: true });
    }

    this.copyDirectory(srcDir, targetSrcDir);

    // Create a robust Firefox launcher so native host startup works even when
    // browser environment PATH does not include Node.js.
    this.createFirefoxLauncherScript();

    console.log('✅ Binary installed');
  }

  /**
   * Creates Firefox native host launcher script with explicit Node resolution.
   */
  createFirefoxLauncherScript() {
    const launcherPath = path.join(this.installDir, 'd4ab-bridge.sh');
    const script = `#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

NODE_BIN="$(command -v node 2>/dev/null)"
if [[ -z "$NODE_BIN" && -x "/opt/homebrew/bin/node" ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi
if [[ -z "$NODE_BIN" && -x "/usr/local/bin/node" ]]; then
  NODE_BIN="/usr/local/bin/node"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "$(date): node executable not found" >> "$LOG_DIR/firefox_launch.log"
  exit 1
fi

echo "$(date): launching native host with $NODE_BIN" >> "$LOG_DIR/firefox_launch.log"
exec "$NODE_BIN" "$SCRIPT_DIR/src/bridge_cli.js" "$@" 2>>"$LOG_DIR/firefox_launch.log"
`;

    fs.writeFileSync(launcherPath, script, { mode: 0o755 });
  }

  /**
   * Installs Node.js dependencies
   */
  async installDependencies() {
    console.log('📦 Installing Node.js dependencies...');

    try {
      process.chdir(this.installDir);
      execSync('npm install --production', { stdio: 'pipe' });
      console.log('✅ Dependencies installed');
    } catch (error) {
      throw new Error(`Failed to install dependencies: ${error.message}`);
    }
  }

  /**
   * Registers the native messaging host
   */
  async registerHost() {
    console.log('🔌 Registering native messaging host...');

    if (this.platform === 'win32') {
      await this.registerHostWindows('chrome');
      await this.registerHostWindows('firefox');
    } else {
      // Register for both Chrome and Firefox
      await this.registerHostUnix('chrome');
      await this.registerHostUnix('firefox');
    }

    console.log('✅ Native messaging host registered for Chrome and Firefox');
  }

  /**
   * Creates the native messaging host manifest
   */
  createHostManifest(browser) {
    const binaryPath = browser === 'firefox'
      ? path.join(this.installDir, 'd4ab-bridge.sh')
      : path.join(this.installDir, 'src', 'bridge_cli.js');
    const manifest = {
      name: 'com.d4ab.hardware_bridge',
      description: 'D4AB Hardware Bridge Native Messaging Host',
      path: binaryPath,
      type: 'stdio'
    };

    if (browser === 'firefox') {
      manifest.allowed_extensions = [this.getFirefoxExtensionId()];
    } else {
      manifest.allowed_origins = [
        `chrome-extension://${this.getChromeExtensionId()}/`
      ];
    }

    return manifest;
  }

  getChromeExtensionId() {
    const configuredId = this.cliOptions.chromeExtensionId || process.env.D4AB_CHROME_EXTENSION_ID;
    if (configuredId) {
      return configuredId;
    }

    if (this.cliOptions.allowPlaceholderIds) {
      console.warn('⚠️  Chrome extension ID not provided. Using placeholder EXTENSION_ID.');
      console.warn('   Provide --chrome-extension-id <id> or D4AB_CHROME_EXTENSION_ID env var for a working install.');
      return 'EXTENSION_ID';
    }

    throw new Error(
      'Chrome extension ID is required. Provide --chrome-extension-id <id> or set D4AB_CHROME_EXTENSION_ID. ' +
      'Use --allow-placeholder-ids only for local scaffolding.'
    );
  }

  getFirefoxExtensionId() {
    const configuredId = this.cliOptions.firefoxExtensionId || process.env.D4AB_FIREFOX_EXTENSION_ID;
    if (configuredId) {
      return configuredId;
    }

    try {
      const manifestPath = path.join(this.projectRoot, 'frontend', 'manifest-firefox.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const geckoId = manifest?.applications?.gecko?.id;
      if (geckoId) {
        return geckoId;
      }
    } catch (error) {
      console.warn('⚠️  Could not read Firefox extension ID from frontend/manifest-firefox.json');
    }

    console.warn('⚠️  Firefox extension ID not provided. Using placeholder d4ab-bridge@d4ab.com.');
    return 'd4ab-bridge@d4ab.com';
  }

  /**
   * Registers native messaging host on Unix systems (macOS/Linux)
   */
  async registerHostUnix(browser = 'chrome') {
    const manifest = this.createHostManifest(browser);
    const hostDir = this.getHostRegistryPath(browser);

    if (!fs.existsSync(hostDir)) {
      fs.mkdirSync(hostDir, { recursive: true });
    }

    const manifestPath = path.join(hostDir, 'com.d4ab.hardware_bridge.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Make sure the binary is executable
    const binaryPath = manifest.path;
    if (fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, '755');
    }

    console.log(`✅ Host manifest written to: ${manifestPath}`);
  }

  /**
   * Registers native messaging host on Windows
   */
  async registerHostWindows(browser = 'chrome') {
    const manifest = this.createHostManifest(browser);

    // For Windows, we need to write to the registry
    const manifestFilename = browser === 'firefox'
      ? 'com.d4ab.hardware_bridge.firefox.json'
      : 'com.d4ab.hardware_bridge.chrome.json';
    const manifestPath = path.join(this.installDir, manifestFilename);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Create registry entry
    const baseKey = browser === 'firefox'
      ? 'HKEY_CURRENT_USER\\\\Software\\\\Mozilla\\\\NativeMessagingHosts'
      : 'HKEY_CURRENT_USER\\\\Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts';
    const regKey = `${baseKey}\\\\com.d4ab.hardware_bridge`;

    try {
      execSync(`reg add "${regKey}" /ve /d "${manifestPath}" /f`, { stdio: 'pipe' });
      console.log('✅ Registry entry created');
    } catch (error) {
      console.warn(`⚠️  Could not create ${browser} registry entry automatically.`);
      console.log('📝 Manual registry setup required:');
      console.log(`   Key: ${regKey}`);
      console.log(`   Value: ${manifestPath}`);
    }
  }

  /**
   * Copies a directory recursively
   */
  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Prints next steps for the user
   */
  printNextSteps() {
    console.log('\n🚀 Next Steps:');
    console.log('1. Load the browser extension in Chrome/Firefox');
    console.log('2. The extension will automatically connect to the native bridge');
    console.log('3. Visit a WebUSB/WebSerial enabled website to test');
    console.log('\n🔍 Troubleshooting:');
    console.log(`   • Check logs in: ${path.join(this.installDir, 'logs')}`);
    console.log('   • Ensure your browser allows the extension');
    console.log('   • For Windows: Restart browser after installation');

    if (this.platform === 'darwin') {
      console.log('   • For macOS: Grant accessibility permissions if prompted');
    }

    if (this.platform === 'linux') {
      console.log('   • For Linux: Ensure udev rules are configured for USB access');
      console.log('   • Add user to dialout group for serial port access: sudo usermod -a -G dialout $USER');
    }
  }

  /**
   * Uninstalls the native messaging host
   */
  async uninstall() {
    console.log('Uninstalling D4AB Native Messaging Host...');

    try {
      // Remove installation directory
      if (fs.existsSync(this.installDir)) {
        fs.rmSync(this.installDir, { recursive: true });
        console.log('✅ Installation directory removed');
      }

      // Remove host registration
      if (this.platform === 'win32') {
        try {
          execSync('reg delete "HKEY_CURRENT_USER\\\\Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts\\\\com.d4ab.hardware_bridge" /f', { stdio: 'pipe' });
          execSync('reg delete "HKEY_CURRENT_USER\\\\Software\\\\Mozilla\\\\NativeMessagingHosts\\\\com.d4ab.hardware_bridge" /f', { stdio: 'pipe' });
          console.log('✅ Registry entry removed');
        } catch (error) {
          console.warn('⚠️  Could not remove registry entry');
        }
      } else {
        const manifestPaths = [
          path.join(this.getHostRegistryPath('chrome'), 'com.d4ab.hardware_bridge.json'),
          path.join(this.getHostRegistryPath('firefox'), 'com.d4ab.hardware_bridge.json')
        ];

        for (const manifestPath of manifestPaths) {
          if (fs.existsSync(manifestPath)) {
            fs.unlinkSync(manifestPath);
            console.log(`✅ Host manifest removed: ${manifestPath}`);
          }
        }
      }

      console.log('✅ Uninstallation complete!');

    } catch (error) {
      console.error('❌ Uninstallation failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const installer = new NativeHostInstaller();

  const command = process.argv[2];

  switch (command) {
    case 'install':
      installer.install();
      break;

    case 'uninstall':
      installer.uninstall();
      break;

    default:
      console.log('D4AB Native Messaging Host Installer');
      console.log('');
      console.log('Usage:');
      console.log('  node install_native_host.js install     - Install the native messaging host');
      console.log('  node install_native_host.js uninstall   - Uninstall the native messaging host');
      console.log('');
  }
}

module.exports = NativeHostInstaller;