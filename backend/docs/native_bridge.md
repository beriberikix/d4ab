# D4AB Hardware Bridge - Native Bridge Documentation

## Overview

The D4AB Native Bridge is a Node.js application that provides hardware access capabilities to web browsers through a browser extension. It acts as a secure intermediary between web applications and local hardware devices including USB, Serial, and Bluetooth devices.

The native bridge is browser-agnostic and works with Chrome, Firefox, Edge, and Safari through their respective extension architectures.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser       │    │   Native Bridge  │    │    Hardware     │
│   Extension     │    │                  │    │                 │
│                 │◄──►│  JSON-RPC 2.0    │◄──►│  USB Devices    │
│ Native Messaging│    │  Message Handler │    │  Serial Ports   │
│ stdin/stdout    │    │  Hardware Libs   │    │  Bluetooth      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Installation

### Prerequisites

- Node.js 18.0 or higher
- Platform-specific hardware access permissions
- Native dependencies for hardware libraries

### Automatic Installation

```bash
# Download and run installer
curl -fsSL https://get.d4ab.dev | sh

# Or via npm
npm install -g d4ab-hardware-bridge
```

### Manual Installation

```bash
# Clone repository
git clone https://github.com/beriberikix/webhw.git
cd webhw/backend

# Install dependencies
npm install

# Build application
npm run build

# Install globally
npm link
```

### Platform Setup

#### Windows
```cmd
# Install Windows Build Tools
npm install -g windows-build-tools

# Install as Windows Service
d4ab-bridge install-service
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Register Launch Agent
d4ab-bridge install-daemon
```

#### Linux
```bash
# Install build dependencies
sudo apt-get install build-essential libudev-dev

# Install systemd service
d4ab-bridge install-service
```

## Command Line Interface

### Basic Usage

```bash
# Start bridge in foreground
d4ab-bridge

# Start with debug logging
d4ab-bridge --debug --log-level debug

# Show version
d4ab-bridge --version

# Display help
d4ab-bridge --help
```

### Available Commands

#### Device Enumeration
```bash
# List all devices
d4ab-bridge --enumerate all

# List USB devices only
d4ab-bridge --enumerate usb

# List serial ports
d4ab-bridge --enumerate serial

# List Bluetooth devices
d4ab-bridge --enumerate bluetooth
```

#### Device Connection
```bash
# Connect to specific device
d4ab-bridge --connect usb:1234:5678

# Connect with custom options
d4ab-bridge --connect serial:COM1 --baud-rate 9600
```

#### Configuration
```bash
# Set log level
d4ab-bridge --log-level info

# Set custom log file
d4ab-bridge --log-file /var/log/d4ab-bridge.log

# Enable performance monitoring
d4ab-bridge --monitor

# Set maximum concurrent connections
d4ab-bridge --max-connections 5
```

## JSON-RPC API

The bridge communicates using JSON-RPC 2.0 over stdin/stdout for native messaging.

### Message Format

```json
{
  "jsonrpc": "2.0",
  "method": "methodName",
  "params": { "key": "value" },
  "id": "unique-request-id"
}
```

### Supported Methods

#### Device Enumeration

##### `enumerate`
Lists available hardware devices.

**Parameters:**
- `type` (String): Device type filter ('usb', 'serial', 'bluetooth', 'all')
- `includeDisconnected` (Boolean): Include disconnected devices

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "devices": [
      {
        "id": "usb:1234:5678",
        "name": "Arduino Uno",
        "type": "usb",
        "vendorId": 4660,
        "productId": 26232,
        "status": "connected",
        "capabilities": ["read", "write", "control"],
        "lastSeen": "2024-01-01T12:00:00Z"
      }
    ],
    "timestamp": "2024-01-01T12:00:00Z",
    "type": "all"
  },
  "id": "req_123"
}
```

#### Device Connection

##### `connect`
Establishes connection to a specific device.

**Parameters:**
- `deviceId` (String): Device identifier
- `options` (Object): Connection options
  - `baudRate` (Number): For serial devices
  - `timeout` (Number): Connection timeout in ms

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "sessionId": "session_abc123",
    "deviceId": "usb:1234:5678",
    "status": "connected",
    "startedAt": "2024-01-01T12:00:00Z"
  },
  "id": "req_124"
}
```

#### Data Operations

##### `read`
Reads data from connected device.

