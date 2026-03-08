# D4AB Hardware Bridge - Extension API Documentation

## Overview

The D4AB Hardware Bridge Extension provides Web USB, Serial, and Bluetooth API polyfills for browsers that don't natively support these APIs, enabling universal hardware access across Chrome, Firefox, and Edge.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Page      │    │   Extension      │    │  Native Bridge  │
│                 │    │                  │    │                 │
│ navigator.usb   │◄──►│ Polyfill Injector│◄──►│ Hardware Access │
│ navigator.serial│    │ Background Worker│    │ JSON-RPC Server │
│ navigator.bluetooth│ │ Permission Mgr   │    │ Device Libraries│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Installation

### For Users

1. **Chrome/Edge**: Install from Chrome Web Store
2. **Firefox**: Install from Firefox Add-ons
3. **Safari**: Install from Mac App Store (when available)

### For Developers

1. Clone the repository
2. Load unpacked extension in developer mode
3. Install and run the native bridge application

## API Reference

### USB API Polyfill

The extension provides a complete implementation of the WebUSB API.

#### `navigator.usb.requestDevice(options)`

Requests access to a USB device.

**Parameters:**
- `options` (Object): Device selection criteria
  - `filters` (Array): Array of device filters
    - `vendorId` (Number): USB vendor ID
    - `productId` (Number): USB product ID
    - `classCode` (Number): USB device class
    - `protocolCode` (Number): USB protocol code

**Returns:** `Promise<USBDevice>`

**Example:**
```javascript
try {
  const device = await navigator.usb.requestDevice({
    filters: [{
      vendorId: 0x2341,  // Arduino
      productId: 0x0043
    }]
  });
  console.log('Device selected:', device.productName);
} catch (error) {
  console.error('Device selection failed:', error);
}
```

#### `navigator.usb.getDevices()`

Returns previously authorized USB devices.

**Returns:** `Promise<USBDevice[]>`

**Example:**
```javascript
const devices = await navigator.usb.getDevices();
devices.forEach(device => {
  console.log(`Device: ${device.productName} (${device.vendorId}:${device.productId})`);
});
```

#### USBDevice Methods

##### `device.open()`
Opens a connection to the device.

##### `device.close()`
Closes the connection to the device.

##### `device.selectConfiguration(configurationValue)`
Selects a device configuration.

##### `device.claimInterface(interfaceNumber)`
Claims exclusive access to an interface.

##### `device.transferIn(endpointNumber, length)`
Performs a USB IN transfer.

##### `device.transferOut(endpointNumber, data)`
Performs a USB OUT transfer.

### Serial API Polyfill

#### `navigator.serial.requestPort(options)`

Requests access to a serial port.

**Parameters:**
- `options` (Object): Port selection criteria (optional)
  - `filters` (Array): Array of port filters
    - `usbVendorId` (Number): USB vendor ID
    - `usbProductId` (Number): USB product ID

**Returns:** `Promise<SerialPort>`

**Example:**
```javascript
try {
  const port = await navigator.serial.requestPort({
    filters: [{ usbVendorId: 0x2341 }]  // Arduino
  });
  console.log('Port selected');
} catch (error) {
  console.error('Port selection failed:', error);
}
```

#### `navigator.serial.getPorts()`

Returns previously authorized serial ports.

**Returns:** `Promise<SerialPort[]>`

#### SerialPort Methods

##### `port.open(options)`
Opens the serial port.

**Parameters:**
- `options` (Object): Port configuration
  - `baudRate` (Number): Baud rate (required)
  - `dataBits` (Number): Data bits (7 or 8)
  - `stopBits` (Number): Stop bits (1 or 2)
  - `parity` (String): Parity ('none', 'even', 'odd')
  - `bufferSize` (Number): Buffer size
  - `flowControl` (String): Flow control ('none', 'hardware')

**Example:**
```javascript
await port.open({
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
});
```

##### `port.close()`
Closes the serial port.

##### `port.readable`
ReadableStream for receiving data.

##### `port.writable`
WritableStream for sending data.

**Example:**
```javascript
// Reading data
const reader = port.readable.getReader();
try {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    console.log('Received:', new TextDecoder().decode(value));
  }
} finally {
  reader.releaseLock();
}

// Writing data
const writer = port.writable.getWriter();
const data = new TextEncoder().encode('Hello Device!');
await writer.write(data);
writer.releaseLock();
```

### Bluetooth API Polyfill

#### `navigator.bluetooth.requestDevice(options)`

Requests access to a Bluetooth device.

