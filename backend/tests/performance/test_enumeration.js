const { MessageHandler } = require('../../src/services/message_handler');

describe('Performance Test: Device Enumeration', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('all-device enumeration completes within 5 seconds', async () => {
    const start = Date.now();

    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type: 'all' },
      id: 'perf-001'
    });

    const duration = Date.now() - start;

    expect(response.error).toBeUndefined();
    expect(Array.isArray(response.result.devices)).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  test('single-type enumerations stay within tighter thresholds', async () => {
    const usbStart = Date.now();
    const usbResponse = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type: 'usb' },
      id: 'perf-002-usb'
    });
    const usbDuration = Date.now() - usbStart;

    const serialStart = Date.now();
    const serialResponse = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type: 'serial' },
      id: 'perf-002-serial'
    });
    const serialDuration = Date.now() - serialStart;

    expect(usbResponse.error).toBeUndefined();
    expect(serialResponse.error).toBeUndefined();
    expect(usbDuration).toBeLessThan(3000);
    expect(serialDuration).toBeLessThan(3000);
  });

  test('concurrent enumerations complete without request failures', async () => {
    const requests = [
      { jsonrpc: '2.0', method: 'enumerate', params: { type: 'usb' }, id: 'perf-003-usb' },
      { jsonrpc: '2.0', method: 'enumerate', params: { type: 'serial' }, id: 'perf-003-serial' },
      { jsonrpc: '2.0', method: 'enumerate', params: { type: 'bluetooth' }, id: 'perf-003-bluetooth' }
    ];

    const start = Date.now();
    const responses = await Promise.all(requests.map((request) => messageHandler.handleMessage(request)));
    const duration = Date.now() - start;

    for (const response of responses) {
      expect(response.error).toBeUndefined();
      expect(Array.isArray(response.result.devices)).toBe(true);
    }
    expect(duration).toBeLessThan(8000);
  });

  test('handles large mocked result sets efficiently', async () => {
    const mockDevices = Array.from({ length: 50 }, (_, index) => ({
      toJSON: () => ({
        id: `usb:1234:${(1000 + index).toString(16)}`,
        type: 'usb',
        name: `Mock USB ${index}`,
        vendorId: 0x1234,
        productId: 1000 + index,
        status: 'connected',
        capabilities: ['read', 'write'],
        lastSeen: new Date().toISOString()
      })
    }));

    jest.spyOn(messageHandler, 'enumerateDevices').mockResolvedValue(mockDevices);

    const start = Date.now();
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type: 'usb' },
      id: 'perf-004'
    });
    const duration = Date.now() - start;

    expect(response.error).toBeUndefined();
    expect(response.result.devices.length).toBe(50);
    expect(duration).toBeLessThan(1000);
  });
});
