/**
 * Device model representing physical hardware devices
 */
class Device {
  constructor(data = {}) {
    this.id = data.id || '';
    this.type = data.type || 'usb'; // 'usb' | 'serial' | 'bluetooth'
    this.name = data.name || '';
    this.vendorId = data.vendorId || 0;
    this.productId = data.productId || 0;
    this.serialNumber = data.serialNumber || null;
    this.status = data.status || 'disconnected'; // 'connected' | 'disconnected' | 'busy' | 'error'
    this.capabilities = data.capabilities || ['read'];
    this.lastSeen = data.lastSeen || new Date();
    this.path = data.path || null;
    this.connectedAt = data.connectedAt || null;
    this.metadata = data.metadata || {};
  }

  /**
   * Validates device data according to business rules
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    if (!this.id || typeof this.id !== 'string') {
      errors.push('Device ID must be a non-empty string');
    }

    if (!['usb', 'serial', 'bluetooth'].includes(this.type)) {
      errors.push('Device type must be usb, serial, or bluetooth');
    }

    if (!this.name || typeof this.name !== 'string') {
      errors.push('Device name must be a non-empty string');
    }

    if (typeof this.vendorId !== 'number' || this.vendorId < 0) {
      errors.push('Vendor ID must be a positive integer');
    }

    if (typeof this.productId !== 'number' || this.productId < 0) {
      errors.push('Product ID must be a positive integer');
    }

    if (!['connected', 'disconnected', 'busy', 'error'].includes(this.status)) {
      errors.push('Status must be connected, disconnected, busy, or error');
    }

    if (!Array.isArray(this.capabilities) || this.capabilities.length === 0) {
      errors.push('Capabilities must be non-empty array');
    }

    const validCapabilities = ['read', 'write', 'control'];
    for (const cap of this.capabilities) {
      if (!validCapabilities.includes(cap)) {
        errors.push(`Invalid capability: ${cap}`);
      }
    }

    if (!(this.lastSeen instanceof Date)) {
      errors.push('LastSeen must be a Date object');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Updates device status with validation
   * @param {string} newStatus - New status value
   * @returns {boolean} Success of status change
   */
  updateStatus(newStatus) {
    const validTransitions = {
      'disconnected': ['connected', 'error'],
      'connected': ['disconnected', 'busy', 'error'],
      'busy': ['connected', 'error'],
      'error': ['connected', 'disconnected']
    };

    if (validTransitions[this.status]?.includes(newStatus)) {
      this.status = newStatus;
      this.lastSeen = new Date();
      return true;
    }

    return false;
  }

