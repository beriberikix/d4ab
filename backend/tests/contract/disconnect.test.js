const { MessageHandler } = require('../../src/services/message_handler');

describe('Contract Test: disconnect method', () => {
  let messageHandler;

  beforeEach(() => {
    messageHandler = new MessageHandler();
  });

  afterEach(async () => {
    await messageHandler.cleanup();
  });

  test('returns success=false when no active connection exists', async () => {
    const response = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'disconnect',
      params: {},
      id: 'disc-001'
    });

    expect(response.error).toBeUndefined();
    expect(response.result.success).toBe(false);
  });

  test('disconnects an active session by deviceId', async () => {
    const deviceId = 'test-device-301';

    const connectResponse = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId },
      id: 'disc-002-connect'
    });

    const disconnectResponse = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'disconnect',
      params: { deviceId },
      id: 'disc-002-disconnect'
    });

    expect(connectResponse.error).toBeUndefined();
    expect(disconnectResponse.error).toBeUndefined();
    expect(disconnectResponse.result.success).toBe(true);
  });

  test('removes session state after successful disconnect', async () => {
    const deviceId = 'test-device-302';

    const connectResponse = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId },
      id: 'disc-003-connect'
    });

    const disconnectResponse = await messageHandler.handleMessage({
      jsonrpc: '2.0',
      method: 'disconnect',
      params: { deviceId },
      id: 'disc-003-disconnect'
    });

    expect(connectResponse.error).toBeUndefined();
    expect(disconnectResponse.error).toBeUndefined();
    expect(messageHandler.deviceConnections.has(deviceId)).toBe(false);
  });
});
