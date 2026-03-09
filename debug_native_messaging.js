#!/usr/bin/env node

/**
 * Debug script to test native messaging from Firefox
 * This simulates what Firefox does when connecting to the native host
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 Testing WebHW Native Messaging Host...');
console.log('This simulates Firefox connecting to the native bridge');
console.log('');

const bridgePath = '/Users/jberi/Applications/WebHW/src/bridge_cli.js';

console.log(`Bridge path: ${bridgePath}`);
console.log(`Bridge exists: ${require('fs').existsSync(bridgePath)}`);
console.log(`Bridge executable: ${require('fs').accessSync(bridgePath, require('fs').constants.X_OK) === undefined}`);
console.log('');

console.log('Starting native bridge process...');

const bridge = spawn('node', [bridgePath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: path.dirname(bridgePath)
});

let connected = false;
let messageCount = 0;

// Handle stdout (responses from bridge)
bridge.stdout.on('data', (data) => {
  console.log('📨 Received from bridge:');

  // Parse native messaging protocol
  let offset = 0;
  while (offset < data.length) {
    if (data.length - offset < 4) {
      console.log('   Incomplete message header');
      break;
    }

    const messageLength = data.readUInt32LE(offset);
    offset += 4;

    if (data.length - offset < messageLength) {
      console.log(`   Incomplete message body (expected ${messageLength}, got ${data.length - offset})`);
      break;
    }

    const messageData = data.slice(offset, offset + messageLength);
    offset += messageLength;

    try {
      const message = JSON.parse(messageData.toString('utf8'));
      console.log('   ', JSON.stringify(message, null, 2));

      if (message.method === 'ready') {
        console.log('✅ Bridge is ready! Sending test request...');
        sendTestRequest();
      }

    } catch (error) {
      console.log('   Raw data:', messageData.toString());
      console.log('   Parse error:', error.message);
    }
  }
});

// Handle stderr (debug output)
bridge.stderr.on('data', (data) => {
  console.log('🐛 Bridge stderr:', data.toString().trim());
});

// Handle process events
bridge.on('error', (error) => {
  console.log('❌ Bridge process error:', error.message);
});

bridge.on('exit', (code, signal) => {
  console.log(`🏁 Bridge process exited with code ${code}, signal ${signal}`);
  process.exit(code || 0);
});

// Send test request
function sendTestRequest() {
  if (messageCount >= 3) {
    console.log('✅ Test complete, shutting down...');
    bridge.kill();
    return;
  }

  messageCount++;

  const testMessage = {
    jsonrpc: '2.0',
    method: 'enumerate',
    params: { type: 'usb' },
    id: `test_${messageCount}`
  };

  console.log(`📤 Sending test request ${messageCount}:`);
  console.log('   ', JSON.stringify(testMessage, null, 2));

  const messageStr = JSON.stringify(testMessage);
  const messageBuffer = Buffer.from(messageStr, 'utf8');
  const lengthBuffer = Buffer.allocUnsafe(4);
  lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

  bridge.stdin.write(lengthBuffer);
  bridge.stdin.write(messageBuffer);

  // Send next request after delay
  setTimeout(() => {
    if (messageCount < 3) {
      sendTestRequest();
    }
  }, 2000);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  bridge.kill();
  process.exit(0);
});

console.log('⏳ Waiting for bridge to initialize...');