/**
 * Device Permission Management Service
 * Handles permission grants, checks, and storage for hardware device access
 */

import { Permission } from '../models/permission.js';
import { BrowserAdapter } from './browser_adapter.js';

export class PermissionManager {
  constructor() {
    this.browserAdapter = new BrowserAdapter();
    this.permissions = new Map(); // In-memory cache
    this.storageKey = 'd4ab_permissions';
    this.defaultTimeout = 300000; // 5 minutes default session timeout
    this.initialized = false;
  }

  /**
   * Initializes the permission manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load existing permissions from storage
      await this.loadPermissions();

      // Clean up expired permissions
      await this.cleanupExpiredPermissions();

      this.initialized = true;
    } catch (error) {
      console.error('PermissionManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Grants permission for device access
   * @param {string} origin - Requesting origin
   * @param {string} deviceId - Device identifier
   * @param {string[]} capabilities - Required capabilities
   * @param {boolean} persistent - Whether permission persists across sessions
   * @param {number} timeout - Permission timeout in milliseconds
   * @returns {Promise<Permission>} Granted permission
   */
  async grantPermission(origin, deviceId, capabilities = ['read'], persistent = false, timeout = null) {
    if (!origin || !deviceId) {
      throw new Error('Origin and deviceId are required');
    }

    // Validate capabilities
    const validCapabilities = ['read', 'write', 'control'];
    const invalidCaps = capabilities.filter(cap => !validCapabilities.includes(cap));
    if (invalidCaps.length > 0) {
      throw new Error(`Invalid capabilities: ${invalidCaps.join(', ')}`);
    }

    // Create permission
    const permission = Permission.create(
      origin,
      deviceId,
      capabilities,
      persistent,
      timeout || (persistent ? null : this.defaultTimeout)
    );

    // Store in cache
    const key = this.getPermissionKey(origin, deviceId);
    this.permissions.set(key, permission);

    // Persist to storage if requested
    if (persistent) {
      await this.savePermissions();
    }

    // Log permission grant
    console.log(`Permission granted: ${origin} -> ${deviceId} [${capabilities.join(', ')}]`);

    return permission;
  }

  /**
   * Revokes permission for device access
   * @param {string} origin - Origin to revoke
   * @param {string} deviceId - Device identifier
   * @returns {Promise<boolean>} True if permission was revoked
   */
  async revokePermission(origin, deviceId) {
    const key = this.getPermissionKey(origin, deviceId);
    const permission = this.permissions.get(key);

    if (!permission) {
      return false;
    }

    // Remove from cache
    this.permissions.delete(key);

    // Update storage if permission was persistent
    if (permission.persistent) {
      await this.savePermissions();
    }

    console.log(`Permission revoked: ${origin} -> ${deviceId}`);
    return true;
  }

  /**
   * Checks if origin has permission for device and capability
   * @param {string} origin - Requesting origin
   * @param {string} deviceId - Device identifier
   * @param {string} capability - Required capability
   * @returns {Promise<boolean>} True if permission exists and is valid
   */
  async checkPermission(origin, deviceId, capability = 'read') {
    const permission = await this.getPermission(origin, deviceId);

    if (!permission) {
      return false;
    }

    // Check if permission is still valid
    if (!permission.isValid()) {
      await this.revokePermission(origin, deviceId);
      return false;
    }

    // Check if capability is included
    return permission.capabilities.includes(capability);
  }

  /**
   * Gets permission for origin and device
   * @param {string} origin - Requesting origin
   * @param {string} deviceId - Device identifier
   * @returns {Promise<Permission|null>} Permission object or null
   */
  async getPermission(origin, deviceId) {
    const key = this.getPermissionKey(origin, deviceId);
    const permission = this.permissions.get(key);

    if (!permission) {
      return null;
    }

    // Check if expired
    if (!permission.isValid()) {
      await this.revokePermission(origin, deviceId);
      return null;
    }

    return permission;
  }

