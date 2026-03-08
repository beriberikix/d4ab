const fs = require('fs');
const path = require('path');

describe('Contract Test: Device Chooser Flow', () => {
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

  test('polyfill continues to route requestDevice/requestPort through DEVICE_REQUEST', () => {
    expect(polyfillSource).toContain("'USB_REQUEST_DEVICE'");
    expect(polyfillSource).toContain("'SERIAL_REQUEST_PORT'");
    expect(polyfillSource).toContain("'BLUETOOTH_REQUEST_DEVICE'");
    expect(polyfillSource).toContain("method: 'requestDevice'");
  });

  test('service worker requestDevice path delegates to chooser lifecycle', () => {
    expect(serviceWorkerSource).toContain("if (method === 'requestDevice')");
    expect(serviceWorkerSource).toContain('handleChooserDeviceRequest(origin, params, sender)');
    expect(serviceWorkerSource).toContain("via: 'chooser-ui'");
    expect(serviceWorkerSource).toContain("code: 'REQUEST_ABORTED'");
  });

  test('service worker exposes chooser APIs for extension UI surfaces', () => {
    expect(serviceWorkerSource).toContain("case 'UI_GET_CHOOSER_CONTEXT':");
    expect(serviceWorkerSource).toContain("case 'UI_CANCEL_CHOOSER':");
    expect(serviceWorkerSource).toContain('resolveChooserRequest(chooserId, device)');
    expect(serviceWorkerSource).toContain('rejectChooserRequest(chooserId, error)');
    expect(serviceWorkerSource).toContain('handleChooserWindowClosed(windowId)');
  });
});