**Parameters:**
- `options` (Object): Device selection criteria
  - `acceptAllDevices` (Boolean): Accept all devices
  - `filters` (Array): Array of device filters
    - `name` (String): Device name
    - `namePrefix` (String): Device name prefix
    - `services` (Array): Required services
  - `optionalServices` (Array): Optional services

**Returns:** `Promise<BluetoothDevice>`

**Example:**
```javascript
try {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{
      services: ['heart_rate']
    }]
  });
  console.log('Device:', device.name);
} catch (error) {
  console.error('Device selection failed:', error);
}
```

#### `navigator.bluetooth.getDevices()`

Returns previously authorized Bluetooth devices.

**Returns:** `Promise<BluetoothDevice[]>`

#### BluetoothDevice Methods

##### `device.gatt.connect()`
Connects to the device's GATT server.

##### `device.gatt.disconnect()`
Disconnects from the device.

##### `device.gatt.getPrimaryService(service)`
Gets a primary service.

## Permission System

### Origin-Based Permissions

The extension implements a secure permission system based on website origins:

- **HTTPS Required**: Only HTTPS origins can request device access (except localhost)
- **Per-Device Permissions**: Each device requires separate permission
- **Capability-Based**: Permissions specify allowed operations (read, write, control)
- **Session vs Persistent**: Choose between session-only or persistent permissions

### Permission Lifecycle

1. **Request**: Web page calls `requestDevice()` or `requestPort()`
2. **User Consent**: Browser shows permission dialog
3. **Grant**: User approves, extension stores permission
4. **Usage**: Subsequent API calls check stored permissions
5. **Revocation**: User can revoke permissions via extension popup

### Permission API

#### Check Permissions
```javascript
// Extension provides permission status
const permissionStatus = await navigator.permissions.query({
  name: 'usb',
  deviceId: 'usb:1234:5678'
});
console.log('Permission state:', permissionStatus.state);
```

## Extension Configuration

### Manifest V3 Features

- **Service Worker**: Background script using service worker architecture
- **Native Messaging**: Communication with native bridge application
- **Content Scripts**: Polyfill injection into web pages
- **Declarative Permissions**: All permissions declared in manifest

### Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome  | ✅ Full | Native Manifest V3 support |
| Edge    | ✅ Full | Chromium-based, same as Chrome |
| Firefox | ⚠️ Limited | Manifest V2 compatibility mode |
| Safari  | ⚠️ Limited | Different extension model |

## Error Handling

### Common Errors

#### `NotFoundError`
No devices match the selection criteria.

```javascript
try {
  const device = await navigator.usb.requestDevice({ filters: [] });
} catch (error) {
  if (error.name === 'NotFoundError') {
    console.log('No matching devices found');
  }
}
```

#### `SecurityError`
Permission denied or invalid origin.

```javascript
try {
  const port = await navigator.serial.requestPort();
} catch (error) {
  if (error.name === 'SecurityError') {
    console.log('Permission denied or insecure origin');
  }
}
```

#### `NetworkError`
Native bridge not available or communication failure.

```javascript
try {
  const devices = await navigator.usb.getDevices();
} catch (error) {
  if (error.name === 'NetworkError') {
    console.log('Native bridge not available');
  }
}
```

### Error Recovery

The extension automatically handles:
- **Bridge Reconnection**: Automatic retry when native bridge restarts
- **Permission Restoration**: Persistent permissions survive browser restart
- **Device Reconnection**: Automatic device reconnection handling

## Performance Optimization

### Memory Management

- **Device Caching**: Connected devices are cached to avoid repeated enumeration
- **Permission Caching**: Permissions cached in memory and storage
- **Lazy Loading**: Hardware libraries loaded only when needed

### Best Practices

1. **Close Connections**: Always close device connections when done
2. **Handle Errors**: Implement proper error handling for all operations
3. **Check Permissions**: Verify permissions before attempting operations
4. **Batch Operations**: Group multiple operations to reduce overhead

```javascript
// Good practice
try {
  const device = await navigator.usb.requestDevice({ filters: [filter] });
  await device.open();

  // Perform operations
  await device.selectConfiguration(1);
  await device.claimInterface(0);

  // Always clean up
  await device.close();
} catch (error) {
  console.error('USB operation failed:', error);
}
```

## Security Considerations

### Content Security Policy

The extension works with strict CSP policies:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self';">
```

### Data Protection

- **No Data Collection**: Extension does not collect user data
- **Local Storage Only**: Permissions stored locally in browser
- **Encrypted Communication**: Native messaging uses secure channels

### Origin Validation

All device access requests are validated against the requesting origin:

- HTTPS origins only (except localhost for development)
- No cross-origin device sharing
- Per-origin permission isolation

## Debugging

### Extension Console

1. Open Chrome DevTools
2. Go to Extensions page
3. Click "Inspect views: background page"
4. Check console for extension logs

### Native Bridge Logs

```bash
# View bridge logs
tail -f ~/.d4ab/logs/bridge.log