  /**
   * Lists all permissions for an origin
   * @param {string} origin - Origin to list permissions for
   * @returns {Promise<Permission[]>} Array of permissions
   */
  async listPermissions(origin) {
    const permissions = [];

    for (const [, permission] of this.permissions) {
      if (permission.origin === origin && permission.isValid()) {
        permissions.push(permission);
      }
    }

    return permissions;
  }

  /**
   * Lists all permissions for a device
   * @param {string} deviceId - Device identifier
   * @returns {Promise<Permission[]>} Array of permissions
   */
  async listDevicePermissions(deviceId) {
    const permissions = [];

    for (const [, permission] of this.permissions) {
      if (permission.deviceId === deviceId && permission.isValid()) {
        permissions.push(permission);
      }
    }

    return permissions;
  }

  /**
   * Revokes all permissions for an origin
   * @param {string} origin - Origin to revoke permissions for
   * @returns {Promise<number>} Number of permissions revoked
   */
  async revokeAllPermissions(origin) {
    let revokedCount = 0;

    const keysToRemove = [];
    for (const [key, permission] of this.permissions) {
      if (permission.origin === origin) {
        keysToRemove.push(key);
        revokedCount++;
      }
    }

    // Remove permissions
    for (const key of keysToRemove) {
      this.permissions.delete(key);
    }

    // Update storage
    await this.savePermissions();

    console.log(`Revoked ${revokedCount} permissions for origin: ${origin}`);
    return revokedCount;
  }

  /**
   * Revokes all permissions for a device
   * @param {string} deviceId - Device identifier
   * @returns {Promise<number>} Number of permissions revoked
   */
  async revokeDevicePermissions(deviceId) {
    let revokedCount = 0;

    const keysToRemove = [];
    for (const [key, permission] of this.permissions) {
      if (permission.deviceId === deviceId) {
        keysToRemove.push(key);
        revokedCount++;
      }
    }

    // Remove permissions
    for (const key of keysToRemove) {
      this.permissions.delete(key);
    }

    // Update storage
    await this.savePermissions();

    console.log(`Revoked ${revokedCount} permissions for device: ${deviceId}`);
    return revokedCount;
  }

  /**
   * Updates permission capabilities
   * @param {string} origin - Requesting origin
   * @param {string} deviceId - Device identifier
   * @param {string[]} capabilities - New capabilities
   * @returns {Promise<Permission|null>} Updated permission or null
   */
  async updatePermission(origin, deviceId, capabilities) {
    const permission = await this.getPermission(origin, deviceId);

    if (!permission) {
      return null;
    }

    // Validate capabilities
    const validCapabilities = ['read', 'write', 'control'];
    const invalidCaps = capabilities.filter(cap => !validCapabilities.includes(cap));
    if (invalidCaps.length > 0) {
      throw new Error(`Invalid capabilities: ${invalidCaps.join(', ')}`);
    }

    // Update capabilities
    permission.capabilities = [...capabilities];
    permission.lastModified = new Date();

    // Update storage if persistent
    if (permission.persistent) {
      await this.savePermissions();
    }

    console.log(`Permission updated: ${origin} -> ${deviceId} [${capabilities.join(', ')}]`);
    return permission;
  }

  /**
   * Extends permission expiration
   * @param {string} origin - Requesting origin
   * @param {string} deviceId - Device identifier
   * @param {number} additionalTime - Additional time in milliseconds
   * @returns {Promise<Permission|null>} Extended permission or null
   */
  async extendPermission(origin, deviceId, additionalTime) {
    const permission = await this.getPermission(origin, deviceId);

    if (!permission || permission.persistent) {
      return permission;
    }

    // Extend expiration
    if (permission.expiresAt) {
      permission.expiresAt = new Date(permission.expiresAt.getTime() + additionalTime);
      permission.lastModified = new Date();

      console.log(`Permission extended: ${origin} -> ${deviceId} until ${permission.expiresAt.toISOString()}`);
    }

    return permission;
  }

