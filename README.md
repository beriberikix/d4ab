# D4AB Hardware Bridge

> **Universal Hardware Access for Web Applications**

Bring USB, Serial, and Bluetooth device support to **Chrome and Firefox** through a powerful browser extension and native bridge combination. D4AB (Device for All Browsers) enables web applications to access local hardware devices on Windows, macOS, and Linux, extending beyond Chromium's native WebUSB/WebSerial support to Firefox and older browsers.

## 🎯 **What This Solves**

Currently, browser-based device APIs like WebUSB and Web Serial are only supported by Chromium-based browsers. This project provides:

- ✅ **Multi-Browser Support**: USB, Serial, and Bluetooth APIs work in Chrome, Firefox, and Edge
- 🔒 **Secure Hardware Access**: Origin-based permissions with multi-layered security
- 🌐 **Cross-Platform**: Windows, macOS, and Linux support with native installers
- 📱 **Standards Compliant**: Full compatibility with WebUSB, Web Serial, and Web Bluetooth APIs
- ⚡ **High Performance**: <5s device enumeration, <100MB memory usage

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Page      │    │   Extension      │    │  Native Bridge  │
│                 │    │                  │    │                 │
│ navigator.usb   │◄──►│ Polyfill Injector│◄──►│ Hardware Access │
│ navigator.serial│    │ Background Worker│    │ JSON-RPC Server │
│ navigator.bluetooth│ │ Permission Mgr   │    │ Device Libraries│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

The system consists of two main components:
- **Browser Extension**: Injects Web API polyfills and manages permissions
- **Native Bridge**: Node.js application that provides actual hardware access

## 🚀 **Quick Start**

### Prerequisites

- Node.js 18.0 or higher
- Chrome, Firefox, or Edge browser
- Hardware devices for testing (optional)

### 1. Install the Native Bridge

```bash
# Clone the repository
git clone https://github.com/d4ab/hardware-bridge.git
cd d4ab

# Install backend dependencies
cd backend
npm install

# Test the installation
node src/bridge_cli.js --version
# Expected: 1.0.0
```

### 2. Install the Browser Extension

#### Chrome/Edge:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `frontend/` directory

#### Firefox:
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `frontend/manifest.json`


### 3. Test the Installation

Open any webpage and test in the browser console:

```javascript
// Verify APIs are available
console.log('USB available:', !!navigator.usb);
console.log('Serial available:', !!navigator.serial);
console.log('Bluetooth available:', !!navigator.bluetooth);

// Test device enumeration
navigator.usb.getDevices().then(devices => {
  console.log(`Found ${devices.length} USB devices`);
});

navigator.serial.getPorts().then(ports => {
  console.log(`Found ${ports.length} serial ports`);
});
```

## 📖 **API Usage**

### USB Device Access

```javascript
// Request Arduino device access
try {
  const device = await navigator.usb.requestDevice({
    filters: [{ vendorId: 0x2341, productId: 0x0043 }] // Arduino Uno
  });

  await device.open();
  await device.selectConfiguration(1);
  await device.claimInterface(0);

  // Send data to device
  const data = new Uint8Array([0x01, 0x02, 0x03]);
  await device.transferOut(1, data);

  // Read response
  const result = await device.transferIn(1, 64);
  console.log('Response:', new Uint8Array(result.data.buffer));

  await device.close();
} catch (error) {
  console.error('USB operation failed:', error);
}
```

### Serial Port Communication

```javascript
// Connect to serial device
try {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });

  // Set up data reader
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();

  // Send command
  const command = new TextEncoder().encode('AT\r\n');
  await writer.write(command);

  // Read response
  const { value } = await reader.read();
  const response = new TextDecoder().decode(value);
  console.log('Device response:', response);

  // Cleanup
  reader.releaseLock();
  writer.releaseLock();
  await port.close();
} catch (error) {
  console.error('Serial operation failed:', error);
}
```

### Bluetooth Device Discovery

```javascript
// Connect to heart rate monitor
try {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }]
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const characteristic = await service.getCharacteristic('heart_rate_measurement');

  // Start notifications
  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', event => {
    const heartRate = event.target.value.getUint16(1, true);
    console.log('Heart rate:', heartRate, 'BPM');
  });

} catch (error) {
  console.error('Bluetooth operation failed:', error);
}
```

## 🛠️ **Building from Source**

### Build the Extension

```bash
cd frontend
npm install

# Development build
npm run build

# Production package
npm run package
```