# Debug mode
d4ab-bridge --debug --log-level debug
```

### Common Issues

#### "Native bridge not available"
- Ensure native bridge is installed and running
- Check native messaging host registration
- Verify bridge permissions

#### "Permission denied"
- Check origin is HTTPS (or localhost)
- Verify user granted permission
- Check browser permission settings

#### "Device not found"
- Ensure device is connected
- Check device drivers are installed
- Verify device filters are correct

## Development

### Building the Extension

```bash
cd frontend
npm install

# Development build (with source maps)
npm run build:dev

# Production build (optimized)
npm run build

# Create distributable package
npm run package

# Watch mode for development
npm run watch
```

### Testing

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:coverage

# E2E tests with Playwright
npm run test:e2e

# Security audit tests
npm run test:security

# Cross-browser compatibility tests
npm run test:browsers

# Lint extension code
npm run lint

# Format code
npm run format
```

### Local Development

#### Setup for Development

1. **Load Extension in Chrome/Edge:**
   ```bash
   # Navigate to chrome://extensions/
   # Enable "Developer mode"
   # Click "Load unpacked"
   # Select the frontend/ directory
   ```

2. **Load Extension in Firefox:**
   ```bash
   # Navigate to about:debugging
   # Click "This Firefox"
   # Click "Load Temporary Add-on"
   # Select frontend/manifest.json
   ```

3. **Load Extension in Safari:**
   ```bash
   # Convert extension for Safari
   xcrun safari-web-extension-converter frontend/
   # Open the generated Xcode project
   # Build and run the project
   # Enable the extension in Safari Preferences → Extensions
   ```

4. **Install and Start Native Bridge:**
   ```bash
   cd ../backend
   npm install
   node src/bridge_cli.js --debug
   ```

5. **Test Extension Functionality:**
   - Open any webpage (e.g., https://example.com)
   - Open browser developer console
   - Test API availability and device enumeration

#### Development Workflow

```bash
# Start development mode with auto-reload
npm run dev

# Run tests in watch mode
npm run test:watch

# Build and reload extension
npm run build && # reload extension in browser

# Package for distribution
npm run package
```

#### Extension Development Tips

- **Hot Reload**: Use `npm run watch` for automatic rebuilds
- **Debug Console**: Access background script console via `chrome://extensions/`
- **Content Script Debugging**: Use regular page DevTools
- **Native Messaging**: Test bridge connectivity with `chrome://extensions/`
- **Permissions**: Check manifest permissions match actual usage

#### Testing with Sample Pages

Create test HTML files to verify functionality:

```html
<!DOCTYPE html>
<html>
<head>
    <title>D4AB Test Page</title>
</head>
<body>
    <h1>Hardware Access Test</h1>

    <button onclick="testUSB()">Test USB</button>
    <button onclick="testSerial()">Test Serial</button>
    <button onclick="testBluetooth()">Test Bluetooth</button>

    <div id="results"></div>

    <script>
        async function testUSB() {
            try {
                const devices = await navigator.usb.getDevices();
                document.getElementById('results').innerHTML =
                    `Found ${devices.length} USB devices`;
            } catch (error) {
                document.getElementById('results').innerHTML =
                    `USB Error: ${error.message}`;
            }
        }

        async function testSerial() {
            try {
                const ports = await navigator.serial.getPorts();
                document.getElementById('results').innerHTML =
                    `Found ${ports.length} serial ports`;
            } catch (error) {
                document.getElementById('results').innerHTML =
                    `Serial Error: ${error.message}`;
            }
        }

        async function testBluetooth() {
            try {
                const devices = await navigator.bluetooth.getDevices();
                document.getElementById('results').innerHTML =
                    `Found ${devices.length} Bluetooth devices`;
            } catch (error) {
                document.getElementById('results').innerHTML =
                    `Bluetooth Error: ${error.message}`;
            }
        }
    </script>
</body>
</html>
```

## API Compatibility

The extension provides compatibility with standard Web APIs:

- **WebUSB**: Full compatibility with WebUSB specification
- **Web Serial**: Full compatibility with Web Serial API
- **Web Bluetooth**: Core compatibility with Web Bluetooth API

## Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Additional guides and examples
- **Community**: Discord server for developers

For more information, visit the [project repository](https://github.com/d4ab/hardware-bridge).