  /**
   * Gets permission statistics
   * @returns {Promise<Object>} Permission statistics
   */
  async getPermissionStats() {
    let totalPermissions = 0;
    let persistentPermissions = 0;
    let expiredPermissions = 0;
    const originCounts = new Map();
    const deviceCounts = new Map();

    for (const [, permission] of this.permissions) {
      totalPermissions++;

      if (permission.persistent) {
        persistentPermissions++;
      }

      if (!permission.isValid()) {
        expiredPermissions++;
      }

      // Count by origin
      const originCount = originCounts.get(permission.origin) || 0;
      originCounts.set(permission.origin, originCount + 1);

      // Count by device
      const deviceCount = deviceCounts.get(permission.deviceId) || 0;
      deviceCounts.set(permission.deviceId, deviceCount + 1);
    }

    return {
      total: totalPermissions,
      persistent: persistentPermissions,
      expired: expiredPermissions,
      session: totalPermissions - persistentPermissions,
      origins: originCounts.size,
      devices: deviceCounts.size,
      topOrigins: Array.from(originCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      topDevices: Array.from(deviceCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }

  /**
   * Loads permissions from storage
   * @returns {Promise<void>}
   */
  async loadPermissions() {
    try {
      const data = await this.browserAdapter.getStorage(this.storageKey);
      const permissionsData = data[this.storageKey] || [];

      this.permissions.clear();

      for (const permData of permissionsData) {
        const permission = Permission.fromJSON(permData);

        // Only load valid, persistent permissions
        if (permission.persistent && permission.isValid()) {
          const key = this.getPermissionKey(permission.origin, permission.deviceId);
          this.permissions.set(key, permission);
        }
      }

      console.log(`Loaded ${this.permissions.size} persistent permissions from storage`);

    } catch (error) {
      console.warn('Failed to load permissions from storage:', error);
    }
  }

  /**
   * Saves permissions to storage
   * @returns {Promise<void>}
   */
  async savePermissions() {
    try {
      const persistentPermissions = [];

      for (const [, permission] of this.permissions) {
        if (permission.persistent && permission.isValid()) {
          persistentPermissions.push(permission.toJSON());
        }
      }

      await this.browserAdapter.setStorage({
        [this.storageKey]: persistentPermissions
      });

      console.log(`Saved ${persistentPermissions.length} persistent permissions to storage`);

    } catch (error) {
      console.error('Failed to save permissions to storage:', error);
    }
  }

  /**
   * Cleans up expired permissions
   * @returns {Promise<number>} Number of permissions cleaned up
   */
  async cleanupExpiredPermissions() {
    const keysToRemove = [];

    for (const [key, permission] of this.permissions) {
      if (!permission.isValid()) {
        keysToRemove.push(key);
      }
    }

    // Remove expired permissions
    for (const key of keysToRemove) {
      this.permissions.delete(key);
    }

    // Update storage if any persistent permissions were removed
    if (keysToRemove.length > 0) {
      await this.savePermissions();
    }

    if (keysToRemove.length > 0) {
      console.log(`Cleaned up ${keysToRemove.length} expired permissions`);
    }

    return keysToRemove.length;
  }

  /**
   * Generates permission key for storage
   * @param {string} origin - Origin
   * @param {string} deviceId - Device identifier
   * @returns {string} Permission key
   */
  getPermissionKey(origin, deviceId) {
    return `${origin}:${deviceId}`;
  }

  /**
   * Validates origin format
   * @param {string} origin - Origin to validate
   * @returns {boolean} True if valid origin
   */
  isValidOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.protocol === 'https:' || url.hostname === 'localhost';
    } catch (error) {
      return false;
    }
  }

  /**
   * Sets default permission timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setDefaultTimeout(timeout) {
    if (timeout > 0) {
      this.defaultTimeout = timeout;
    }
  }

  /**
   * Starts periodic cleanup of expired permissions
   * @param {number} interval - Cleanup interval in milliseconds
   */
  startPeriodicCleanup(interval = 300000) { // 5 minutes default
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredPermissions();
      } catch (error) {
        console.error('Periodic permission cleanup failed:', error);
      }
    }, interval);
  }

  /**
   * Stops periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.stopPeriodicCleanup();
    await this.savePermissions();
    this.permissions.clear();
    this.initialized = false;
  }
}