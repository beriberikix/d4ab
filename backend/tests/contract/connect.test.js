const { MessageHandler } = require('../../src/services/message_handler');

describe('Contract Test: connect method', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('accepts valid connect request with test device', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'test-usb-device-001' },
      id: 'conn-001'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.sessionId).toBeDefined();
    expect(response.result.deviceId).toBe('test-usb-device-001');
    expect(response.result.status).toBe('active');
  });

  test('rejects connect request without deviceId', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: {},
      id: 'conn-002'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('prevents duplicate connection attempts to same device', async () => {
    const first = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'test-usb-device-002' },
      id: 'conn-003'
    });

    const second = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'test-usb-device-002' },
      id: 'conn-004'
    });

    expect(first.error).toBeUndefined();
    expect(second.error).toBeDefined();
    expect(second.error.code).toBe(-1003);
  });

  test('enforces configurable max concurrent connections', async () => {
    messageHandler.maxConcurrentConnections = 1;

    const first = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'test-device-101' },
      id: 'conn-005'
    });

    const second = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'test-device-102' },
      id: 'conn-006'
    });

    expect(first.error).toBeUndefined();
    expect(second.error).toBeDefined();
    expect(second.error.code).toBe(-1003);
  });

  test('returns not-found error for non-existent device IDs', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'non-existent-device' },
      id: 'conn-007'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-1002);
  });
});
