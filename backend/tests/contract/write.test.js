const { MessageHandler } = require('../../src/services/message_handler');

describe('Contract Test: write method', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('accepts base64 write payload and reports bytes written in test mode', async () => {
    const data = Buffer.from('Hello Hardware').toString('base64');
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'write',
      params: { data },
      id: 'write-001'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.bytesWritten).toBe(Buffer.from('Hello Hardware').length);
  });

  test('accepts byte-array write payload', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'write',
      params: { data: [1, 2, 3, 4] },
      id: 'write-002'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.bytesWritten).toBe(4);
  });

  test('rejects invalid base64 data', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'write',
      params: { data: 'invalid-base64-data!' },
      id: 'write-003'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('rejects oversized payloads', async () => {
    messageHandler.maxWriteBytes = 4;
    const oversized = Buffer.from('12345').toString('base64');

    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'write',
      params: { data: oversized },
      id: 'write-004'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });

  test('rejects write requests without data', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'write',
      params: {},
      id: 'write-005'
    });

    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32602);
  });
});
