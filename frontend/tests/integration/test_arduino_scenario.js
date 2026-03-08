const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWorkerClass() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/background/service_worker.js'),
    'utf8'
  );

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    URL,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Map,
    Uint8Array,
    chrome: {
      runtime: {
        connectNative: () => ({
          onMessage: { addListener: () => {} },
          onDisconnect: { addListener: () => {} },
          postMessage: () => {}
        }),
        onMessage: { addListener: () => {} },
        onConnect: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        lastError: null
      },
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => ({})
        }
      }
    }
  };

  vm.runInNewContext(`${source}\nmodule.exports = { BackgroundServiceWorker };`, sandbox, {
    filename: 'service_worker.js'
  });

  return sandbox.module.exports.BackgroundServiceWorker;
}

describe('Integration Test: Arduino LED Control Scenario', () => {
  test('normalizes transferOut to native write with base64 payload', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    const normalized = worker.normalizeAPICall('transferOut', {
      endpointNumber: 1,
      data: [0x01]
    });

    expect(normalized.method).toBe('write');
    expect(normalized.params.data).toBe('AQ==');
  });

  test('normalizes transferIn response data to byte array', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    const response = worker.normalizeAPIResponse('transferIn', {
      data: Buffer.from([0x11, 0x22, 0x33]).toString('base64')
    });

    expect(response.data).toEqual([0x11, 0x22, 0x33]);
    expect(response.bytesRead).toBe(3);
  });

  test('grants and verifies permission before API calls', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    worker.grantPermission('https://arduino.example', 'usb:2341:0043', ['read', 'write', 'control']);

    expect(worker.hasPermission('https://arduino.example', 'usb:2341:0043', 'write')).toBe(true);
    expect(worker.hasPermission('https://arduino.example', 'usb:2341:0043', 'control')).toBe(true);
    expect(worker.hasPermission('https://arduino.example', 'usb:2341:0043', 'admin')).toBe(false);
  });
});