### Build the Native Bridge

```bash
cd backend
npm install

# Run tests
npm test

# Build application
npm run build

# Create distribution package
npm run package
```

### Build Cross-Platform Installers

```bash
cd installer
npm install

# Build installer for current platform
node build_installer.js

# Build for specific platform
node build_installer.js --platform linux --arch x64

# Build local Homebrew artifacts (macOS/Linux)
node build_installer.js --target brew

# Build for all platforms
npm run build:all
```

### Local Homebrew Install (macOS and Linux)

```bash
# 1) Generate local tarball + formula
node installer/build_installer.js --target brew

# 2) Add a local tap and copy formula into it (required by recent Homebrew)
brew tap-new d4ab/local --no-git
mkdir -p "$(brew --repo d4ab/local)/Formula"
cp ./dist/homebrew/Formula/d4ab-hardware-bridge.rb "$(brew --repo d4ab/local)/Formula/d4ab-hardware-bridge.rb"

# 3) Install with Homebrew (Node.js is required automatically via formula dependency)
brew install --build-from-source d4ab/local/d4ab-hardware-bridge

# 4) Register native messaging host (interactive picker)
d4ab-install-native-host install

# Non-interactive default behavior:
# - Firefox selected by default if detected
# - Chrome detected but disabled by default
d4ab-install-native-host install --non-interactive

# Keep stale host manifests cleaned up when browser selection changes (default)
d4ab-install-native-host install --cleanup-stale-manifests

# Open browser extension setup pages after install (off by default in non-interactive mode)
d4ab-install-native-host install --open-guidance

# Explicitly enable both Firefox and Chrome
d4ab-install-native-host install --browsers firefox,chrome
```

One-command local smoke test on macOS:

```bash
bash installer/smoke_macos_brew.sh
```

One-command local smoke test on Linux:

```bash
bash installer/smoke_linux_brew.sh

# Also verify Chromium-family manifest paths by enabling Chrome registration
# (recommended to pass your real extension ID)
bash installer/smoke_linux_brew.sh --with-chrome --chrome-extension-id <your_chrome_extension_id>
```

### Local Inno Setup Install (Windows)

```powershell
# 1) Generate Windows installer payload and Inno script scaffold
node installer/build_installer.js --platform win32 --arch x64

# 2) Compile with Inno Setup (if ISCC.exe is installed)
ISCC.exe .\dist\win32-x64\installer.iss

# 3) Run native host install directly for local validation
node .\installer\install_native_host.js install --non-interactive --browsers firefox

# Optional: include Chrome registration (pass real extension ID when available)
node .\installer\install_native_host.js install --non-interactive --browsers firefox,chrome --allow-placeholder-ids
```

One-command local smoke test on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\smoke_windows_inno.ps1

# Include Chrome registry/manifest validation
powershell -ExecutionPolicy Bypass -File .\installer\smoke_windows_inno.ps1 -WithChrome -ChromeExtensionId <your_chrome_extension_id>
```

Cross-platform local matrix runner (runs current-host smoke, reports others as skipped):

```bash
node installer/run_local_matrix.js
node installer/run_local_matrix.js --with-chrome --chrome-extension-id <your_chrome_extension_id>
```

See `installer/README.md` for the installer behavior contract and per-OS registration details.

The installer creates platform-specific packages:
- **Windows**: `.exe` installer and `.zip` package
- **macOS**: `.dmg` disk image and `.app` bundle
- **Linux**: `.deb` package and `.tar.gz` archive

## 🧪 **Testing**

### Run Test Suites

```bash
# Backend unit tests
cd backend
npm test

# Frontend E2E tests
cd frontend
npm install playwright
npm run test:e2e

# Security audit tests
npm run test:security

# Cross-browser compatibility tests
npm run test:browsers
```

### Test with Real Hardware

Connect a USB device (Arduino, serial adapter, etc.) and test:

```javascript
// Test device request (shows permission dialog)
navigator.usb.requestDevice({ filters: [] })
  .then(device => console.log('Device selected:', device))
  .catch(error => console.log('User cancelled or no device'));

// Test serial port access
navigator.serial.requestPort()
  .then(port => console.log('Port selected:', port))
  .catch(error => console.log('User cancelled or no port'));
