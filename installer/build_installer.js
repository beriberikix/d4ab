#!/usr/bin/env node

/**
 * D4AB Hardware Bridge - Cross-Platform Installer Builder
 * Creates platform-specific installers for the hardware bridge
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const BrewBuilder = require('./build_brew');

class InstallerBuilder {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.projectRoot = path.resolve(__dirname, '..');
    this.buildDir = path.join(this.projectRoot, 'dist');
    this.version = this.getVersion();
    this.target = null;

    this.config = {
      name: 'D4AB Hardware Bridge',
      identifier: 'com.d4ab.hardware-bridge',
      description: 'Hardware access bridge for web applications',
      author: 'D4AB Project',
      homepage: 'https://d4ab.dev',
      license: 'MIT',
      category: 'Developer Tools'
    };
  }

  /**
   * Gets version from package.json
   */
  getVersion() {
    try {
      const packagePath = path.join(this.projectRoot, 'backend', 'package.json');
      const packageData = require(packagePath);
      return packageData.version || '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  /**
   * Main build process
   */
  async build() {
    if (this.target === 'brew') {
      console.log('Building Homebrew package artifacts...');

      try {
        await this.buildBrewPackage();
        console.log('✅ Homebrew package build completed successfully!');
      } catch (error) {
        console.error('❌ Installer build failed:', error.message);
        process.exit(1);
      }

      return;
    }

    console.log(`Building installer for ${this.platform}-${this.arch}...`);

    try {
      await this.prepareBuildEnvironment();
      await this.buildBackend();
      await this.buildFrontend();

      switch (this.platform) {
        case 'win32':
          await this.buildWindowsInstaller();
          break;
        case 'darwin':
          await this.buildMacInstaller();
          break;
        case 'linux':
          await this.buildLinuxInstaller();
          break;
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }

      console.log('✅ Installer build completed successfully!');

    } catch (error) {
      console.error('❌ Installer build failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Builds Homebrew formula and local source artifacts.
   */
  async buildBrewPackage() {
    const brewBuilder = new BrewBuilder({
      projectRoot: this.projectRoot,
      buildDir: this.buildDir,
      version: this.version
    });

    await brewBuilder.build();
  }

  /**
   * Prepares build environment
   */
  async prepareBuildEnvironment() {
    console.log('📁 Preparing build environment...');

    // Create build directory
    await this.ensureDirectory(this.buildDir);

    // Clean previous builds
    await this.cleanDirectory(this.buildDir);

    // Create platform-specific directories
    const platformDir = path.join(this.buildDir, `${this.platform}-${this.arch}`);
    await this.ensureDirectory(platformDir);

    this.platformDir = platformDir;
  }

  /**
   * Builds backend application
   */
  async buildBackend() {
    console.log('🔧 Building backend application...');

    const backendDir = path.join(this.projectRoot, 'backend');

    // Install dependencies
    this.execCommand(await this.getNpmInstallCommand(backendDir), backendDir);

    // Run tests
    try {
      this.execCommand('npm test', backendDir);
    } catch (error) {
      console.warn('⚠️  Backend tests failed, continuing with build...');
    }

    // Build backend binary for the current host target to avoid cross-target pkg overhead in matrix builds.
    const hostPkgTarget = this.resolvePkgTarget();
    if (hostPkgTarget) {
      try {
        this.execCommand(`npx pkg . --targets ${hostPkgTarget} --out-path dist/ --no-bytecode`, backendDir);
      } catch (error) {
        console.warn(`⚠️  Host-target pkg build failed (${hostPkgTarget}), falling back to package scripts...`);
        this.execCommand('npm run build || npm run compile || echo "No build script found"', backendDir);
      }
    } else {
      this.execCommand('npm run build || npm run compile || echo "No build script found"', backendDir);
    }

    // Copy backend files
    const backendBuildDir = path.join(this.platformDir, 'backend');
    await this.ensureDirectory(backendBuildDir);

    await this.copyDirectory(
      path.join(backendDir, 'src'),
      path.join(backendBuildDir, 'src')
    );

    await this.copyFile(
      path.join(backendDir, 'package.json'),
      path.join(backendBuildDir, 'package.json')
    );

    const backendLockPath = path.join(backendDir, 'package-lock.json');
    try {
      await fs.access(backendLockPath);
      await this.copyFile(
        backendLockPath,
        path.join(backendBuildDir, 'package-lock.json')
      );
    } catch (error) {
      // Lockfile is optional for local developer snapshots.
    }

    // Install production dependencies
    this.execCommand(await this.getNpmInstallCommand(backendBuildDir, { omitDev: true }), backendBuildDir);
  }

  /**
   * Builds frontend extension
   */
  async buildFrontend() {
    console.log('🌐 Building frontend extension...');

    const frontendDir = path.join(this.projectRoot, 'frontend');

    // Install dependencies
    this.execCommand(await this.getNpmInstallCommand(frontendDir), frontendDir);

    // Build extension
    this.execCommand('npm run build || npm run compile || echo "No build script found"', frontendDir);

    // Copy frontend files
    const frontendBuildDir = path.join(this.platformDir, 'frontend');
    await this.ensureDirectory(frontendBuildDir);

    const filesToCopy = [
      'manifest.json',
      'manifest-chrome.json',
      'manifest-firefox.json',
      'src',
      'icons',
      'popup.html'
    ];

    for (const file of filesToCopy) {
      const sourcePath = path.join(frontendDir, file);
      const destPath = path.join(frontendBuildDir, file);

      try {
        const stat = await fs.stat(sourcePath);
        if (stat.isDirectory()) {
          await this.copyDirectory(sourcePath, destPath);
        } else {
          await this.copyFile(sourcePath, destPath);
        }
      } catch (error) {
        console.warn(`⚠️  File not found: ${file}`);
      }
    }
  }

  /**
   * Builds Windows installer
   */
  async buildWindowsInstaller() {
    console.log('🪟 Building Windows installer...');

    // Copy native host installer script into build payload.
    const installerToolsDir = path.join(this.platformDir, 'installer');
    await this.ensureDirectory(installerToolsDir);
    await this.copyFile(
      path.join(this.projectRoot, 'installer', 'install_native_host.js'),
      path.join(installerToolsDir, 'install_native_host.js')
    );

    // Create Inno Setup installer script.
    const innoScript = await this.generateInnoSetupScript();
    const innoPath = path.join(this.platformDir, 'installer.iss');
    await fs.writeFile(innoPath, innoScript);

    // Try to build Inno installer if compiler is available.
    let innoCompiled = false;
    const innoCompilers = ['iscc', 'ISCC.exe'];
    for (const compiler of innoCompilers) {
      try {
        this.execCommand(`${compiler} "${innoPath}"`, this.platformDir);
        console.log('✅ Inno Setup installer created');
        innoCompiled = true;
        break;
      } catch (error) {
        // Try next compiler alias.
      }
    }
    if (!innoCompiled) {
      console.warn('⚠️  Inno Setup compiler not available, generated installer.iss scaffold only');
    }

    // Create NSIS installer script
    const nsisScript = await this.generateNSISScript();
    const scriptPath = path.join(this.platformDir, 'installer.nsi');
    await fs.writeFile(scriptPath, nsisScript);

    // Create batch installer script
    const batchScript = await this.generateWindowsBatchScript();
    const batchPath = path.join(this.platformDir, 'install.bat');
    await fs.writeFile(batchPath, batchScript);

    // Create PowerShell installer script
    const powershellScript = await this.generatePowerShellScript();
    const psPath = path.join(this.platformDir, 'install.ps1');
    await fs.writeFile(psPath, powershellScript);

    // Try to build NSIS installer if available
    try {
      this.execCommand(`makensis "${scriptPath}"`, this.platformDir);
      console.log('✅ NSIS installer created');
    } catch (error) {
      console.warn('⚠️  NSIS not available, using batch installer');
    }

    // Create ZIP package
    await this.createZipPackage('windows');
  }

  /**
   * Generates Inno Setup script for Windows installer packaging.
   */
  async generateInnoSetupScript() {
    return `
#define MyAppName "${this.config.name}"
#define MyAppVersion "${this.version}"
#define MyAppPublisher "${this.config.author}"
#define MyAppURL "${this.config.homepage}"

[Setup]
AppId=${this.config.identifier}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\\D4AB
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=d4ab-bridge-{#MyAppVersion}-windows-inno
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "install_node"; Description: "Install Node.js LTS via winget if missing"; Flags: unchecked; Check: NeedsNodeInstall
Name: "register_firefox"; Description: "Register native host for Firefox (recommended)"; Check: IsFirefoxInstalled
Name: "register_chrome"; Description: "Register native host for Chrome (disabled by default)"; Flags: unchecked; Check: IsChromeInstalled

[Files]
Source: "backend\\*"; DestDir: "{app}\\backend"; Flags: recursesubdirs createallsubdirs
Source: "frontend\\*"; DestDir: "{app}\\frontend"; Flags: recursesubdirs createallsubdirs
Source: "installer\\install_native_host.js"; DestDir: "{app}\\installer"; Flags: ignoreversion

[Run]
Filename: "{cmd}"; Parameters: "/C winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent"; Flags: runhidden waituntilterminated; Tasks: install_node; Check: IsWingetAvailable
Filename: "{cmd}"; Parameters: "/C npm install --production"; WorkingDir: "{app}\\backend"; Flags: runhidden waituntilterminated
Filename: "{code:GetNodeExecutable}"; Parameters: "\"{app}\\installer\\install_native_host.js\" install --non-interactive --browsers firefox"; Flags: runhidden waituntilterminated; Check: ShouldInstallFirefoxOnly
Filename: "{code:GetNodeExecutable}"; Parameters: "\"{app}\\installer\\install_native_host.js\" install --non-interactive --browsers chrome --allow-placeholder-ids"; Flags: runhidden waituntilterminated; Check: ShouldInstallChromeOnly
Filename: "{code:GetNodeExecutable}"; Parameters: "\"{app}\\installer\\install_native_host.js\" install --non-interactive --browsers firefox,chrome --allow-placeholder-ids"; Flags: runhidden waituntilterminated; Check: ShouldInstallFirefoxAndChrome

[UninstallRun]
Filename: "{code:GetNodeExecutable}"; Parameters: "\"{app}\\installer\\install_native_host.js\" uninstall"; Flags: runhidden waituntilterminated skipifdoesntexist

[Code]
function IsNodeInstalled: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{cmd}'), '/C node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function IsWingetAvailable: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{cmd}'), '/C winget --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function NeedsNodeInstall: Boolean;
begin
  Result := not IsNodeInstalled();
end;

function IsFirefoxInstalled: Boolean;
begin
  Result :=
    FileExists(ExpandConstant('{pf}\\Mozilla Firefox\\firefox.exe')) or
    FileExists(ExpandConstant('{pf32}\\Mozilla Firefox\\firefox.exe'));
end;

function IsChromeInstalled: Boolean;
begin
  Result :=
    FileExists(ExpandConstant('{pf}\\Google\\Chrome\\Application\\chrome.exe')) or
    FileExists(ExpandConstant('{pf32}\\Google\\Chrome\\Application\\chrome.exe'));
end;

function GetNodeExecutable(Value: string): string;
begin
  if FileExists(ExpandConstant('{pf}\\nodejs\\node.exe')) then
  begin
    Result := ExpandConstant('{pf}\\nodejs\\node.exe');
  end
  else if FileExists(ExpandConstant('{pf32}\\nodejs\\node.exe')) then
  begin
    Result := ExpandConstant('{pf32}\\nodejs\\node.exe');
  end
  else
  begin
    Result := 'node';
  end;
end;

function ShouldInstallFirefoxOnly: Boolean;
begin
  Result := WizardIsTaskSelected('register_firefox') and (not WizardIsTaskSelected('register_chrome'));
end;

function ShouldInstallChromeOnly: Boolean;
begin
  Result := (not WizardIsTaskSelected('register_firefox')) and WizardIsTaskSelected('register_chrome');
end;

function ShouldInstallFirefoxAndChrome: Boolean;
begin
  Result := WizardIsTaskSelected('register_firefox') and WizardIsTaskSelected('register_chrome');
end;

function InitializeSetup: Boolean;
begin
  if IsNodeInstalled() then
  begin
    Result := True;
    exit;
  end;

  if IsWingetAvailable() then
  begin
    Result := True;
    exit;
  end;

  MsgBox('Node.js is required and winget was not found for automatic installation.'#13#10#13#10 +
         'Install Node.js LTS from https://nodejs.org and run the installer again.', mbCriticalError, MB_OK);
  Result := False;
end;
`;
  }

  /**
   * Builds macOS installer
   */
  async buildMacInstaller() {
    console.log('🍎 Building macOS installer...');

    // Create application bundle structure
    const bundleName = `${this.config.name}.app`;
    const bundlePath = path.join(this.platformDir, bundleName);
    const contentsDir = path.join(bundlePath, 'Contents');
    const macOSDir = path.join(contentsDir, 'MacOS');
    const resourcesDir = path.join(contentsDir, 'Resources');

    await this.ensureDirectory(macOSDir);
    await this.ensureDirectory(resourcesDir);

    // Create Info.plist
    const infoPlist = await this.generateInfoPlist();
    await fs.writeFile(path.join(contentsDir, 'Info.plist'), infoPlist);

    // Create launcher script
    const launcherScript = await this.generateMacLauncherScript();
    const launcherPath = path.join(macOSDir, 'd4ab-bridge');
    await fs.writeFile(launcherPath, launcherScript);
    await fs.chmod(launcherPath, '755');

    // Copy application files
    await this.copyDirectory(
      path.join(this.platformDir, 'backend'),
      path.join(resourcesDir, 'backend')
    );

    await this.copyDirectory(
      path.join(this.platformDir, 'frontend'),
      path.join(resourcesDir, 'frontend')
    );

    // Create shell installer
    const shellInstaller = await this.generateShellInstaller();
    await fs.writeFile(path.join(this.platformDir, 'install.sh'), shellInstaller);
    await fs.chmod(path.join(this.platformDir, 'install.sh'), '755');

    // Try to create DMG if hdiutil is available
    try {
      const dmgPath = path.join(this.buildDir, `d4ab-bridge-${this.version}-macos.dmg`);
      this.execCommand(`hdiutil create -srcfolder "${this.platformDir}" "${dmgPath}"`, this.platformDir);
      console.log('✅ DMG installer created');
    } catch (error) {
      console.warn('⚠️  hdiutil not available, using ZIP package');
      await this.createZipPackage('macos');
    }
  }

  /**
   * Builds Linux installer
   */
  async buildLinuxInstaller() {
    console.log('🐧 Building Linux installer...');

    // Create directory structure
    const debDir = path.join(this.platformDir, 'deb');
    const debianDir = path.join(debDir, 'DEBIAN');
    const optDir = path.join(debDir, 'opt', 'd4ab-bridge');
    const binDir = path.join(debDir, 'usr', 'bin');
    const desktopDir = path.join(debDir, 'usr', 'share', 'applications');

    await this.ensureDirectory(debianDir);
    await this.ensureDirectory(optDir);
    await this.ensureDirectory(binDir);
    await this.ensureDirectory(desktopDir);

    // Create Debian control file
    const controlFile = await this.generateDebianControl();
    await fs.writeFile(path.join(debianDir, 'control'), controlFile);

    // Create postinst script
    const postinstScript = await this.generatePostinstScript();
    await fs.writeFile(path.join(debianDir, 'postinst'), postinstScript);
    await fs.chmod(path.join(debianDir, 'postinst'), '755');

    // Create prerm script
    const prermScript = await this.generatePrermScript();
    await fs.writeFile(path.join(debianDir, 'prerm'), prermScript);
    await fs.chmod(path.join(debianDir, 'prerm'), '755');

    // Copy application files
    await this.copyDirectory(
      path.join(this.platformDir, 'backend'),
      path.join(optDir, 'backend')
    );

    await this.copyDirectory(
      path.join(this.platformDir, 'frontend'),
      path.join(optDir, 'frontend')
    );

    // Create binary symlink script
    const binScript = `#!/bin/bash\nnode /opt/d4ab-bridge/backend/src/bridge_cli.js "$@"\n`;
    await fs.writeFile(path.join(binDir, 'd4ab-bridge'), binScript);
    await fs.chmod(path.join(binDir, 'd4ab-bridge'), '755');

    // Create desktop entry
    const desktopEntry = await this.generateDesktopEntry();
    await fs.writeFile(path.join(desktopDir, 'd4ab-bridge.desktop'), desktopEntry);

    // Try to build DEB package
    try {
      const debPackage = path.join(this.buildDir, `d4ab-bridge_${this.version}_${this.arch}.deb`);
      this.execCommand(`dpkg-deb --build "${debDir}" "${debPackage}"`, this.platformDir);
      console.log('✅ DEB package created');
    } catch (error) {
      console.warn('⚠️  dpkg-deb not available, using TAR package');
    }

    // Create shell installer
    const shellInstaller = await this.generateLinuxShellInstaller();
    await fs.writeFile(path.join(this.platformDir, 'install.sh'), shellInstaller);
    await fs.chmod(path.join(this.platformDir, 'install.sh'), '755');

    // Create TAR package
    await this.createTarPackage('linux');
  }

  /**
   * Generates NSIS installer script for Windows
   */
  async generateNSISScript() {
    return `
!define APPNAME "${this.config.name}"
!define APPVERSION "${this.version}"
!define APPIDENTIFIER "${this.config.identifier}"

Name "\${APPNAME}"
OutFile "d4ab-bridge-\${APPVERSION}-windows-installer.exe"
InstallDir "$PROGRAMFILES64\\D4AB Hardware Bridge"

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "backend\\*"
  File /r "frontend\\*"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\\uninstall.exe"

  ; Add to Add/Remove Programs
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\D4ABBridge" "DisplayName" "\${APPNAME}"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\D4ABBridge" "UninstallString" "$INSTDIR\\uninstall.exe"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\D4ABBridge" "DisplayVersion" "\${APPVERSION}"

  ; Register native messaging host
  ExecWait '"$INSTDIR\\backend\\src\\bridge_cli.js" install-host'
SectionEnd

Section "Uninstall"
  ; Unregister native messaging host
  ExecWait '"$INSTDIR\\backend\\src\\bridge_cli.js" uninstall-host'

  ; Remove files
  RMDir /r "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\D4ABBridge"
SectionEnd
`;
  }

  /**
   * Generates Windows batch installer script
   */
  async generateWindowsBatchScript() {
    return `@echo off
echo Installing D4AB Hardware Bridge...

REM Check for Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is required but not installed.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Create installation directory
if not exist "%PROGRAMFILES%\\D4AB Hardware Bridge" mkdir "%PROGRAMFILES%\\D4AB Hardware Bridge"

REM Copy files
xcopy /s /y backend "%PROGRAMFILES%\\D4AB Hardware Bridge\\backend\\"
xcopy /s /y frontend "%PROGRAMFILES%\\D4AB Hardware Bridge\\frontend\\"

REM Install dependencies
cd "%PROGRAMFILES%\\D4AB Hardware Bridge\\backend"
npm install --production

REM Register native messaging host
node src\\bridge_cli.js install-host

REM Add to PATH
setx PATH "%PATH%;%PROGRAMFILES%\\D4AB Hardware Bridge\\backend\\src" /M

echo Installation completed!
echo You can now use 'd4ab-bridge' command from any terminal.
pause
`;
  }

  /**
   * Generates PowerShell installer script
   */
  async generatePowerShellScript() {
    return `
# D4AB Hardware Bridge PowerShell Installer
Write-Host "Installing D4AB Hardware Bridge..." -ForegroundColor Green

# Check for Node.js
try {
    $nodeVersion = node --version
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js is required but not installed." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check for Administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This installer requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$installPath = "$env:ProgramFiles\\D4AB Hardware Bridge"

# Create installation directory
New-Item -ItemType Directory -Force -Path $installPath

# Copy files
Copy-Item -Path "backend" -Destination $installPath -Recurse -Force
Copy-Item -Path "frontend" -Destination $installPath -Recurse -Force

# Install dependencies
Set-Location "$installPath\\backend"
npm install --production

# Register native messaging host
node src\\bridge_cli.js install-host

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
$newPath = "$currentPath;$installPath\\backend\\src"
[Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")

Write-Host "Installation completed successfully!" -ForegroundColor Green
Write-Host "You can now use 'd4ab-bridge' command from any terminal." -ForegroundColor Yellow
Write-Host "Please restart your terminal for PATH changes to take effect." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
`;
  }

  /**
   * Generates macOS Info.plist
   */
  async generateInfoPlist() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>d4ab-bridge</string>
    <key>CFBundleIdentifier</key>
    <string>${this.config.identifier}</string>
    <key>CFBundleName</key>
    <string>${this.config.name}</string>
    <key>CFBundleVersion</key>
    <string>${this.version}</string>
    <key>CFBundleShortVersionString</key>
    <string>${this.version}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>D4AB</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.14</string>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>`;
  }

  /**
   * Generates macOS launcher script
   */
  async generateMacLauncherScript() {
    return `#!/bin/bash
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES_DIR="$DIR/../Resources"
export NODE_PATH="$RESOURCES_DIR/backend/node_modules"
node "$RESOURCES_DIR/backend/src/bridge_cli.js" "$@"
`;
  }

  /**
   * Generates shell installer for macOS
   */
  async generateShellInstaller() {
    return `#!/bin/bash
set -e

echo "Installing D4AB Hardware Bridge..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed."
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

# Check for appropriate permissions
if [[ $EUID -eq 0 ]]; then
   echo "This script should not be run as root"
   exit 1
fi

INSTALL_DIR="/Applications/D4AB Hardware Bridge.app"

# Remove existing installation
if [ -d "$INSTALL_DIR" ]; then
    echo "Removing existing installation..."
    rm -rf "$INSTALL_DIR"
fi

# Copy application
echo "Installing to $INSTALL_DIR..."
cp -R "D4AB Hardware Bridge.app" "/Applications/"

# Install dependencies
cd "$INSTALL_DIR/Contents/Resources/backend"
npm install --production

# Register native messaging host
node src/bridge_cli.js install-host

# Create command line symlink
sudo ln -sf "$INSTALL_DIR/Contents/MacOS/d4ab-bridge" "/usr/local/bin/d4ab-bridge"

echo "Installation completed successfully!"
echo "You can now use 'd4ab-bridge' command from Terminal."
`;
  }

  /**
   * Generates Debian control file
   */
  async generateDebianControl() {
    return `Package: d4ab-bridge
Version: ${this.version}
Section: devel
Priority: optional
Architecture: ${this.arch === 'x64' ? 'amd64' : this.arch}
Depends: nodejs (>= 18.0.0)
Maintainer: ${this.config.author}
Description: ${this.config.description}
 D4AB Hardware Bridge enables web applications to access local hardware
 devices including USB, Serial, and Bluetooth devices through a browser
 extension and native bridge application.
Homepage: ${this.config.homepage}
`;
  }

  /**
   * Generates post-installation script for Debian
   */
  async generatePostinstScript() {
    return `#!/bin/bash
set -e

# Install Node.js dependencies
cd /opt/d4ab-bridge/backend
npm install --production

# Register native messaging host
node src/bridge_cli.js install-host

# Create systemd service if systemd is available
if command -v systemctl &> /dev/null; then
    cat > /etc/systemd/system/d4ab-bridge.service << EOF
[Unit]
Description=D4AB Hardware Bridge
After=network.target

[Service]
Type=simple
User=d4ab
Group=d4ab
WorkingDirectory=/opt/d4ab-bridge/backend
ExecStart=/usr/bin/node src/bridge_cli.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable d4ab-bridge
fi

echo "D4AB Hardware Bridge installed successfully!"
`;
  }

  /**
   * Generates pre-removal script for Debian
   */
  async generatePrermScript() {
    return `#!/bin/bash
set -e

# Stop and disable service if running
if command -v systemctl &> /dev/null; then
    systemctl stop d4ab-bridge || true
    systemctl disable d4ab-bridge || true
fi

# Unregister native messaging host
cd /opt/d4ab-bridge/backend
node src/bridge_cli.js uninstall-host || true
`;
  }

  /**
   * Generates desktop entry for Linux
   */
  async generateDesktopEntry() {
    return `[Desktop Entry]
Version=1.0
Type=Application
Name=${this.config.name}
Comment=${this.config.description}
Exec=d4ab-bridge
Icon=d4ab-bridge
Terminal=true
Categories=${this.config.category};
`;
  }

  /**
   * Generates Linux shell installer
   */
  async generateLinuxShellInstaller() {
    return `#!/bin/bash
set -e

echo "Installing D4AB Hardware Bridge..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed."
    echo "Installing Node.js..."

    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y nodejs npm
    elif command -v yum &> /dev/null; then
        sudo yum install -y nodejs npm
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y nodejs npm
    else
        echo "Please install Node.js manually from https://nodejs.org"
        exit 1
    fi
fi

# Check for root privileges
if [[ $EUID -ne 0 ]]; then
   echo "This installer requires root privileges."
   echo "Please run with sudo."
   exit 1
fi

# Create installation directory
mkdir -p /opt/d4ab-bridge

# Copy files
cp -r backend /opt/d4ab-bridge/
cp -r frontend /opt/d4ab-bridge/

# Install dependencies
cd /opt/d4ab-bridge/backend
npm install --production

# Create binary symlink
ln -sf /opt/d4ab-bridge/backend/src/bridge_cli.js /usr/local/bin/d4ab-bridge
chmod +x /usr/local/bin/d4ab-bridge

# Register native messaging host
/usr/local/bin/d4ab-bridge install-host

echo "Installation completed successfully!"
echo "You can now use 'd4ab-bridge' command from any terminal."
`;
  }

  /**
   * Creates ZIP package
   */
  async createZipPackage(platform) {
    const zipPath = path.join(this.buildDir, `d4ab-bridge-${this.version}-${platform}.zip`);

    try {
      this.execCommand(`cd "${this.platformDir}" && zip -r "${zipPath}" .`, this.platformDir);
      console.log(`✅ ZIP package created: ${zipPath}`);
    } catch (error) {
      console.warn('⚠️  ZIP creation failed, files available in platform directory');
    }
  }

  /**
   * Creates TAR package
   */
  async createTarPackage(platform) {
    const tarPath = path.join(this.buildDir, `d4ab-bridge-${this.version}-${platform}.tar.gz`);

    try {
      this.execCommand(`tar -czf "${tarPath}" -C "${this.platformDir}" .`, this.platformDir);
      console.log(`✅ TAR package created: ${tarPath}`);
    } catch (error) {
      console.warn('⚠️  TAR creation failed, files available in platform directory');
    }
  }

  /**
   * Utility methods
   */

  async ensureDirectory(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  async cleanDirectory(dir) {
    try {
      const files = await fs.readdir(dir);
      await Promise.all(files.map(file =>
        fs.rm(path.join(dir, file), { recursive: true, force: true })
      ));
    } catch (error) {
      // Directory might not exist
    }
  }

  async copyFile(src, dest) {
    await this.ensureDirectory(path.dirname(dest));
    await fs.copyFile(src, dest);
  }

  async copyDirectory(src, dest) {
    await this.ensureDirectory(dest);
    const files = await fs.readdir(src);

    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await this.copyFile(srcPath, destPath);
      }
    }
  }

  resolvePkgTarget() {
    const platformMap = {
      darwin: 'macos',
      linux: 'linux',
      win32: 'win'
    };

    const archMap = {
      x64: 'x64',
      arm64: 'arm64'
    };

    const platform = platformMap[this.platform];
    const arch = archMap[this.arch];

    if (!platform || !arch) {
      return null;
    }

    return `node20-${platform}-${arch}`;
  }

  async getNpmInstallCommand(dir, options = {}) {
    const { omitDev = false } = options;
    const lockPath = path.join(dir, 'package-lock.json');
    let hasLockFile = false;

    try {
      await fs.access(lockPath);
      hasLockFile = true;
    } catch (error) {
      hasLockFile = false;
    }

    const command = [hasLockFile ? 'npm ci' : 'npm install', '--no-audit', '--no-fund'];
    if (omitDev) {
      command.push('--omit=dev');
    }

    return command.join(' ');
  }

  execCommand(command, cwd = process.cwd()) {
    try {
      return execSync(command, { cwd, stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
D4AB Hardware Bridge Installer Builder

Usage: node build_installer.js [options]

Options:
  --help, -h          Show this help message
  --target <name>     Build target (default: native, brew)
  --platform <name>   Target platform (win32, darwin, linux)
  --arch <name>       Target architecture (x64, arm64)
  --output <path>     Output directory for installer
  --version <version> Override version number

Examples:
  node build_installer.js
  node build_installer.js --target brew
  node build_installer.js --platform linux --arch x64
  node build_installer.js --output ./custom-build
      `);
      process.exit(0);
    } else if (arg === '--target') {
      options.target = args[++i];
    } else if (arg === '--platform') {
      options.platform = args[++i];
    } else if (arg === '--arch') {
      options.arch = args[++i];
    } else if (arg === '--output') {
      options.output = args[++i];
    } else if (arg === '--version') {
      options.version = args[++i];
    }
  }

  const builder = new InstallerBuilder();

  // Override options if provided
  if (options.target) builder.target = options.target;
  if (options.platform) builder.platform = options.platform;
  if (options.arch) builder.arch = options.arch;
  if (options.output) builder.buildDir = options.output;
  if (options.version) builder.version = options.version;

  builder.build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

module.exports = InstallerBuilder;