**Parameters:**
- `length` (Number): Number of bytes to read (1-65536)
- `timeout` (Number): Read timeout in ms

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "data": "SGVsbG8gV29ybGQ=",
    "bytesRead": 11,
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "id": "req_125"
}
```

##### `write`
Writes data to connected device.

**Parameters:**
- `data` (String): Base64-encoded data to write
- `timeout` (Number): Write timeout in ms

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "bytesWritten": 11,
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "id": "req_126"
}
```

##### `disconnect`
Closes connection to device.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "sessionId": "session_abc123",
    "timestamp": "2024-01-01T12:00:00Z"
  },
  "id": "req_127"
}
```

#### System Information

##### `heartbeat`
Health check and system status.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "healthy",
    "timestamp": "2024-01-01T12:00:00Z",
    "uptime": 3600000,
    "activeConnections": 2,
    "activeSessions": 2,
    "activeRequests": 0,
    "version": "1.0.0"
  },
  "id": "req_128"
}
```

### Error Codes

| Code | Message | Description |
|------|---------|-------------|
| -1000 | Generic hardware error | Unspecified hardware issue |
| -1001 | Permission denied | Insufficient permissions |
| -1002 | Device not found | Device not available |
| -1003 | Device busy | Device in use by another process |
| -1004 | Timeout | Operation timed out |
| -1005 | Connection error | Communication failure |
| -1006 | Invalid operation | Operation not supported |
| -32600 | Invalid Request | Malformed JSON-RPC |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid parameters |
| -32603 | Internal error | Server error |
| -32700 | Parse error | JSON parsing failed |

### Example Error Response
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -1002,
    "message": "Device not found",
    "data": {
      "deviceType": "usb",
      "operation": "connect",
      "originalError": "USBError"
    }
  },
  "id": "req_129"
}
```

## Hardware Libraries

### USB Library

Built on `node-usb` with additional abstractions for device management.

**Features:**
- Device enumeration and filtering
- Bulk transfer support
- Configuration and interface management
- Endpoint discovery

**Supported Operations:**
- Device listing with vendor/product filtering
- Connection establishment
- Data transfer (IN/OUT endpoints)
- Device configuration

### Serial Library

Built on `@serialport/bindings-cpp` for cross-platform serial communication.

**Features:**
- Port enumeration
- Configurable baud rates, data bits, parity
- Flow control support
- Buffer management

**Supported Platforms:**
- Windows (COM ports)
- macOS (cu.* and tty.* devices)
- Linux (/dev/tty* devices)

### Bluetooth Library

Built on `@abandonware/noble` for Bluetooth Low Energy communication.

**Features:**
- Device scanning and discovery
- GATT service interaction
- Characteristic read/write
- Advertisement monitoring

**Limitations:**
- BLE only (not classic Bluetooth)
- Platform-specific permissions required

## Configuration

### Configuration File

Located at `~/.d4ab/config.json`:

```json
{
  "logging": {
    "level": "info",
    "file": "~/.d4ab/logs/bridge.log",
    "maxSize": "10MB",
    "maxFiles": 5
  },
  "hardware": {
    "maxConnections": 10,
    "defaultTimeout": 5000,
    "enableUSB": true,
    "enableSerial": true,
    "enableBluetooth": true
  },
  "security": {
    "requirePermissions": true,
    "allowedOrigins": ["https://*"],
    "deniedDevices": []
  },
  "performance": {
    "cacheDevices": true,
    "cacheDuration": 300000,
    "enableMonitoring": false
  }
}
```

### Environment Variables

```bash
# Log level override
export D4AB_LOG_LEVEL=debug

# Custom config file
export D4AB_CONFIG_FILE=/etc/d4ab/config.json

# Disable specific hardware types
export D4AB_DISABLE_USB=true
export D4AB_DISABLE_SERIAL=false
export D4AB_DISABLE_BLUETOOTH=false

# Performance tuning
export D4AB_MAX_CONNECTIONS=5
export D4AB_CACHE_DURATION=600000
```

## Security

### Permission Model

The bridge implements a multi-layered permission system:

1. **System Permissions**: OS-level hardware access
2. **Application Permissions**: Bridge-level device filtering
3. **Origin Permissions**: Extension-mediated origin validation

### Access Control

- **Device Filtering**: Configure allowed/denied devices
- **Origin Validation**: Verify requesting origin
- **Operation Limiting**: Restrict operations per device type

### Data Protection

- **No Data Persistence**: Bridge doesn't store user data
- **Encrypted Communication**: Native messaging uses secure channels
- **Audit Logging**: All operations logged for security review

## Monitoring and Logging

### Log Levels

- **error**: Critical errors only
- **warn**: Warnings and errors
- **info**: General information (default)
- **debug**: Detailed debugging information
- **trace**: Verbose operation tracing

### Log Format

```
[2024-01-01T12:00:00.000Z] [INFO] [USB] Device enumeration completed: 3 devices found
[2024-01-01T12:00:01.000Z] [DEBUG] [Serial] Opening port COM3 with baud rate 9600
[2024-01-01T12:00:02.000Z] [ERROR] [Bluetooth] Device connection failed: Permission denied
```

### Performance Monitoring

```bash
# Enable monitoring
d4ab-bridge --monitor