```

## 🔧 **Configuration**

### Native Bridge Configuration

The bridge can be configured via `~/.d4ab/config.json`:

```json
{
  "logging": {
    "level": "info",
    "file": "~/.d4ab/logs/bridge.log"
  },
  "hardware": {
    "maxConnections": 10,
    "enableUSB": true,
    "enableSerial": true,
    "enableBluetooth": true
  },
  "security": {
    "requirePermissions": true,
    "allowedOrigins": ["https://*"]
  }
}
```

### Environment Variables

```bash
# Debug logging
export D4AB_LOG_LEVEL=debug

# Disable specific hardware types
export D4AB_DISABLE_BLUETOOTH=true

# Performance tuning
export D4AB_MAX_CONNECTIONS=5
```

## 🔒 **Security Features**

- **Origin-Based Permissions**: HTTPS-only access (except localhost for development)
- **Device-Specific Permissions**: Each device requires separate user consent
- **Content Security Policy**: Compatible with strict CSP policies
- **Multi-Layered Security**: OS permissions + bridge filtering + extension validation
- **No Data Collection**: Extension and bridge don't store or transmit user data
- **Audit Logging**: All hardware operations logged for security review

## 📊 **Performance Specifications**

- **Device Enumeration**: < 5 seconds for 100 devices
- **Connection Establishment**: < 2 seconds per device
- **Data Transfer**: Up to 2 MB/s (hardware dependent)
- **Memory Usage**: < 100 MB for 10 concurrent connections
- **CPU Usage**: < 5% idle, < 20% under load

## 🌐 **Browser Compatibility**

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome  | ✅ Full | Native Manifest V3 support |
| Edge    | ✅ Full | Chromium-based, same as Chrome |
| Firefox | ✅ Full | Manifest V2 compatibility mode |

## 🔍 **Troubleshooting**

### Common Issues

**"Extension not found"**
- Verify extension is installed and enabled in browser
- Check that Native Messaging permission is granted
- Restart browser after installation

**"Native bridge not responding"**
```bash
# Check if bridge is installed
node backend/src/bridge_cli.js --version

# Test bridge connectivity
echo '{"jsonrpc":"2.0","method":"heartbeat","id":1}' | node backend/src/bridge_cli.js

# Check logs
tail -f ~/.d4ab/logs/bridge.log
```

**"Device access denied"**
- Ensure device is connected and recognized by system
- Check origin is HTTPS (or localhost for development)
- Verify user granted permission in browser dialog
- Check device drivers are properly installed

### Debug Mode

```bash
# Start bridge with verbose logging
cd backend
node src/bridge_cli.js --debug --log-level trace

# Enable extension debug logging in browser console
localStorage.setItem('d4ab-debug', 'true');
```

## 📚 **Documentation**

- **[Extension API Reference](frontend/docs/extension_api.md)**: Complete Web API documentation
- **[Native Bridge Documentation](backend/docs/native_bridge.md)**: JSON-RPC API and configuration

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test` in both `backend/` and `frontend/`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Setup

```bash
# Clone and setup
git clone https://github.com/d4ab/hardware-bridge.git
cd d4ab

# Install all dependencies
npm run install:all

# Run tests
npm test

# Start development mode
npm run dev
```

## 📄 **License**

MIT License - see [LICENSE](LICENSE) for details.

## 🌟 **Supported Hardware**

### USB Devices
- **Device Classes**: HID, CDC, Mass Storage, Custom vendor devices
- **Requirements**: Compatible drivers, appropriate permissions
- **Examples**: Arduino, Raspberry Pi, development boards, sensors

### Serial Devices
- **Types**: Native ports, USB-to-serial adapters, Bluetooth serial
- **Baud Rates**: 110 to 921,600 bps
- **Examples**: GPS modules, IoT devices, industrial equipment

### Bluetooth Devices
- **Profiles**: BLE (Generic Access/Attribute Profiles)
- **Requirements**: Bluetooth 4.0+ adapter, platform permissions
- **Examples**: Heart rate monitors, fitness trackers, IoT sensors

## 🚀 **Use Cases**

- **IoT Development**: Connect web apps to sensors and devices
- **Educational Platforms**: Interactive hardware programming tutorials
- **Industrial Dashboards**: Monitor and control equipment via web interface
- **Maker Projects**: Browser-based device configuration and control
- **Accessibility Tools**: Hardware integration for assistive technologies

---

**Ready to bridge the gap between web and hardware?** 🌉

For support, visit [GitHub Issues](https://github.com/d4ab/hardware-bridge/issues) or join our [Discord community](https://discord.gg/d4ab).