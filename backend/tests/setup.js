// Jest setup for hardware bridge tests
const path = require('path');

process.env.NODE_ENV = 'test';

// Mock hardware libraries by default - individual tests can override
jest.mock('usb');
jest.mock('@serialport/bindings-cpp');
jest.mock('@abandonware/noble');

// Global test timeout for hardware operations
jest.setTimeout(30000);

// Suppress console.log in tests unless VERBOSE=true
if (process.env.VERBOSE !== 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  };
}

// Test utilities
global.testUtils = {
  mockDevice: (type, overrides = {}) => ({
    id: `test-${type}-device-001`,
    type,
    name: `Test ${type.toUpperCase()} Device`,
    vendorId: 0x1234,
    productId: 0x5678,
    status: 'connected',
    capabilities: ['read', 'write'],
    lastSeen: new Date(),
    ...overrides
  }),

  mockJSONRPCRequest: (method, params = {}, id = 'test-req-001') => ({
    jsonrpc: '2.0',
    method,
    params,
    id
  }),

  mockJSONRPCResponse: (result, id = 'test-req-001') => ({
    jsonrpc: '2.0',
    result,
    id
  }),

  mockJSONRPCError: (code, message, id = 'test-req-001') => ({
    jsonrpc: '2.0',
    error: { code, message },
    id
  })
};