# View real-time stats
curl http://localhost:8080/stats

# Memory usage
curl http://localhost:8080/memory
```

## Troubleshooting

### Common Issues

#### Bridge Won't Start
```bash
# Check node version
node --version  # Should be 18.0+

# Check permissions
ls -la /dev/tty*  # Serial permissions
lsusb             # USB device visibility

# Check logs
tail -f ~/.d4ab/logs/bridge.log
```

#### Device Not Found
```bash
# List system devices
d4ab-bridge --enumerate all --verbose

# Check device permissions
sudo usermod -a -G dialout $USER  # Linux serial
# Logout and login again

# Verify USB rules (Linux)
sudo cp misc/99-d4ab.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
```

#### Connection Failures
```bash
# Test device access directly
sudo dmesg | tail  # Check for hardware errors

# Verify bridge connectivity
echo '{"jsonrpc":"2.0","method":"heartbeat","id":1}' | d4ab-bridge

# Check native messaging
chrome://extensions  # Verify extension loaded
```

#### Performance Issues
```bash
# Monitor resource usage
d4ab-bridge --monitor &
htop  # Watch CPU/memory usage

# Reduce concurrent connections
d4ab-bridge --max-connections 3

# Disable unused hardware types
export D4AB_DISABLE_BLUETOOTH=true
```

### Debug Mode

```bash
# Start with maximum verbosity
d4ab-bridge --debug --log-level trace --monitor

# Enable specific debug categories
DEBUG=d4ab:usb,d4ab:serial d4ab-bridge

# Profile performance
node --prof d4ab-bridge
```

## Development

### Building from Source

```bash
git clone https://github.com/beriberikix/webhw.git
cd webhw/backend

# Install dependencies
npm install

# Install platform-specific native dependencies
npm run install:native

# Run tests
npm test

# Build application
npm run build

# Create distribution package
npm run package

# Cross-platform builds
npm run build:windows
npm run build:macos
npm run build:linux
```

### Development Workflow

```bash
# Start in development mode with auto-restart
npm run dev

# Start with debug logging
npm run dev:debug

# Run with specific hardware enabled
D4AB_ENABLE_USB=true D4AB_ENABLE_SERIAL=true npm run dev

# Profile performance
npm run profile

# Generate API documentation
npm run docs:generate
```

### Testing

```bash
# Unit tests only
npm run test:unit

# Integration tests (requires hardware)
npm run test:integration

# Performance tests
npm run test:performance

# Contract tests (JSON-RPC compliance)
npm run test:contract

# Hardware-specific tests
npm run test:usb
npm run test:serial
npm run test:bluetooth

# Test coverage report
npm run test:coverage

# Continuous testing
npm run test:watch
```

### API Development

```bash
# Start development server with hot reload
npm run dev

# Test JSON-RPC endpoints manually
echo '{"jsonrpc":"2.0","method":"enumerate","params":{"type":"all"},"id":1}' | \
  node src/bridge_cli.js

echo '{"jsonrpc":"2.0","method":"heartbeat","id":2}' | \
  node src/bridge_cli.js

# Validate JSON-RPC compliance
npm run test:jsonrpc

# Load test the bridge
npm run test:load

# API documentation generation
npm run docs:api
```

### Hardware Library Development

#### Adding New Device Support

1. **Create Device Handler:**
   ```bash
   # Create new device type handler
   cp src/lib/usb_lib.js src/lib/new_device_lib.js
   ```

2. **Update Message Handler:**
   ```javascript
   // Add to src/services/message_handler.js
   const NewDeviceLib = require('../lib/new_device_lib');
   ```

3. **Add Test Coverage:**
   ```bash
   # Create test file
   cp tests/unit/usb_lib.test.js tests/unit/new_device_lib.test.js
   ```

4. **Update Configuration:**
   ```json
   // Add to config.json
   {
     "hardware": {
       "enableNewDevice": true
     }
   }
   ```

#### Testing Hardware Libraries

```bash
# Test USB library specifically
npm run test:usb:unit
npm run test:usb:integration

