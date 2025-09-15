# Quickstart Guide: Hardware Access Bridge

## Prerequisites

- Node.js 18+ installed
- Chrome, Firefox, or Safari browser
- Physical hardware device (USB, Serial, or Bluetooth) for testing

## Installation

### 1. Install Native Bridge Application

```bash
# Download installer for your platform
curl -L https://github.com/d4ab/hardware-bridge/releases/latest/download/installer-macos.pkg -o installer.pkg

# Run installer (creates Native Messaging manifest)
sudo installer -pkg installer.pkg -target /

# Verify installation
/Applications/D4AB/bridge-cli --version
# Expected: D4AB Hardware Bridge v1.0.0
```

### 2. Install Browser Extension

**Chrome/Edge:**
1. Visit Chrome Web Store: `chrome://extensions/`
2. Search "D4AB Hardware Bridge"
3. Click "Add to Chrome"
4. Grant Native Messaging permission

**Firefox:**
1. Visit Firefox Add-ons: `about:addons`
2. Search "D4AB Hardware Bridge"
3. Click "Add to Firefox"
4. Grant Native Messaging permission

**Safari:**
1. Download extension from Mac App Store
2. Enable in Safari Preferences → Extensions
3. Grant Native Messaging permission

## Quick Test

### 1. Verify Extension Communication

Open browser developer console and run:

```javascript
// Test if polyfill is loaded
console.log('USB available:', !!navigator.usb);
console.log('Serial available:', !!navigator.serial);
console.log('Bluetooth available:', !!navigator.bluetooth);

// Expected output:
// USB available: true
// Serial available: true
// Bluetooth available: true
```

### 2. Test Device Enumeration

```javascript
// Test USB device enumeration
navigator.usb.getDevices().then(devices => {
  console.log(`Found ${devices.length} USB devices:`, devices);
});

// Test Serial port enumeration
navigator.serial.getPorts().then(ports => {
  console.log(`Found ${ports.length} serial ports:`, ports);
});

// Expected: List of connected devices (may be empty if none connected)
```

### 3. Request Device Access

```javascript
// Request USB device access (will show permission prompt)
navigator.usb.requestDevice({
  filters: [{ vendorId: 0x2341 }] // Arduino vendor ID
}).then(device => {
  console.log('USB device selected:', device);
  return device.open();
}).then(() => {
  console.log('Device opened successfully');
}).catch(error => {
  console.error('Error:', error);
});

// Expected: Permission dialog → device selection → successful connection
```

## Integration Test Scenarios

### Scenario 1: USB Device Communication

**Given**: Arduino Uno connected via USB
**When**: Webpage requests device access and sends LED control command
**Then**: LED blinks and device responds with status

```javascript
// Test implementation
async function testArduinoLED() {
  try {
    // Request Arduino device
    const device = await navigator.usb.requestDevice({
      filters: [{ vendorId: 0x2341, productId: 0x0043 }]
    });

    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);

    // Send LED ON command
    const data = new Uint8Array([0x01]); // LED ON
    await device.transferOut(1, data);

    // Read response
    const result = await device.transferIn(1, 1);
    console.log('Arduino response:', new Uint8Array(result.data.buffer));

    await device.close();
  } catch (error) {
    console.error('Arduino test failed:', error);
  }
}
```

### Scenario 2: Serial Port Communication

**Given**: Serial device connected (e.g., GPS module)
**When**: Webpage opens port and reads NMEA sentences
**Then**: GPS data received and parsed correctly

```javascript
async function testSerialGPS() {
  try {
    // Request serial port
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    // Set up data reader
    const reader = port.readable.getReader();

    // Read GPS data for 10 seconds
    const timeout = setTimeout(() => reader.cancel(), 10000);

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        console.log('GPS data:', text);
      }
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
      await port.close();
    }
  } catch (error) {
    console.error('Serial test failed:', error);
  }
}
```

### Scenario 3: Bluetooth Device Discovery

**Given**: Bluetooth LE heart rate monitor nearby
**When**: Webpage scans for and connects to device
**Then**: Heart rate data received via notifications

```javascript
async function testBluetoothHeartRate() {
  try {
    // Request Bluetooth device
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');

    // Start notifications
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', event => {
      const value = event.target.value;
      const heartRate = value.getUint16(1, true);
      console.log('Heart rate:', heartRate, 'BPM');
    });

    // Listen for 30 seconds
    setTimeout(() => {
      characteristic.stopNotifications();
      server.disconnect();
    }, 30000);

  } catch (error) {
    console.error('Bluetooth test failed:', error);
  }
}
```

## Performance Validation

### Device Enumeration Performance

```javascript
async function testEnumerationPerformance() {
  const start = performance.now();

  const [usbDevices, serialPorts] = await Promise.all([
    navigator.usb.getDevices(),
    navigator.serial.getPorts()
  ]);

  const duration = performance.now() - start;
  console.log(`Enumeration took ${duration.toFixed(2)}ms`);
  console.log(`Found ${usbDevices.length} USB + ${serialPorts.length} serial devices`);

  // Verify requirement: FR-021 (<5000ms)
  if (duration > 5000) {
    console.error('❌ Enumeration too slow:', duration, 'ms (requirement: <5000ms)');
  } else {
    console.log('✅ Enumeration performance OK:', duration, 'ms');
  }
}
```

### Memory Usage Monitoring

```javascript
function monitorMemoryUsage() {
  if (performance.memory) {
    const { usedJSHeapSize, totalJSHeapSize } = performance.memory;
    console.log(`Memory usage: ${(usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);

    // Verify requirement: FR-014 (<100MB)
    if (usedJSHeapSize > 100 * 1024 * 1024) {
      console.error('❌ Memory usage too high:', usedJSHeapSize / 1024 / 1024, 'MB');
    } else {
      console.log('✅ Memory usage OK:', usedJSHeapSize / 1024 / 1024, 'MB');
    }
  }
}

// Monitor every 10 seconds during testing
setInterval(monitorMemoryUsage, 10000);
```

## Troubleshooting

### Common Issues

**Error: "Extension not found"**
- Verify browser extension is installed and enabled
- Check Native Messaging permission is granted
- Restart browser after installation

**Error: "Native bridge not responding"**
- Verify native bridge is installed: `/Applications/D4AB/bridge-cli --version`
- Check process is running: `ps aux | grep bridge`
- Review system logs for errors

**Error: "Device access denied"**
- Ensure device is connected and recognized by system
- Grant device permissions in system settings
- Try different USB port or cable

**Error: "Permission timeout"**
- User took too long to respond to permission prompt
- Permission dialog may be hidden behind other windows
- Retry the device request

### Debug Logging

Enable debug logging in browser console:

```javascript
// Enable verbose logging
localStorage.setItem('d4ab-debug', 'true');

// View native bridge logs
fetch('chrome-extension://[extension-id]/logs').then(r => r.json()).then(console.log);
```

## Next Steps

1. **Explore Examples**: Visit [examples repository](https://github.com/d4ab/examples) for more device integrations
2. **Read Documentation**: Review [API documentation](https://docs.d4ab.dev) for complete reference
3. **Join Community**: Connect with other developers on [Discord](https://discord.gg/d4ab)
4. **Report Issues**: Submit bugs and feature requests on [GitHub](https://github.com/d4ab/hardware-bridge/issues)

---

**Quickstart Status**: ✅ Complete - Ready for validation testing