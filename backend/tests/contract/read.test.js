const { MessageHandler } = require('../../src/services/message_handler');

describe('Contract Test: read method', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('returns mock base64 data in test mode without active connection', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'read',
      params: { length: 16 },
      id: 'read-001'
    });

    expect(response.error).toBeUndefined();
    expect(typeof response.result.data).toBe('string');
    expect(response.result.bytesRead).toBe(16);
  });

  test('validates length lower bound', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'read',
      params: { length: 0 },
      id: 'read-002'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('validates length upper bound', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'read',
      params: { length: 70000 },
      id: 'read-003'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('returns valid base64 payload', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'read',
      params: { length: 8 },
      id: 'read-004'
    });

    expect(response.error).toBeUndefined();
    expect(() => Buffer.from(response.result.data, 'base64')).not.toThrow();
  });
});
