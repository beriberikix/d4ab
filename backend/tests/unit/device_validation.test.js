const Device = require('../../src/models/device');

describe('Device Validation', () => {
  describe('Device Creation', () => {
    test('should create valid USB device', () => {
      const device = Device.create(
        'usb:1234:5678',
        'Test USB Device',
        'usb',
        0x1234,
        0x5678,
        ['read', 'write']
      );

      expect(device).toBeInstanceOf(Device);
      expect(device.id).toBe('usb:1234:5678');
      expect(device.name).toBe('Test USB Device');
      expect(device.type).toBe('usb');
      expect(device.status).toBe('disconnected');
      expect(device.capabilities).toEqual(['read', 'write']);
    });

    test('should create valid Serial device', () => {
      const device = Device.create(
        'serial:COM1',
        'Serial Port',
        'serial',
        0x0000,
        0x0000,
        ['read', 'write'],
        'COM1'
      );

      expect(device.type).toBe('serial');
      expect(device.path).toBe('COM1');
      expect(device.vendorId).toBe(0x0000);
      expect(device.productId).toBe(0x0000);
    });

    test('should create valid Bluetooth device', () => {
      const device = Device.create(
        '001122334455',
        'Bluetooth Device',
        'bluetooth',
        0x0000,
        0x0000,
        ['read', 'write']
      );

      expect(device.type).toBe('bluetooth');
      expect(device.id).toBe('001122334455');
      expect(device.id).toMatch(/^[0-9a-f]{12}$/i);
    });

    test('should throw error for invalid device type', () => {
      expect(() => {
        Device.create(
          'invalid:123',
          'Invalid Device',
          'invalid_type',
          0x1234,
          0x5678,
          ['read']
        );
      }).toThrow('Invalid device type: invalid_type');
    });

    test('should throw error for empty device ID', () => {
      expect(() => {
        Device.create(
          '',
          'Test Device',
          'usb',
          0x1234,
          0x5678,
          ['read']
        );
      }).toThrow('Device ID is required');
    });

    test('should throw error for empty device name', () => {
      expect(() => {
        Device.create(
          'usb:1234:5678',
          '',
          'usb',
          0x1234,
          0x5678,
          ['read']
        );
      }).toThrow('Device name is required');
    });
  });

  describe('Device ID Validation', () => {
    test('should validate USB device ID format', () => {
      const validIds = [
        'usb:1234:5678',
        'usb:abcd:ef01',
        'usb:0000:0000',
        'usb:ffff:ffff'
      ];

      for (const id of validIds) {
        expect(Device.isValidDeviceId(id, 'usb')).toBe(true);
      }
    });

    test('should reject invalid USB device ID format', () => {
      const invalidIds = [
        'usb:123:5678',     // Short vendor ID
        'usb:1234:567',     // Short product ID
        'usb:12345:5678',   // Long vendor ID
        'usb:1234:56789',   // Long product ID
        'usb:ghij:5678',    // Invalid hex chars
        'usb:1234',         // Missing product ID
        'usb::5678',        // Empty vendor ID
        'usb:1234:',        // Empty product ID
        '1234:5678',        // Missing prefix
        'usb-1234-5678'     // Wrong separator
      ];

      for (const id of invalidIds) {
        expect(Device.isValidDeviceId(id, 'usb')).toBe(false);
      }
    });

    test('should validate Serial device ID format', () => {
      const validIds = [
        'serial:COM1',
        'serial:COM123',
        'serial:/dev/ttyUSB0',
        'serial:/dev/ttyACM0',
        'serial:/dev/cu.usbserial-1234',
        'serial:\\\\.\\COM1'
      ];

      for (const id of validIds) {
        expect(Device.isValidDeviceId(id, 'serial')).toBe(true);
      }
    });

    test('should reject invalid Serial device ID format', () => {
      const invalidIds = [
        'serial:',          // Empty path
        'COM1',             // Missing prefix
        'serial',           // No path separator
        'serial: ',         // Space in path
        'serial:CO M1'      // Space in path
      ];

      for (const id of invalidIds) {
        expect(Device.isValidDeviceId(id, 'serial')).toBe(false);
      }
    });

    test('should validate Bluetooth device ID format', () => {
      const validIds = [
        '001122334455',
        '00:11:22:33:44:55',
        'AABBCCDDEEFF',
        'aa:bb:cc:dd:ee:ff',
        'A0:B1:C2:D3:E4:F5'
      ];

      for (const id of validIds) {
        expect(Device.isValidDeviceId(id, 'bluetooth')).toBe(true);
      }
    });

    test('should reject invalid Bluetooth device ID format', () => {
      const invalidIds = [
        '00112233445',      // Too short
        '001122334455aa',   // Too long
        'GGHHIIJJKKLL',     // Invalid hex chars
        '00:11:22:33:44',   // Too short with colons
        '00-11-22-33-44-55',// Wrong separator
        '00:11:22:33:44:55:66' // Too long with colons
      ];

      for (const id of invalidIds) {
        expect(Device.isValidDeviceId(id, 'bluetooth')).toBe(false);
      }
    });
  });

  describe('Vendor and Product ID Validation', () => {
    test('should validate vendor and product IDs', () => {
      const validIds = [
        { vendor: 0x0000, product: 0x0000 },
        { vendor: 0xFFFF, product: 0xFFFF },
        { vendor: 0x1234, product: 0x5678 },
        { vendor: 0xABCD, product: 0xEF01 }
      ];

      for (const { vendor, product } of validIds) {
        expect(Device.isValidVendorId(vendor)).toBe(true);
        expect(Device.isValidProductId(product)).toBe(true);
      }
    });

    test('should reject invalid vendor and product IDs', () => {
      const invalidIds = [
        -1,        // Negative
        0x10000,   // Too large
        'invalid', // Not a number
        null,      // Null
        undefined  // Undefined
      ];

      for (const id of invalidIds) {
        expect(Device.isValidVendorId(id)).toBe(false);
        expect(Device.isValidProductId(id)).toBe(false);
      }
    });
  });

  describe('Capability Validation', () => {
    test('should validate capability arrays', () => {
      const validCapabilities = [
        ['read'],
        ['write'],
        ['control'],
        ['read', 'write'],
        ['read', 'write', 'control'],
        ['control', 'read'],
        []  // Empty array is valid (no capabilities)
      ];

      for (const capabilities of validCapabilities) {
        expect(Device.isValidCapabilities(capabilities)).toBe(true);
      }
    });

    test('should reject invalid capabilities', () => {
      const invalidCapabilities = [
        ['invalid'],                    // Invalid capability
        ['read', 'invalid'],           // Mixed valid/invalid
        ['read', 'read'],              // Duplicates
        'read',                        // Not an array
        ['READ'],                      // Wrong case
        [123],                         // Not strings
        ['read', ''],                  // Empty string
        ['read', null],                // Null value
        ['read', undefined]            // Undefined value
      ];

      for (const capabilities of invalidCapabilities) {
        expect(Device.isValidCapabilities(capabilities)).toBe(false);
      }
    });
  });

  describe('Device Status Validation', () => {
    test('should validate device status values', () => {
      const validStatuses = [
        'connected',
        'disconnected',
        'connecting',
        'error'
      ];

      for (const status of validStatuses) {
        expect(Device.isValidStatus(status)).toBe(true);
      }
    });

    test('should reject invalid status values', () => {
      const invalidStatuses = [
        'invalid',
        'CONNECTED',   // Wrong case
        'ready',       // Not in enum
        '',            // Empty string
        null,          // Null
        undefined,     // Undefined
        123            // Not a string
      ];

      for (const status of invalidStatuses) {
        expect(Device.isValidStatus(status)).toBe(false);
      }
    });
  });

  describe('Device Status Transitions', () => {
    let device;

    beforeEach(() => {
      device = Device.create(
        'usb:1234:5678',
        'Test Device',
        'usb',
        0x1234,
        0x5678,
        ['read', 'write']
      );
    });

    test('should allow valid status transitions', () => {
      // disconnected -> connecting
      expect(device.setStatus('connecting')).toBe(true);
      expect(device.status).toBe('connecting');

      // connecting -> connected
      expect(device.setStatus('connected')).toBe(true);
      expect(device.status).toBe('connected');

      // connected -> disconnected
      expect(device.setStatus('disconnected')).toBe(true);
      expect(device.status).toBe('disconnected');

      // Any status -> error
      expect(device.setStatus('error')).toBe(true);
      expect(device.status).toBe('error');
    });

    test('should reject invalid status transitions', () => {
      // First get to connected state through valid transition
      device.setStatus('connecting');
      device.setStatus('connected');

      // connected -> connecting (invalid)
      expect(device.setStatus('connecting')).toBe(false);
      expect(device.status).toBe('connected'); // Status unchanged
    });

    test('should allow transitions from error state', () => {
      device.setStatus('error');

      // error -> disconnected
      expect(device.setStatus('disconnected')).toBe(true);
      expect(device.status).toBe('disconnected');

      device.setStatus('error');

      // error -> connecting
      expect(device.setStatus('connecting')).toBe(true);
      expect(device.status).toBe('connecting');
    });
  });

  describe('Device Serialization/Deserialization', () => {
    test('should serialize device to JSON', () => {
      const device = Device.create(
        'usb:1234:5678',
        'Test USB Device',
        'usb',
        0x1234,
        0x5678,
        ['read', 'write'],
        null,
        'SN123456'
      );

      const json = device.toJSON();

      expect(json).toEqual({
        id: 'usb:1234:5678',
        name: 'Test USB Device',
        type: 'usb',
        status: 'disconnected',
        vendorId: 0x1234,
        productId: 0x5678,
        capabilities: ['read', 'write'],
        serialNumber: 'SN123456',
        path: null,
        lastSeen: expect.any(String),
        connectedAt: null,
        metadata: {}
      });

      // Validate timestamp format
      expect(new Date(json.lastSeen)).toBeInstanceOf(Date);
    });

    test('should deserialize device from JSON', () => {
      const json = {
        id: 'usb:1234:5678',
        name: 'Test USB Device',
        type: 'usb',
        status: 'connected',
        vendorId: 0x1234,
        productId: 0x5678,
        capabilities: ['read', 'write'],
        serialNumber: 'SN123456',
        path: null,
        lastSeen: '2024-01-01T00:00:00.000Z',
        connectedAt: '2024-01-01T00:00:00.000Z',
        metadata: { test: true }
      };

      const device = Device.fromJSON(json);

      expect(device).toBeInstanceOf(Device);
      expect(device.id).toBe('usb:1234:5678');
      expect(device.name).toBe('Test USB Device');
      expect(device.type).toBe('usb');
      expect(device.status).toBe('connected');
      expect(device.vendorId).toBe(0x1234);
      expect(device.productId).toBe(0x5678);
      expect(device.capabilities).toEqual(['read', 'write']);
      expect(device.serialNumber).toBe('SN123456');
      expect(device.lastSeen).toBeInstanceOf(Date);
      expect(device.connectedAt).toBeInstanceOf(Date);
      expect(device.metadata).toEqual({ test: true });
    });

    test('should handle invalid JSON during deserialization', () => {
      const invalidJson = {
        id: '',  // Invalid empty ID
        name: 'Test Device',
        type: 'usb'
      };

      expect(() => {
        Device.fromJSON(invalidJson);
      }).toThrow();
    });
  });

  describe('Device Comparison and Equality', () => {
    test('should compare devices correctly', () => {
      const device1 = Device.create(
        'usb:1234:5678',
        'Device A',
        'usb',
        0x1234,
        0x5678,
        ['read']
      );

      const device2 = Device.create(
        'usb:1234:5678',
        'Device A Modified',
        'usb',
        0x1234,
        0x5678,
        ['read', 'write']
      );

      const device3 = Device.create(
        'usb:abcd:ef01',
        'Device B',
        'usb',
        0xABCD,
        0xEF01,
        ['read']
      );

      // Same ID should be equal
      expect(device1.equals(device2)).toBe(true);

      // Different ID should not be equal
      expect(device1.equals(device3)).toBe(false);
    });

    test('should generate consistent hash codes', () => {
      const device1 = Device.create(
        'usb:1234:5678',
        'Device A',
        'usb',
        0x1234,
        0x5678,
        ['read']
      );

      const device2 = Device.create(
        'usb:1234:5678',
        'Device A Modified',
        'usb',
        0x1234,
        0x5678,
        ['read', 'write']
      );

      // Same device ID should have same hash
      expect(device1.hashCode()).toBe(device2.hashCode());
    });
  });

  describe('Device Update Methods', () => {
    let device;

    beforeEach(() => {
      device = Device.create(
        'usb:1234:5678',
        'Test Device',
        'usb',
        0x1234,
        0x5678,
        ['read']
      );
    });

    test('should update last seen timestamp', () => {
      const originalLastSeen = device.lastSeen;

      // Wait a small amount to ensure timestamp difference
      setTimeout(() => {
        device.updateLastSeen();
        expect(device.lastSeen.getTime()).toBeGreaterThan(originalLastSeen.getTime());
      }, 1);
    });

    test('should add capabilities', () => {
      device.addCapability('write');
      expect(device.capabilities).toContain('write');
      expect(device.capabilities).toHaveLength(2);

      // Should not add duplicates
      device.addCapability('read');
      expect(device.capabilities).toHaveLength(2);
    });

    test('should remove capabilities', () => {
      device.addCapability('write');
      device.addCapability('control');

      device.removeCapability('write');
      expect(device.capabilities).not.toContain('write');
      expect(device.capabilities).toHaveLength(2);

      // Should handle non-existent capabilities gracefully
      device.removeCapability('nonexistent');
      expect(device.capabilities).toHaveLength(2);
    });

    test('should update metadata', () => {
      device.setMetadata('key1', 'value1');
      expect(device.metadata.key1).toBe('value1');

      device.setMetadata('key2', { nested: true });
      expect(device.metadata.key2).toEqual({ nested: true });

      // Should update existing keys
      device.setMetadata('key1', 'new_value');
      expect(device.metadata.key1).toBe('new_value');
    });
  });

  describe('Device Type-Specific Validation', () => {
    describe('USB Device Validation', () => {
      test('should require valid vendor and product IDs for USB', () => {
        expect(() => {
          Device.create(
            'usb:1234:5678',
            'USB Device',
            'usb',
            null, // Invalid vendor ID
            0x5678,
            ['read']
          );
        }).toThrow();

        expect(() => {
          Device.create(
            'usb:1234:5678',
            'USB Device',
            'usb',
            0x1234,
            null, // Invalid product ID
            ['read']
          );
        }).toThrow();
      });
    });

    describe('Serial Device Validation', () => {
      test('should accept path for Serial devices', () => {
        const device = Device.create(
          'serial:COM1',
          'Serial Device',
          'serial',
          0x0000,
          0x0000,
          ['read', 'write'],
          'COM1'
        );

        expect(device.path).toBe('COM1');
      });
    });

    describe('Bluetooth Device Validation', () => {
      test('should normalize Bluetooth addresses', () => {
        const device1 = Device.create(
          '001122334455',
          'BT Device',
          'bluetooth',
          0x0000,
          0x0000,
          ['read']
        );

        const device2 = Device.create(
          '00:11:22:33:44:55',
          'BT Device',
          'bluetooth',
          0x0000,
          0x0000,
          ['read']
        );

        // Both should be normalized to the same format
        expect(device1.id).toBe(device2.id);
      });
    });
  });
});