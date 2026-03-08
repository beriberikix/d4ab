const fs = require('fs');
const path = require('path');

describe('Contract Test: Serial API Polyfill', () => {
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

  test('defines serial polyfill classes and key methods', () => {
    expect(polyfillSource).toContain('class SerialPort');
    expect(polyfillSource).toContain('class SerialPolyfill');
    expect(polyfillSource).toContain('async requestPort(options = {})');
    expect(polyfillSource).toContain('async getPorts()');
    expect(polyfillSource).toContain('async open(options = {})');
    expect(polyfillSource).toContain('async close()');
  });

  test('includes serial streaming setup and read loop', () => {
    expect(polyfillSource).toContain('this.readable = new ReadableStream');
    expect(polyfillSource).toContain('this.writable = new WritableStream');
    expect(polyfillSource).toContain('async _startReadLoop(controller)');
    expect(polyfillSource).toContain("method: 'read'");
    expect(polyfillSource).toContain("params: { length: 256, timeout: 250 }");
  });

  test('maps serial open/close semantics to native connect/disconnect', () => {
    expect(polyfillSource).toContain('mapSerialMethod(method)');
    expect(polyfillSource).toContain("if (method === 'open') return 'connect';");
    expect(polyfillSource).toContain("if (method === 'close') return 'disconnect';");
    expect(serviceWorkerSource).toContain("case 'open':");
    expect(serviceWorkerSource).toContain("case 'close':");
  });
});
