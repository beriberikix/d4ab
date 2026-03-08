const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPermissionClass() {
  const sourcePath = path.join(__dirname, '../../src/models/permission.js');
  const source = fs.readFileSync(sourcePath, 'utf8');

  const transformed = source
    .replace('export class Permission', 'class Permission')
    .concat('\nmodule.exports = { Permission };\n');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    URL,
    Date,
    window: {}
  };

  vm.runInNewContext(transformed, sandbox, { filename: 'permission.js' });
  return sandbox.module.exports.Permission;
}

describe('Permission Logic', () => {
  let Permission;

  beforeAll(() => {
    Permission = loadPermissionClass();
  });

  test('creates a permission and validates expected fields', () => {
    const permission = Permission.create(
      'https://example.com',
      'usb:1234:5678',
      ['read', 'write'],
      false,
      300000
    );

    expect(permission.origin).toBe('https://example.com');
    expect(permission.deviceId).toBe('usb:1234:5678');
    expect(permission.capabilities).toEqual(['read', 'write']);
    expect(permission.persistent).toBe(false);

    const validation = permission.validate();
    expect(validation.isValid).toBe(true);
  });

  test('marks non-HTTPS origins as invalid', () => {
    const permission = Permission.create(
      'http://example.com',
      'usb:1234:5678',
      ['read']
    );

    const validation = permission.validate();
    expect(validation.isValid).toBe(false);
    expect(validation.errors.join(' ')).toContain('HTTPS');
  });

  test('supports capability checks and renewal', () => {
    const permission = Permission.create(
      'https://example.com',
      'usb:1234:5678',
      ['read', 'control'],
      false,
      5000
    );

    expect(permission.allows('read')).toBe(true);
    expect(permission.allows('write')).toBe(false);

    const previousExpiry = permission.expiresAt.getTime();
    const renewed = permission.renew();

    expect(renewed).toBe(true);
    expect(permission.expiresAt.getTime()).toBeGreaterThan(previousExpiry);
  });

  test('serializes and deserializes consistently', () => {
    const permission = Permission.grant(
      'https://example.com',
      'usb:9999:0001',
      ['read'],
      true
    );

    const json = permission.toJSON();
    const restored = Permission.fromJSON(json);

    expect(restored.origin).toBe(permission.origin);
    expect(restored.deviceId).toBe(permission.deviceId);
    expect(restored.capabilities).toEqual(permission.capabilities);
    expect(restored.persistent).toBe(true);
  });

  test('browser adapter storage helper naming avoids recursion bug', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/services/browser_adapter.js'),
      'utf8'
    );

    expect(source).toContain('getStorageAPI()');
    expect(source).toContain('const storage = this.getStorageAPI();');
    expect(source).not.toContain('const storage = this.getStorage();');
  });
});
