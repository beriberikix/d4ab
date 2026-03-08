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

describe('Integration Test: Bluetooth Heart Rate Scenario', () => {
  test('maps open/close API calls to connect/disconnect', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    expect(worker.normalizeAPICall('open', {}).method).toBe('connect');
    expect(worker.normalizeAPICall('close', {}).method).toBe('disconnect');
  });

  test('resolves required capabilities for control and IO operations', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    expect(worker.getRequiredCapability('connect')).toBe('control');
    expect(worker.getRequiredCapability('disconnect')).toBe('control');
    expect(worker.getRequiredCapability('read')).toBe('read');
    expect(worker.getRequiredCapability('write')).toBe('write');
  });

  test('tracks permissions by origin and device key', () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    worker.grantPermission('https://hr.example', '001122334455', ['read']);

    expect(worker.hasPermission('https://hr.example', '001122334455', 'read')).toBe(true);
    expect(worker.hasPermission('https://hr.example', '001122334455', 'write')).toBe(false);
  });
});
