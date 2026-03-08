const { MessageHandler } = require('../../src/services/message_handler');

describe('Contract Test: enumerate method', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('accepts valid enumerate request with defaults', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: {},
      id: 'enum-001'
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.devices)).toBe(true);
    expect(response.result.type).toBe('all');
  });

  test('filters by type when requested', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type: 'usb' },
      id: 'enum-002'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.type).toBe('usb');
    for (const device of response.result.devices) {
      expect(device.type).toBe('usb');
    }
  });

  test('rejects invalid type', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type: 'invalid' },
      id: 'enum-003'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('rejects malformed JSON-RPC request', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '1.0',
      method: 42,
      id: undefined
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32600);
  });

  test('enforces per-origin request throttling', async () => {
    messageHandler.rateLimitMaxRequests = 2;
    messageHandler.rateLimitWindowMs = 1000;

    const makeRequest = (id) => messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'heartbeat',
      id,
      origin: 'https://rate-limit.test'
    });

    const first = await makeRequest('rl-1');
    const second = await makeRequest('rl-2');
    const third = await makeRequest('rl-3');

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(third.error).toBeDefined();
    expect(third.error.code).toBe(-1005);
  });
});
