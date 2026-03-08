const fs = require('fs');
const path = require('path');

describe('Contract Test: Bluetooth API Polyfill', () => {
  let polyfillSource;
  let serviceWorkerSource;

  beforeAll(() => {
    polyfillSource = fs.readFileSync(
      path.join(__dirname, '../../src/content/polyfill_bridge.js'),
      'utf8'
    );
    serviceWorkerSource = fs.readFileSync(
      path.join(__dirname, '../../src/background/service_worker.js'),
      'utf8'
    );
  });

  test('defines Bluetooth polyfill classes', () => {
    expect(polyfillSource).toContain('class BluetoothPolyfill');
    expect(polyfillSource).toContain('class BluetoothDevice');
    expect(polyfillSource).toContain('class BluetoothRemoteGATTServer');
    expect(polyfillSource).toContain('async requestDevice(options = {})');
    expect(polyfillSource).toContain('async connect()');
    expect(polyfillSource).toContain('disconnect()');
  });

  test('routes Bluetooth requests through bridge message types', () => {
    expect(polyfillSource).toContain("'BLUETOOTH_REQUEST_DEVICE'");
    expect(polyfillSource).toContain("'BLUETOOTH_API_CALL'");
    expect(polyfillSource).toContain('mapBluetoothMethod(method)');
    expect(polyfillSource).toContain("if (method === 'open') return 'connect';");
    expect(polyfillSource).toContain("if (method === 'close') return 'disconnect';");
  });

  test('service worker enforces capability checks before API calls', () => {
    expect(serviceWorkerSource).toContain('getRequiredCapability(method)');
    expect(serviceWorkerSource).toContain('hasPermission(origin, deviceId, requiredCapability)');
    expect(serviceWorkerSource).toContain("code: 'PERMISSION_DENIED'");
  });
});
