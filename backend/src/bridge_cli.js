#!/usr/bin/env node

const yargs = require('yargs');
const { MessageHandler } = require('./services/message_handler');

/**
 * WebHW Hardware Bridge CLI
 * Entry point for the native hardware bridge application
 */
class BridgeCLI {
  constructor() {
    this.messageHandler = null;
    this.running = false;
  }

  /**
   * Initializes and starts the bridge CLI
   */
  async run() {
    const argv = yargs(process.argv.slice(2))
      .usage('Usage: $0 [options]')
      .option('show-version', {
        alias: 'v',
        type: 'boolean',
        description: 'Show version number'
      })
      .option('enumerate', {
        type: 'string',
        description: 'Enumerate devices (usb|serial|bluetooth|all)',
        choices: ['usb', 'serial', 'bluetooth', 'all']
      })
      .option('connect', {
        type: 'string',
        description: 'Connect to device by ID'
      })
      .option('format', {
        type: 'string',
        description: 'Output format (json|text)',
        choices: ['json', 'text'],
        default: 'json'
      })
      .option('help', {
        alias: 'h',
        type: 'boolean',
        description: 'Show help'
      })
      .help()
      .alias('help', 'h')
      .version('1.0.0')
      .alias('version', 'v')
      .argv;

    try {
      // Handle CLI commands
      if (argv['show-version']) {
        console.log('WebHW Hardware Bridge v1.0.0');
        process.exit(0);
      }

      if (argv.enumerate) {
        await this.handleEnumerate(argv.enumerate, argv.format);
        process.exit(0);
      }

      if (argv.connect) {
        await this.handleConnect(argv.connect, argv.format);
        process.exit(0);
      }

      // Default: Start Native Messaging mode
      await this.startNativeMessaging();

    } catch (error) {
      console.error('Bridge CLI error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handles device enumeration command
   * @param {string} type - Device type to enumerate
   * @param {string} format - Output format
   */
  async handleEnumerate(type, format) {
    this.messageHandler = new MessageHandler();
    await this.messageHandler.initialize();

    const request = {
      jsonrpc: '2.0',
      method: 'enumerate',
      params: { type },
      id: 'cli-enum-001'
    };

    const response = await this.messageHandler.handleMessage(request);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
    } else {
      this.formatEnumerationText(response);
    }
  }

  /**
   * Handles device connection command
   * @param {string} deviceId - Device to connect to
   * @param {string} format - Output format
   */
  async handleConnect(deviceId, format) {
    this.messageHandler = new MessageHandler();
    await this.messageHandler.initialize();

    const request = {
      jsonrpc: '2.0',
      method: 'connect',
      params: { deviceId },
      id: 'cli-conn-001'
    };

    const response = await this.messageHandler.handleMessage(request);

    if (format === 'json') {
      console.log(JSON.stringify(response, null, 2));
    } else {
      this.formatConnectionText(response);
    }
  }

  /**
   * Starts Native Messaging protocol communication
   */
  async startNativeMessaging() {
    // Native messaging stdout must contain framed JSON only.
    // Route general logs to stderr to avoid protocol corruption/timeouts.
    console.log = (...args) => console.error(...args);
    console.info = (...args) => console.error(...args);
    console.debug = (...args) => console.error(...args);

    this.messageHandler = new MessageHandler();
    await this.messageHandler.initialize();

    this.running = true;

    // Set up graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    // Native Messaging uses 4-byte LE length + UTF-8 JSON payload framing.
    process.stdin.resume();

    let buffer = Buffer.alloc(0);
    const messageQueue = [];
    let processingQueue = false;

    const processQueue = async () => {
      if (processingQueue) {
        return;
      }

      processingQueue = true;
      while (messageQueue.length > 0) {
        const messageData = messageQueue.shift();

        try {
          const message = JSON.parse(messageData);
          const response = await this.messageHandler.handleMessage(message);
          this.sendNativeMessage(response);
        } catch (error) {
          const errorResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
              data: error.message
            },
            id: null
          };
          this.sendNativeMessage(errorResponse);
        }
      }
      processingQueue = false;
    };

    process.stdin.on('data', (chunk) => {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, incoming]);

      // Native Messaging protocol: messages are prefixed with 4-byte length
      while (buffer.length >= 4) {
        const messageLength = buffer.readUInt32LE(0);

        // Guard against malformed payload lengths.
        if (messageLength < 0 || messageLength > 8 * 1024 * 1024) {
          const errorResponse = {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid Request',
              data: `Invalid native message length: ${messageLength}`
            },
            id: null
          };
          this.sendNativeMessage(errorResponse);
          buffer = Buffer.alloc(0);
          break;
        }

        if (buffer.length < 4 + messageLength) {
          // Wait for more data
          break;
        }

        const messageData = buffer.subarray(4, 4 + messageLength).toString('utf8');
        buffer = buffer.subarray(4 + messageLength);

        messageQueue.push(messageData);
      }

