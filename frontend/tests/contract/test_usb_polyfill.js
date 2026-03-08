const fs = require('fs');
const path = require('path');

describe('Contract Test: USB API Polyfill', () => {
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

  test('defines USB polyfill classes and methods', () => {
    expect(polyfillSource).toContain('class USBDevice');
    expect(polyfillSource).toContain('class USBPolyfill');
    expect(polyfillSource).toContain('async requestDevice(options = {})');
    expect(polyfillSource).toContain('async getDevices()');
    expect(polyfillSource).toContain('async transferOut(endpointNumber, data)');
    expect(polyfillSource).toContain('async transferIn(endpointNumber, length)');
    expect(polyfillSource).toContain('async controlTransferOut(setup, data)');
    expect(polyfillSource).toContain('async controlTransferIn(setup, length)');
  });

  test('routes USB requests through bridge message types', () => {
    expect(polyfillSource).toContain("'USB_GET_DEVICES'");
    expect(polyfillSource).toContain("'USB_REQUEST_DEVICE'");
    expect(polyfillSource).toContain("'USB_API_CALL'");
  });

  test('normalizes USB transfer calls to native write/read methods', () => {
    expect(serviceWorkerSource).toContain("case 'transferOut'");
    expect(serviceWorkerSource).toContain("case 'controlTransferOut'");
    expect(serviceWorkerSource).toContain("case 'transferIn'");
    expect(serviceWorkerSource).toContain("case 'controlTransferIn'");
    expect(serviceWorkerSource).toContain("method: 'write'");
    expect(serviceWorkerSource).toContain("method: 'read'");
  });
});