  /**
   * Checks if device supports a specific capability
   * @param {string} capability - Capability to check
   * @returns {boolean} Whether device supports capability
   */
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * Converts device to JSON representation
   * @returns {Object} JSON-serializable object
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      vendorId: this.vendorId,
      productId: this.productId,
      capabilities: [...this.capabilities],
      serialNumber: this.serialNumber,
      path: this.path,
      lastSeen: this.lastSeen.toISOString(),
      connectedAt: this.connectedAt ? this.connectedAt.toISOString() : null,
      metadata: { ...this.metadata }
    };
  }

  /**
   * Creates Device from JSON data
   * @param {Object} json - JSON object
   * @returns {Device} New Device instance
   */
  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid JSON data');
    }

    if (!json.id || !json.name || !json.type) {
      throw new Error('Missing required fields in JSON data');
    }

    return new Device({
      ...json,
      lastSeen: new Date(json.lastSeen),
      connectedAt: json.connectedAt ? new Date(json.connectedAt) : null
    });
  }

  /**
   * Creates a new Device instance with validation
   * @param {string} id - Device identifier
   * @param {string} name - Device name
   * @param {string} type - Device type ('usb', 'serial', 'bluetooth')
   * @param {number} vendorId - Vendor ID
   * @param {number} productId - Product ID
   * @param {string[]} capabilities - Device capabilities
   * @param {string} path - Device path (optional)
   * @param {string} serialNumber - Serial number (optional)
   * @returns {Device} New Device instance
   */
  static create(id, name, type, vendorId, productId, capabilities = ['read'], path = null, serialNumber = null) {
    // Validation
    if (!id || typeof id !== 'string') {
      throw new Error('Device ID is required');
    }

    if (!name || typeof name !== 'string') {
      throw new Error('Device name is required');
    }

    if (!['usb', 'serial', 'bluetooth'].includes(type)) {
      throw new Error(`Invalid device type: ${type}`);
    }

    if (typeof vendorId !== 'number' || vendorId < 0 || vendorId > 0xFFFF) {
      throw new Error('Invalid vendor ID');
    }

    if (typeof productId !== 'number' || productId < 0 || productId > 0xFFFF) {
      throw new Error('Invalid product ID');
    }

    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new Error('At least one capability is required');
    }

    const validCapabilities = ['read', 'write', 'control'];
    for (const cap of capabilities) {
      if (!validCapabilities.includes(cap)) {
        throw new Error(`Invalid capability: ${cap}`);
      }
    }

    // Normalize and validate device ID based on type
    let normalizedId = id;
    if (type === 'bluetooth') {
      // Normalize Bluetooth ID to remove colons
      normalizedId = id.replace(/:/g, '');
    }

    if (!this.isValidDeviceId(normalizedId, type)) {
      throw new Error(`Invalid device ID format for type ${type}: ${id}`);
    }

    return new Device({
      id: normalizedId,
      name,
      type,
      vendorId,
      productId,
      capabilities: [...capabilities],
      path,
      serialNumber,
      status: 'disconnected',
      lastSeen: new Date()
    });
  }

  /**
   * Validates device ID format for specific device type
   * @param {string} id - Device ID
   * @param {string} type - Device type
   * @returns {boolean} True if valid format
   */
  static isValidDeviceId(id, type) {
    switch (type) {
      case 'usb':
        // Format: usb:1234:5678 (vendor:product in hex)
        return /^usb:[0-9a-f]{4}:[0-9a-f]{4}$/i.test(id);

      case 'serial':
        // Format: serial:COM1 or serial:/dev/ttyUSB0
        return /^serial:.+$/.test(id) && !id.includes(' ');

      case 'bluetooth':
        // Format: 001122334455 or 00:11:22:33:44:55
        const normalized = id.replace(/:/g, '');
        return /^[0-9a-f]{12}$/i.test(normalized);

      default:
        return false;
    }
  }

  /**
   * Validates vendor ID
   * @param {number} vendorId - Vendor ID
   * @returns {boolean} True if valid
   */
  static isValidVendorId(vendorId) {
    return typeof vendorId === 'number' && vendorId >= 0 && vendorId <= 0xFFFF;
  }

  /**
   * Validates product ID
   * @param {number} productId - Product ID
   * @returns {boolean} True if valid
   */
  static isValidProductId(productId) {
    return typeof productId === 'number' && productId >= 0 && productId <= 0xFFFF;
  }

  /**
   * Validates capabilities array
   * @param {string[]} capabilities - Capabilities array
   * @returns {boolean} True if valid
   */
  static isValidCapabilities(capabilities) {
    if (!Array.isArray(capabilities)) {
      return false;
    }

    const validCapabilities = ['read', 'write', 'control'];
    const uniqueCapabilities = [...new Set(capabilities)];

    return uniqueCapabilities.length === capabilities.length &&
           capabilities.every(cap => typeof cap === 'string' && validCapabilities.includes(cap));
  }

  /**
   * Validates device status
   * @param {string} status - Device status
   * @returns {boolean} True if valid
   */
  static isValidStatus(status) {
    return ['connected', 'disconnected', 'connecting', 'error'].includes(status);
  }

  /**
   * Sets device status with validation
   * @param {string} status - New status
   * @returns {boolean} True if status was set
   */
  setStatus(status) {
    if (!Device.isValidStatus(status)) {
      return false;
    }

    // Define valid state transitions
    const validTransitions = {
      'disconnected': ['connecting', 'error'],
      'connecting': ['connected', 'disconnected', 'error'],
      'connected': ['disconnected', 'error'], // connected cannot go to connecting
      'error': ['disconnected', 'connecting', 'connected']
    };

    const currentStatus = this.status;
    if (validTransitions[currentStatus] && validTransitions[currentStatus].includes(status)) {
      this.status = status;
      this.lastSeen = new Date();
      return true;
    }

    return false;
  }

  /**
   * Checks if device equals another device (by ID)
   * @param {Device} other - Other device
   * @returns {boolean} True if equal
   */
  equals(other) {
    return other instanceof Device && this.id === other.id;
  }

  /**
   * Generates hash code for device (based on ID)
   * @returns {number} Hash code
   */
  hashCode() {
    let hash = 0;
    for (let i = 0; i < this.id.length; i++) {
      const char = this.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Updates last seen timestamp
   */
  updateLastSeen() {
    this.lastSeen = new Date();
  }

  /**
   * Adds a capability if not already present
   * @param {string} capability - Capability to add
   */
  addCapability(capability) {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
    }
  }

  /**
   * Removes a capability
   * @param {string} capability - Capability to remove
   */
  removeCapability(capability) {
    const index = this.capabilities.indexOf(capability);
    if (index > -1) {
      this.capabilities.splice(index, 1);
    }
  }

  /**
   * Sets metadata value
   * @param {string} key - Metadata key
   * @param {*} value - Metadata value
   */
  setMetadata(key, value) {
    if (!this.metadata) {
      this.metadata = {};
    }
    this.metadata[key] = value;
  }
}

module.exports = Device;