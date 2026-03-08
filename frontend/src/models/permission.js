/**
 * Permission model for webpage-device access authorization
 */
export class Permission {
  constructor(data = {}) {
    this.origin = data.origin || '';
    this.deviceId = data.deviceId || '';
    this.capabilities = data.capabilities || data.permissions || ['read'];
    this.permissions = [...this.capabilities]; // Backward-compatible alias
    this.grantedAt = data.grantedAt || new Date();
    this.expiresAt = Object.prototype.hasOwnProperty.call(data, 'expiresAt')
      ? data.expiresAt
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.persistent = data.persistent || false;
  }

  /**
   * Validates permission data
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // Validate origin
    if (!this.origin) {
      errors.push('Origin is required');
    } else {
      try {
        const url = new URL(this.origin);
        if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
          errors.push('Origin must be HTTPS or localhost');
        }
      } catch (e) {
        errors.push('Origin must be a valid URL');
      }
    }

    // Validate deviceId
    if (!this.deviceId || typeof this.deviceId !== 'string') {
      errors.push('Device ID must be a non-empty string');
    }

    // Validate permissions array
    if (!Array.isArray(this.capabilities) || this.capabilities.length === 0) {
      errors.push('Permissions must be non-empty array');
    } else {
      const validPermissions = ['read', 'write', 'control'];
      for (const perm of this.capabilities) {
        if (!validPermissions.includes(perm)) {
          errors.push(`Invalid permission: ${perm}`);
        }
      }
    }

    // Validate dates
    if (!(this.grantedAt instanceof Date)) {
      errors.push('GrantedAt must be a Date');
    }

    if (this.expiresAt !== null && !(this.expiresAt instanceof Date)) {
      errors.push('ExpiresAt must be a Date');
    }

    if (this.expiresAt && this.expiresAt <= this.grantedAt) {
      errors.push('ExpiresAt must be after GrantedAt');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Checks if permission is currently valid (not expired)
   * @returns {boolean} Whether permission is still valid
   */
  isValid() {
    if (this.persistent && this.expiresAt === null) {
      return true;
    }

    return new Date() < this.expiresAt;
  }

  /**
   * Checks if permission allows specific capability
   * @param {string} capability - Capability to check
   * @returns {boolean} Whether permission grants capability
   */
  allows(capability) {
    return this.isValid() && this.capabilities.includes(capability);
  }

  /**
   * Extends permission expiry by 24 hours
   * @returns {boolean} Success of renewal
   */
  renew() {
    if (this.isValid()) {
      this.grantedAt = new Date();
      this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      return true;
    }
    return false;
  }

  /**
   * Creates permission key for storage
   * @returns {string} Unique key for this permission
   */
  getStorageKey() {
    return `permission:${this.origin}:${this.deviceId}`;
  }

  /**
   * Converts permission to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      origin: this.origin,
      deviceId: this.deviceId,
      capabilities: [...this.capabilities],
      permissions: [...this.capabilities],
      grantedAt: this.grantedAt.toISOString(),
      expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
      persistent: this.persistent
    };
  }

  /**
   * Creates Permission from JSON data
   * @param {Object} json - JSON object
   * @returns {Permission} New Permission instance
   */
  static fromJSON(json) {
    return new Permission({
      ...json,
      grantedAt: new Date(json.grantedAt),
      expiresAt: json.expiresAt ? new Date(json.expiresAt) : null,
      capabilities: json.capabilities || json.permissions
    });
  }

  /**
   * Creates Permission from user grant
   * @param {string} origin - Webpage origin
   * @param {string} deviceId - Device identifier
   * @param {string[]} permissions - Requested permissions
   * @param {boolean} persistent - Whether to persist across restarts
   * @returns {Permission} New Permission instance
   */
  static grant(origin, deviceId, permissions, persistent = false) {
    const expiresAt = persistent ? null : new Date(Date.now() + 24 * 60 * 60 * 1000);

    return new Permission({
      origin,
      deviceId,
      capabilities: permissions,
      grantedAt: new Date(),
      expiresAt,
      persistent
    });
  }

  /**
   * Creates Permission with explicit timeout support for manager integration.
   */
  static create(origin, deviceId, capabilities, persistent = false, timeoutMs = null) {
    const grantedAt = new Date();
    const expiresAt = persistent
      ? null
      : new Date(grantedAt.getTime() + (timeoutMs || 24 * 60 * 60 * 1000));

    return new Permission({
      origin,
      deviceId,
      capabilities,
      grantedAt,
      expiresAt,
      persistent
    });
  }
}

// Optional compatibility exports for non-module script contexts and CommonJS tooling.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Permission };
}

if (typeof window !== 'undefined') {
  window.Permission = Permission;
}