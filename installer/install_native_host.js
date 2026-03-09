#!/usr/bin/env node

/**
 * WebHW Native Messaging Host Installer
 * Installs the native messaging host for WebHW Hardware Bridge
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
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
      } else if (arg === '--browsers' && args[i + 1]) {
        options.browsers = args[i + 1]
          .split(',')
          .map(browser => browser.trim().toLowerCase())
          .filter(Boolean);
        i++;
      } else if (arg.startsWith('--browsers=')) {
        options.browsers = arg
          .split('=')[1]
          .split(',')
          .map(browser => browser.trim().toLowerCase())
          .filter(Boolean);
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--open-guidance') {
        options.openGuidance = true;
      } else if (arg === '--no-open-guidance') {
        options.openGuidance = false;
      } else if (arg === '--cleanup-stale-manifests') {
        options.cleanupStaleManifests = true;
      } else if (arg === '--no-cleanup-stale-manifests') {
        options.cleanupStaleManifests = false;
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
        return path.join(homeDir, 'Applications', 'WebHW');

      case 'linux':
        return path.join(homeDir, '.local', 'share', 'webhw');

      case 'win32': // Windows
        return path.join(homeDir, 'AppData', 'Local', 'WebHW');

      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  getLegacyInstallDirs() {
    const homeDir = os.homedir();

    switch (this.platform) {
      case 'darwin':
        return [path.join(homeDir, 'Applications', 'D4AB')];

      case 'linux':
        return [path.join(homeDir, '.local', 'share', 'd4ab')];

      case 'win32':
        return [path.join(homeDir, 'AppData', 'Local', 'D4AB')];

      default:
        return [];
    }
  }

  getLegacyHostIdentifiers() {
    return ['com.d4ab.hardware_bridge'];
  }

  /**
   * Gets the native messaging host registry path
   */
  getHostRegistryPath(browser = 'chrome') {
    const paths = this.getHostRegistryPaths(browser);
    return paths[0];
  }

  /**
   * Gets all candidate native messaging host registry paths.
   */
  getHostRegistryPaths(browser = 'chrome') {
    const homeDir = os.homedir();

    switch (this.platform) {
      case 'darwin': // macOS
        if (browser === 'firefox') {
          return [path.join(homeDir, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts')];
        }
        return [path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts')];

      case 'linux':
        if (browser === 'firefox') {
          return [path.join(homeDir, '.mozilla', 'native-messaging-hosts')];
        }
        return this.getLinuxChromeHostRegistryPaths();

      case 'win32': // Windows
        if (browser === 'firefox') {
          return ['HKEY_CURRENT_USER\\Software\\Mozilla\\NativeMessagingHosts'];
        }
        return ['HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts'];

      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Returns Linux registry paths for Chrome/Chromium style browsers.
   */
  getLinuxChromeHostRegistryPaths() {
    const homeDir = os.homedir();
    const candidates = [
      {
        command: 'google-chrome',
        path: path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts')
      },
      {
        command: 'chromium',
        path: path.join(homeDir, '.config', 'chromium', 'NativeMessagingHosts')
      },
      {
        command: 'chromium-browser',
        path: path.join(homeDir, '.config', 'chromium-browser', 'NativeMessagingHosts')
      }
    ];

    const ordered = [];

    // Prefer browser commands that are installed on this machine.
    for (const candidate of candidates) {
      if (this.commandExists(candidate.command)) {
        ordered.push(candidate.path);
      }
    }

    // Include existing profile dirs so uninstall and re-install can cleanly update.
    for (const candidate of candidates) {
      if (fs.existsSync(candidate.path)) {
        ordered.push(candidate.path);
      }
    }

    const unique = [...new Set(ordered)];
    if (unique.length > 0) {
      return unique;
    }

    // Fallback path for first-time installs when no Chromium profile dir exists yet.
    return [candidates[0].path];
  }

  /**
   * Installs the native messaging host
   */
  async install() {
    console.log('Installing WebHW Native Messaging Host...');

    try {
      const selectedBrowsers = await this.resolveBrowserTargets();

      // Create installation directory
      await this.createInstallDir();

      // Install native bridge binary
      await this.installBinary();

      // Install dependencies
      await this.installDependencies();

      // Clean up old D4AB registration paths so upgrades do not leave stale host entries.
      await this.cleanupLegacyHostRegistrations();

      // Register native messaging host
      await this.registerHost(selectedBrowsers);

      // Remove stale manifests/registry entries when browser selection changes.
      if (this.shouldCleanupStaleManifests()) {
        await this.cleanupStaleHostRegistrations(selectedBrowsers);
      }

      console.log('✅ Installation complete!');
      console.log(`📁 Installed to: ${this.installDir}`);
      if (selectedBrowsers.length > 0) {
        console.log(`🔌 Native messaging host registered for: ${selectedBrowsers.join(', ')}`);
      } else {
        console.log('⚠️  Native messaging host was not registered for any browser.');
      }

      // Print next steps
      this.printNextSteps(selectedBrowsers);

      // Best-effort browser guidance pages for local extension loading.
      if (this.shouldOpenGuidancePages()) {
        this.openBrowserGuidancePages(selectedBrowsers);
      }

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
    if (this.platform === 'win32') {
      this.createWindowsLauncherScript();
    } else {
      this.createFirefoxLauncherScript();
    }

    console.log('✅ Binary installed');
  }

  /**
   * Creates Firefox native host launcher script with explicit Node resolution.
   */
  createFirefoxLauncherScript() {
    const launcherPath = path.join(this.installDir, 'webhw-bridge.sh');
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
   * Creates Windows launcher script with explicit Node resolution.
   */
  createWindowsLauncherScript() {
    const launcherPath = path.join(this.installDir, 'webhw-bridge.cmd');
    const script = `@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "LOG_DIR=%SCRIPT_DIR%logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "NODE_BIN="
for %%I in (node.exe) do set "NODE_BIN=%%~$PATH:I"

if not defined NODE_BIN if exist "%ProgramFiles%\\nodejs\\node.exe" set "NODE_BIN=%ProgramFiles%\\nodejs\\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\\nodejs\\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\\nodejs\\node.exe"

if not defined NODE_BIN (
  echo %DATE% %TIME%: node executable not found>>"%LOG_DIR%\\windows_launch.log"
  exit /b 1
)

echo %DATE% %TIME%: launching native host with "%NODE_BIN%">>"%LOG_DIR%\\windows_launch.log"
"%NODE_BIN%" "%SCRIPT_DIR%src\\bridge_cli.js" %* 1>>"%LOG_DIR%\\windows_launch.log" 2>&1
`;

    fs.writeFileSync(launcherPath, script);
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
  async registerHost(selectedBrowsers = ['chrome', 'firefox']) {
    return this.registerHostForBrowsers(selectedBrowsers);
  }

  /**
   * Registers the native messaging host for the selected browsers.
   */
  async registerHostForBrowsers(selectedBrowsers = []) {
    console.log('🔌 Registering native messaging host...');

    if (!Array.isArray(selectedBrowsers) || selectedBrowsers.length === 0) {
      console.log('⚠️  No browser target selected. Skipping host registration.');
      return;
    }

    if (this.platform === 'win32') {
      for (const browser of selectedBrowsers) {
        await this.registerHostWindows(browser);
      }
    } else {
      for (const browser of selectedBrowsers) {
        await this.registerHostUnix(browser);
      }
    }

    console.log(`✅ Native messaging host registered for: ${selectedBrowsers.join(', ')}`);
  }

  /**
   * Determines which installed browsers should receive native host registration.
   */
  async resolveBrowserTargets() {
    const supportedBrowsers = ['firefox', 'chrome'];
    const detected = this.detectInstalledBrowsers();

    this.printDetectedBrowsers(detected);

    if (Array.isArray(this.cliOptions.browsers)) {
      const selectedFromCli = this.cliOptions.browsers.filter(browser => supportedBrowsers.includes(browser));
      const unknown = this.cliOptions.browsers.filter(browser => !supportedBrowsers.includes(browser));

      if (unknown.length > 0) {
        console.warn(`⚠️  Ignoring unsupported browser targets: ${unknown.join(', ')}`);
      }

      if (selectedFromCli.length === 0) {
        return [];
      }

      const unavailable = selectedFromCli.filter(browser => !detected[browser]);
      if (unavailable.length > 0) {
        console.warn(`⚠️  Selected browsers are not detected as installed: ${unavailable.join(', ')}`);
      }

      return selectedFromCli;
    }

    if (!this.cliOptions.nonInteractive && process.stdin.isTTY) {
      return this.promptBrowserSelection(detected);
    }

    // Default policy: prioritize Firefox; keep Chrome disabled unless explicitly selected.
    if (detected.firefox) {
      console.log('ℹ️  Defaulting to Firefox registration. Chrome remains disabled by default.');
      return ['firefox'];
    }

    if (detected.chrome) {
      console.log('ℹ️  Chrome detected but disabled by default. Re-run with --browsers chrome to enable it.');
    }

    return [];
  }

  /**
   * Detects installed browsers across supported platforms.
   */
  detectInstalledBrowsers() {
    const detected = {
      firefox: false,
      chrome: false,
      safari: false
    };

    if (this.platform === 'darwin') {
      detected.firefox = this.anyPathExists([
        '/Applications/Firefox.app',
        path.join(os.homedir(), 'Applications', 'Firefox.app')
      ]) || this.commandExists('firefox');

      detected.chrome = this.anyPathExists([
        '/Applications/Google Chrome.app',
        path.join(os.homedir(), 'Applications', 'Google Chrome.app')
      ]) || this.commandExists('google-chrome');

      detected.safari = this.anyPathExists(['/Applications/Safari.app']);
      return detected;
    }

    if (this.platform === 'linux') {
      detected.firefox = this.commandExists('firefox');
      detected.chrome = this.commandExists('google-chrome') || this.commandExists('chromium') || this.commandExists('chromium-browser');
      return detected;
    }

    if (this.platform === 'win32') {
      detected.firefox = this.anyPathExists([
        'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
        'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
      ]);
      detected.chrome = this.anyPathExists([
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      ]);
    }

    return detected;
  }

  /**
   * Prompt for browser selection with conservative defaults.
   */
  async promptBrowserSelection(detected) {
    const selected = [];

    if (!detected.firefox && !detected.chrome) {
      console.log('⚠️  No supported browsers detected for automatic registration.');
      return selected;
    }

    if (detected.safari) {
      console.log('ℹ️  Safari detected. Native host registration for Safari is not implemented yet.');
    }

    const includeFirefox = detected.firefox
      ? await this.promptYesNo('Register Firefox native host? [Y/n] ', true)
      : false;

    if (includeFirefox) {
      selected.push('firefox');
    }

    const includeChrome = detected.chrome
      ? await this.promptYesNo('Register Chrome native host? [y/N] ', false)
      : false;

    if (includeChrome) {
      selected.push('chrome');
    }

    return selected;
  }

  /**
   * Prints browser availability to help users decide installation targets.
   */
  printDetectedBrowsers(detected) {
    const availability = browser => detected[browser] ? 'found' : 'not found';
    console.log('🔎 Browser detection:');
    console.log(`   • Firefox: ${availability('firefox')} (recommended)`);
    console.log(`   • Chrome: ${availability('chrome')} (disabled by default)`);

    if (this.platform === 'darwin') {
      console.log(`   • Safari: ${availability('safari')} (informational only for now)`);
    }
  }

  commandExists(command) {
    try {
      execSync(`command -v ${command}`, { stdio: 'pipe' });
      return true;
    } catch (error) {
      return false;
    }
  }

  anyPathExists(paths) {
    return paths.some(candidatePath => fs.existsSync(candidatePath));
  }

  promptYesNo(question, defaultAnswer) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        const normalized = (answer || '').trim().toLowerCase();
        if (!normalized) {
          resolve(defaultAnswer);
          return;
        }

        resolve(normalized === 'y' || normalized === 'yes');
      });
    });
  }

  shouldOpenGuidancePages() {
    if (typeof this.cliOptions.openGuidance === 'boolean') {
      return this.cliOptions.openGuidance;
    }

    // Keep non-interactive installs automation-friendly by default.
    return !this.cliOptions.nonInteractive;
  }

  shouldCleanupStaleManifests() {
    if (typeof this.cliOptions.cleanupStaleManifests === 'boolean') {
      return this.cliOptions.cleanupStaleManifests;
    }

    return true;
  }

  openBrowserGuidancePages(selectedBrowsers = []) {
    const urls = [];

    if (selectedBrowsers.includes('firefox')) {
      urls.push('about:debugging#/runtime/this-firefox');
    }

    if (selectedBrowsers.includes('chrome')) {
      urls.push('chrome://extensions');
    }

    if (urls.length === 0) {
      return;
    }

    console.log('🧭 Opening local extension setup guidance pages...');
    for (const url of urls) {
      if (this.openUrl(url)) {
        console.log(`✅ Opened: ${url}`);
      } else {
        console.log(`⚠️  Could not open automatically: ${url}`);
      }
    }
  }

  openUrl(url) {
    try {
      if (this.platform === 'darwin') {
        execSync(`open "${url}"`, { stdio: 'pipe' });
        return true;
      }

      if (this.platform === 'linux') {
        execSync(`xdg-open "${url}"`, { stdio: 'pipe' });
        return true;
      }

      if (this.platform === 'win32') {
        execSync(`cmd /c start "" "${url}"`, { stdio: 'pipe' });
        return true;
      }
    } catch (error) {
      return false;
    }

    return false;
  }

  /**
   * Creates the native messaging host manifest
   */
  createHostManifest(browser) {
    let binaryPath;

    if (this.platform === 'win32') {
      binaryPath = path.join(this.installDir, 'webhw-bridge.cmd');
    } else if (browser === 'firefox') {
      binaryPath = path.join(this.installDir, 'webhw-bridge.sh');
    } else {
      binaryPath = path.join(this.installDir, 'src', 'bridge_cli.js');
    }

    const manifest = {
      name: 'com.webhw.hardware_bridge',
      description: 'WebHW Hardware Bridge Native Messaging Host',
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
    const configuredId = this.cliOptions.chromeExtensionId || process.env.WEBHW_CHROME_EXTENSION_ID;
    if (configuredId) {
      return configuredId;
    }

    if (this.cliOptions.allowPlaceholderIds) {
      console.warn('⚠️  Chrome extension ID not provided. Using placeholder EXTENSION_ID.');
      console.warn('   Provide --chrome-extension-id <id> or WEBHW_CHROME_EXTENSION_ID env var for a working install.');
      return 'EXTENSION_ID';
    }

    throw new Error(
      'Chrome extension ID is required. Provide --chrome-extension-id <id> or set WEBHW_CHROME_EXTENSION_ID. ' +
      'Use --allow-placeholder-ids only for local scaffolding.'
    );
  }

  getFirefoxExtensionId() {
    const configuredId = this.cliOptions.firefoxExtensionId || process.env.WEBHW_FIREFOX_EXTENSION_ID;
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

    console.warn('⚠️  Firefox extension ID not provided. Using placeholder webhw-bridge@webhw.dev.');
    return 'webhw-bridge@webhw.dev';
  }

  /**
   * Registers native messaging host on Unix systems (macOS/Linux)
   */
  async registerHostUnix(browser = 'chrome') {
    const manifest = this.createHostManifest(browser);
    const hostDirs = this.getHostRegistryPaths(browser);

    for (const hostDir of hostDirs) {
      if (!fs.existsSync(hostDir)) {
        fs.mkdirSync(hostDir, { recursive: true });
      }

      const manifestPath = path.join(hostDir, 'com.webhw.hardware_bridge.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      console.log(`✅ Host manifest written to: ${manifestPath}`);
    }

    // Make sure the binary is executable
    const binaryPath = manifest.path;
    if (fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, '755');
    }
  }

  /**
   * Removes stale host registration for browsers that were not selected.
   */
  async cleanupStaleHostRegistrations(selectedBrowsers = []) {
    const supportedBrowsers = ['firefox', 'chrome'];
    const staleBrowsers = supportedBrowsers.filter(browser => !selectedBrowsers.includes(browser));

    if (staleBrowsers.length === 0) {
      return;
    }

    console.log(`🧹 Cleaning stale host registrations for: ${staleBrowsers.join(', ')}`);

    if (this.platform === 'win32') {
      for (const browser of staleBrowsers) {
        const baseKey = browser === 'firefox'
          ? 'HKEY_CURRENT_USER\\Software\\Mozilla\\NativeMessagingHosts'
          : 'HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts';
        const regKey = `${baseKey}\\com.webhw.hardware_bridge`;

        try {
          execSync(`reg delete "${regKey}" /f`, { stdio: 'pipe' });
          console.log(`✅ Removed stale registry key: ${regKey}`);
        } catch (error) {
          // Ignore when key does not exist.
        }
      }

      return;
    }

    for (const browser of staleBrowsers) {
      for (const hostDir of this.getHostRegistryPaths(browser)) {
        const manifestPath = path.join(hostDir, 'com.webhw.hardware_bridge.json');
        if (fs.existsSync(manifestPath)) {
          fs.unlinkSync(manifestPath);
          console.log(`✅ Removed stale host manifest: ${manifestPath}`);
        }
      }
    }
  }

  async cleanupLegacyHostRegistrations() {
    const legacyIds = this.getLegacyHostIdentifiers();

    if (legacyIds.length === 0) {
      return;
    }

    console.log('🧹 Checking for legacy D4AB host registrations...');

    if (this.platform === 'win32') {
      const baseKeys = [
        'HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts',
        'HKEY_CURRENT_USER\\Software\\Mozilla\\NativeMessagingHosts'
      ];

      for (const baseKey of baseKeys) {
        for (const legacyId of legacyIds) {
          const regKey = `${baseKey}\\${legacyId}`;
          try {
            execSync(`reg delete "${regKey}" /f`, { stdio: 'pipe' });
            console.log(`✅ Removed legacy registry key: ${regKey}`);
          } catch (error) {
            // Ignore when key does not exist.
          }
        }
      }
    } else {
      for (const browser of ['chrome', 'firefox']) {
        for (const hostDir of this.getHostRegistryPaths(browser)) {
          for (const legacyId of legacyIds) {
            const legacyManifestPath = path.join(hostDir, `${legacyId}.json`);
            if (fs.existsSync(legacyManifestPath)) {
              fs.unlinkSync(legacyManifestPath);
              console.log(`✅ Removed legacy host manifest: ${legacyManifestPath}`);
            }
          }
        }
      }
    }

    for (const legacyInstallDir of this.getLegacyInstallDirs()) {
      if (legacyInstallDir !== this.installDir && fs.existsSync(legacyInstallDir)) {
        fs.rmSync(legacyInstallDir, { recursive: true, force: true });
        console.log(`✅ Removed legacy install directory: ${legacyInstallDir}`);
      }
    }
  }

  /**
   * Registers native messaging host on Windows
   */
  async registerHostWindows(browser = 'chrome') {
    const manifest = this.createHostManifest(browser);

    // For Windows, we need to write to the registry
    const manifestFilename = browser === 'firefox'
      ? 'com.webhw.hardware_bridge.firefox.json'
      : 'com.webhw.hardware_bridge.chrome.json';
    const manifestPath = path.join(this.installDir, manifestFilename);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Create registry entry
    const baseKey = browser === 'firefox'
      ? 'HKEY_CURRENT_USER\\\\Software\\\\Mozilla\\\\NativeMessagingHosts'
      : 'HKEY_CURRENT_USER\\\\Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts';
    const regKey = `${baseKey}\\\\com.webhw.hardware_bridge`;

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
  printNextSteps(selectedBrowsers = []) {
    console.log('\n🚀 Next Steps:');
    console.log('1. Load the browser extension in the browsers you selected');
    console.log('2. The extension will automatically connect to the native bridge');
    console.log('3. Visit a WebUSB/WebSerial enabled website to test');

    if (selectedBrowsers.includes('firefox')) {
      console.log('   • Firefox extension loader: about:debugging#/runtime/this-firefox');
    }
    if (selectedBrowsers.includes('chrome')) {
      console.log('   • Chrome extension loader: chrome://extensions');
    }
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
    console.log('Uninstalling WebHW Native Messaging Host...');

    try {
      // Remove installation directory
      if (fs.existsSync(this.installDir)) {
        fs.rmSync(this.installDir, { recursive: true });
        console.log('✅ Installation directory removed');
      }

      // Remove host registration
      if (this.platform === 'win32') {
        try {
          execSync('reg delete "HKEY_CURRENT_USER\\\\Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts\\\\com.webhw.hardware_bridge" /f', { stdio: 'pipe' });
          execSync('reg delete "HKEY_CURRENT_USER\\\\Software\\\\Mozilla\\\\NativeMessagingHosts\\\\com.webhw.hardware_bridge" /f', { stdio: 'pipe' });
          console.log('✅ Registry entry removed');
        } catch (error) {
          console.warn('⚠️  Could not remove registry entry');
        }
      } else {
        const manifestPaths = [];

        for (const hostDir of this.getHostRegistryPaths('chrome')) {
          manifestPaths.push(path.join(hostDir, 'com.webhw.hardware_bridge.json'));
        }

        for (const hostDir of this.getHostRegistryPaths('firefox')) {
          manifestPaths.push(path.join(hostDir, 'com.webhw.hardware_bridge.json'));
        }

        for (const manifestPath of [...new Set(manifestPaths)]) {
          if (fs.existsSync(manifestPath)) {
            fs.unlinkSync(manifestPath);
            console.log(`✅ Host manifest removed: ${manifestPath}`);
          }
        }
      }

      await this.cleanupLegacyHostRegistrations();

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

    case 'list-browsers':
      installer.printDetectedBrowsers(installer.detectInstalledBrowsers());
      break;

    case 'uninstall':
      installer.uninstall();
      break;

    default:
      console.log('WebHW Native Messaging Host Installer');
      console.log('');
      console.log('Usage:');
      console.log('  node install_native_host.js install     - Install the native messaging host');
      console.log('  node install_native_host.js uninstall   - Uninstall the native messaging host');
      console.log('  node install_native_host.js list-browsers - Show detected browsers');
      console.log('');
      console.log('Install options:');
      console.log('  --browsers firefox,chrome   Explicit browser targets');
      console.log('  --non-interactive           Skip prompts and apply defaults');
      console.log('  --open-guidance             Open browser extension setup pages after install');
      console.log('  --no-open-guidance          Disable automatic browser guidance page opening');
      console.log('  --cleanup-stale-manifests   Remove stale browser host manifests (default)');
      console.log('  --no-cleanup-stale-manifests Keep stale browser host manifests');
      console.log('');
  }
}

module.exports = NativeHostInstaller;