# Test Serial library
npm run test:serial:unit
npm run test:serial:integration

# Test Bluetooth library
npm run test:bluetooth:unit
npm run test:bluetooth:integration

# Mock hardware testing
npm run test:mock-hardware
```

### Native Messaging Development

#### Testing Native Messaging

```bash
# Test native messaging host registration
node src/bridge_cli.js install-host --dry-run

# Test message flow
echo '{"jsonrpc":"2.0","method":"heartbeat","id":1}' | \
  node src/bridge_cli.js --native-messaging

# Debug native messaging
node src/bridge_cli.js --debug --native-messaging 2>debug.log
```

#### Chrome Extension Communication

```javascript
// Test from browser extension
chrome.runtime.sendNativeMessage('com.d4ab.hardware.bridge', {
  jsonrpc: '2.0',
  method: 'heartbeat',
  id: 'test123'
}, response => {
  console.log('Bridge response:', response);
});
```

### Build System

#### Creating Installers

```bash
# Build installer for current platform
cd ../installer
node build_installer.js

# Build for all platforms
npm run build:all-platforms

# Build specific platform
node build_installer.js --platform linux --arch x64

# Test installer
npm run test:installer
```

#### Binary Packaging

```bash
# Create standalone executable
npm run package:binary

# Package with Node.js runtime
npm run package:standalone

# Create platform-specific packages
npm run package:windows
npm run package:macos
npm run package:linux
```

### Debugging and Profiling

#### Debug Configuration

```bash
# Enable debug logging
export D4AB_LOG_LEVEL=debug
export D4AB_DEBUG_CATEGORIES=usb,serial,bluetooth

# Start with Node.js debugger
node --inspect src/bridge_cli.js

# Start with profiling
node --prof src/bridge_cli.js
```

#### Performance Monitoring

```bash
# Monitor memory usage
node --trace-gc src/bridge_cli.js

# Profile CPU usage
node --prof src/bridge_cli.js
node --prof-process isolate-*.log > profile.txt

# Monitor system resources
npm run monitor:performance
```

#### Hardware Debugging

```bash
# List system devices
node src/bridge_cli.js --enumerate all --verbose

# Test device connectivity
node src/bridge_cli.js --test-device usb:1234:5678

# Monitor device events
node src/bridge_cli.js --monitor-devices

# Debug hardware permissions
node src/bridge_cli.js --check-permissions
```

## Hardware Support

### USB Devices

**Supported Classes:**
- HID (Human Interface Devices)
- CDC (Communication Device Class)
- Mass Storage
- Custom vendor-specific devices

**Requirements:**
- Compatible USB drivers installed
- Appropriate user permissions
- Device not claimed by other processes

### Serial Devices

**Supported Types:**
- Native serial ports
- USB-to-serial adapters
- Bluetooth serial profiles
- Virtual serial ports

**Baud Rates:** 110 to 921600 bps
**Data Formats:** 7/8 data bits, 1/2 stop bits, none/even/odd parity

### Bluetooth Devices

**Supported Profiles:**
- Generic Access Profile (GAP)
- Generic Attribute Profile (GATT)
- Custom BLE services

**Requirements:**
- Bluetooth 4.0+ adapter
- Platform-specific Bluetooth stack
- Appropriate permissions

## Performance Specifications

- **Device Enumeration**: < 5 seconds for 100 devices
- **Connection Establishment**: < 2 seconds per device
- **Data Transfer**: Up to 2 MB/s (hardware dependent)
- **Memory Usage**: < 100 MB for 10 concurrent connections
- **CPU Usage**: < 5% idle, < 20% under load

## Support and Maintenance

### Updates

```bash
# Check for updates
d4ab-bridge --check-update

# Update to latest version
npm update -g d4ab-hardware-bridge

# Update development installation
git pull && npm install && npm run build
```

### Backup and Recovery

```bash
# Backup configuration
cp ~/.d4ab/config.json ~/d4ab-config-backup.json

# Reset to defaults
rm -rf ~/.d4ab && d4ab-bridge --init

# Restore configuration
cp ~/d4ab-config-backup.json ~/.d4ab/config.json
```

## License and Legal

- **License**: MIT License
- **Privacy**: No user data collection
- **Compliance**: Hardware regulations vary by region
- **Liability**: Use at your own risk

For technical support, visit: https://github.com/beriberikix/webhw/issues