      processQueue().catch((error) => {
        const errorResponse = {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          },
          id: null
        };
        this.sendNativeMessage(errorResponse);
      });
    });

    process.stdin.on('end', () => {
      this.shutdown();
    });

    // Send ready signal
    this.sendNativeMessage({
      jsonrpc: '2.0',
      method: 'ready',
      params: {
        version: '1.0.0',
        capabilities: ['usb', 'serial', 'bluetooth']
      }
    });
  }

  /**
   * Sends message via Native Messaging protocol
   * @param {Object} message - Message to send
   */
  sendNativeMessage(message) {
    const messageStr = JSON.stringify(message);
    const messageBytes = Buffer.from(messageStr, 'utf8');
    const lengthBuffer = Buffer.allocUnsafe(4);

    lengthBuffer.writeUInt32LE(messageBytes.length, 0);

    process.stdout.write(lengthBuffer);
    process.stdout.write(messageBytes);
  }

  /**
   * Formats enumeration response as human-readable text
   * @param {Object} response - JSON-RPC response
   */
  formatEnumerationText(response) {
    if (response.error) {
      console.error('Error:', response.error.message);
      return;
    }

    const devices = response.result.devices || [];

    if (devices.length === 0) {
      console.log('No devices found.');
      return;
    }

    console.log(`Found ${devices.length} device(s):\n`);

    devices.forEach((device, index) => {
      console.log(`${index + 1}. ${device.name}`);
      console.log(`   ID: ${device.id}`);
      console.log(`   Type: ${device.type}`);
      console.log(`   Status: ${device.status}`);
      console.log(`   Vendor: 0x${device.vendorId.toString(16).padStart(4, '0')}`);
      console.log(`   Product: 0x${device.productId.toString(16).padStart(4, '0')}`);
      if (device.serialNumber) {
        console.log(`   Serial: ${device.serialNumber}`);
      }
      console.log(`   Capabilities: ${device.capabilities.join(', ')}`);
      console.log(`   Last seen: ${device.lastSeen}`);
      console.log('');
    });
  }

  /**
   * Formats connection response as human-readable text
   * @param {Object} response - JSON-RPC response
   */
  formatConnectionText(response) {
    if (response.error) {
      console.error('Connection failed:', response.error.message);
      return;
    }

    const session = response.result;
    console.log('Connection successful!');
    console.log(`Session ID: ${session.sessionId}`);
    console.log(`Device ID: ${session.deviceId}`);
    console.log(`Status: ${session.status}`);
    console.log(`Started: ${session.startedAt}`);
  }

  /**
   * Gracefully shuts down the bridge
   */
  async shutdown() {
    if (!this.running) return;

    this.running = false;

    if (this.messageHandler) {
      await this.messageHandler.cleanup();
    }

    process.exit(0);
  }
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  const cli = new BridgeCLI();
  cli.run().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = BridgeCLI;