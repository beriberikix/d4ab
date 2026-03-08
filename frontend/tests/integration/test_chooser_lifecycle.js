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
    URLSearchParams,
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
        getURL: (value) => `chrome-extension://unit-test/${value}`,
        onMessage: { addListener: () => {} },
        onConnect: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        lastError: null
      },
      windows: {
        create: (_options, callback) => callback({ id: 55 }),
        update: (_windowId, _options, callback) => callback && callback(),
        remove: (_windowId, callback) => callback && callback(),
        onRemoved: { addListener: () => {} }
      },
      notifications: {
        create: () => {}
      },
      tabs: {
        create: (_options, callback) => callback && callback({ id: 77 }),
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

describe('Integration Test: Device chooser lifecycle', () => {
  test('resolves request after explicit chooser selection', async () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    worker.sendNativeRequest = jest.fn().mockResolvedValue({
      devices: [
        {
          id: 'usb:2341:0043',
          type: 'usb',
          name: 'Arduino Uno',
          vendorId: 0x2341,
          productId: 0x0043,
          connected: false
        }
      ]
    });

    const chooserPromise = worker.handleChooserDeviceRequest('https://chooser.test', {
      type: 'usb',
      filters: [{ vendorId: 0x2341, productId: 0x0043 }]
    });

    const chooserId = Array.from(worker.chooserRequests.keys())[0];
    expect(chooserId).toBeTruthy();

    const response = await new Promise((resolve) => {
      worker.handleUISelectDevice(
        { chooserId, deviceId: 'usb:2341:0043' },
        { url: 'chrome-extension://unit-test/src/ui/device_center.html' },
        resolve
      );
    });

    expect(response.granted).toBe(true);
    expect(response.fulfilledChooser).toBe(true);

    const selectedDevice = await chooserPromise;
    expect(selectedDevice.id).toBe('usb:2341:0043');
    expect(worker.chooserRequests.size).toBe(0);
  });

  test('rejects request when chooser is explicitly cancelled', async () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    const chooserPromise = worker.handleChooserDeviceRequest('https://cancel.test', {
      type: 'serial'
    });

    const chooserId = Array.from(worker.chooserRequests.keys())[0];
    expect(chooserId).toBeTruthy();

    const response = await new Promise((resolve) => {
      worker.handleUICancelChooser(
        { chooserId, reason: 'User cancelled chooser' },
        resolve
      );
    });

    expect(response.cancelled).toBe(true);
    await expect(chooserPromise).rejects.toThrow('User cancelled chooser');
    expect(worker.chooserRequests.size).toBe(0);
  });

  test('rejects request when chooser times out', async () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    worker.chooserTimeoutMs = 20;

    const chooserPromise = worker.handleChooserDeviceRequest('https://timeout.test', {
      type: 'bluetooth',
      scanDuration: 3000
    });

    await expect(chooserPromise).rejects.toThrow('timed out');
    expect(worker.chooserRequests.size).toBe(0);
  });

  test('reuses active chooser for repeated requests in same scope', async () => {
    const BackgroundServiceWorker = loadWorkerClass();
    const worker = new BackgroundServiceWorker();

    worker.openChooserWindow = jest.fn().mockResolvedValue(undefined);

    const firstPromise = worker.handleChooserDeviceRequest('https://duplicate.test', {
      type: 'usb'
    });

    const secondPromise = worker.handleChooserDeviceRequest('https://duplicate.test', {
      type: 'usb'
    });

    expect(worker.openChooserWindow).toHaveBeenCalledTimes(1);
    expect(worker.chooserRequests.size).toBe(1);

    const chooserId = Array.from(worker.chooserRequests.keys())[0];
    const chooserRequest = worker.chooserRequests.get(chooserId);
    expect(chooserRequest.waiters.length).toBe(2);

    worker.resolveChooserRequest(chooserId, {
      id: 'usb:abc',
      type: 'usb'
    });

    await expect(firstPromise).resolves.toMatchObject({ id: 'usb:abc', type: 'usb' });
    await expect(secondPromise).resolves.toMatchObject({ id: 'usb:abc', type: 'usb' });
  });
});
