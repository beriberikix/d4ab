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

describe('Integration Test: Serial GPS Reading Scenario', () => {
  test('maps serial open/close to connect/disconnect', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    expect(worker.normalizeAPICall('open', { baudRate: 9600 }).method).toBe('connect');
    expect(worker.normalizeAPICall('close', {}).method).toBe('disconnect');
  });

  test('encodes write payloads as base64', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    const normalized = worker.normalizeAPICall('write', { data: [0x24, 0x47, 0x50, 0x52] });

    expect(normalized.method).toBe('write');
    expect(normalized.params.data).toBe(Buffer.from([0x24, 0x47, 0x50, 0x52]).toString('base64'));
  });

  test('decodes read payloads from base64 to bytes', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    const normalized = worker.normalizeAPIResponse('read', {
      data: Buffer.from('$GPRMC').toString('base64')
    });

    expect(Array.isArray(normalized.data)).toBe(true);
    expect(normalized.bytesRead).toBe(6);
  });
});
