const { MessageHandler } = require('../../src/services/message_handler');

describe('Contract Test: heartbeat method', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('returns health metadata for heartbeat', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'heartbeat',
      params: {},
      id: 'hb-001'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.status).toBe('healthy');
    expect(typeof response.result.uptime).toBe('number');
    expect(typeof response.result.activeConnections).toBe('number');
    expect(typeof response.result.activeSessions).toBe('number');
    expect(response.result.version).toBe('1.0.0');
  });

  test('heartbeat reflects active connection count', async () => {
    await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId: 'test-device-401' },
      id: 'hb-002-connect'
    });

    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'heartbeat',
      params: {},
      id: 'hb-002-heartbeat'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.activeConnections).toBe(1);
    expect(response.result.activeSessions).toBe(1);
  });

  test('responds quickly under normal load', async () => {
    const start = Date.now();

    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'heartbeat',
      params: {},
      id: 'hb-003'
    });

    const duration = Date.now() - start;

    expect(response.error).toBeUndefined();
    expect(duration).toBeLessThan(500);
  });
});
