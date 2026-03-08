/**
 * SecurityContext model for encrypted communication channels
 */
export class SecurityContext {
  constructor(data = {}) {
    this.contextId = data.contextId || this._generateContextId();
    this.extensionId = data.extensionId || '';
    this.processId = data.processId || 0;
    this.establishedAt = data.establishedAt || new Date();
    this.lastHeartbeat = data.lastHeartbeat || new Date();
    this.encryptionKey = data.encryptionKey || null;
    this.messagesSent = data.messagesSent || 0;
    this.messagesReceived = data.messagesReceived || 0;

    // Internal state
    this._heartbeatTimer = null;
    this._keyRotationTimer = null;
    this._authenticated = false;
  }

  /**
   * Generates unique context identifier
   * @private
   * @returns {string} Context ID
   */
  _generateContextId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `ctx_${timestamp}_${random}`;
  }

  /**
   * Validates security context data
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // Validate contextId
    if (!this.contextId || typeof this.contextId !== 'string') {
      errors.push('ContextId must be non-empty string');
    }

    // Validate extensionId
    if (!this.extensionId) {
      errors.push('ExtensionId is required');
    }

    // Validate processId
    if (typeof this.processId !== 'number' || this.processId <= 0) {
      errors.push('ProcessId must be positive number');
    }

    // Validate dates
    if (!(this.establishedAt instanceof Date)) {
      errors.push('EstablishedAt must be Date');
    }

    if (!(this.lastHeartbeat instanceof Date)) {
      errors.push('LastHeartbeat must be Date');
    }

    if (this.establishedAt && this.lastHeartbeat && this.lastHeartbeat < this.establishedAt) {
      errors.push('LastHeartbeat cannot be before EstablishedAt');
    }

    // Validate counters
    if (typeof this.messagesSent !== 'number' || this.messagesSent < 0) {
      errors.push('MessagesSent must be non-negative number');
    }

    if (typeof this.messagesReceived !== 'number' || this.messagesReceived < 0) {
      errors.push('MessagesReceived must be non-negative number');
    }

    // Validate encryption key if present
    if (this.encryptionKey && typeof this.encryptionKey !== 'string') {
      errors.push('EncryptionKey must be string if present');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Establishes secure context
   * @param {string} extensionId - Browser extension ID
   * @param {number} processId - Native bridge process ID
   * @returns {boolean} Success of establishment
   */
  establish(extensionId, processId) {
    if (extensionId && processId > 0) {
      this.extensionId = extensionId;
      this.processId = processId;
      this.establishedAt = new Date();
      this.lastHeartbeat = new Date();
      this._authenticated = true;

      this._startHeartbeat();
      this._startKeyRotation();

      return true;
    }
    return false;
  }

  /**
   * Records heartbeat activity
   */
  heartbeat() {
    this.lastHeartbeat = new Date();
  }

  /**
   * Checks if context requires heartbeat (>60 seconds since last)
   * @returns {boolean} Whether heartbeat is overdue
   */
  needsHeartbeat() {
    const heartbeatThreshold = 60 * 1000; // 60 seconds
    return (new Date() - this.lastHeartbeat) > heartbeatThreshold;
  }

  /**
   * Records sent message
   * @param {number} size - Message size in bytes
   */
  recordSent(size = 0) {
    this.messagesSent++;
    if (size > 0) {
      // Could track total bytes sent if needed
    }
  }

  /**
   * Records received message
   * @param {number} size - Message size in bytes
   */
  recordReceived(_size = 0) {
    this.messagesReceived++;
    this.lastHeartbeat = new Date(); // Receiving counts as heartbeat
  }

  /**
   * Generates new encryption key
   * @returns {string} New encryption key
   */
  rotateEncryptionKey() {
    // Generate 256-bit key (32 bytes as hex)
    const key = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');

    this.encryptionKey = key;
    return key;
  }

  /**
   * Checks if encryption key needs rotation (>24 hours)
   * @returns {boolean} Whether key rotation is due
   */
  needsKeyRotation() {
    if (!this.encryptionKey) return true;

    const rotationThreshold = 24 * 60 * 60 * 1000; // 24 hours
    return (new Date() - this.establishedAt) > rotationThreshold;
  }

  /**
   * Gets context health status
   * @returns {Object} Health information
   */
  getHealthStatus() {
    return {
      contextId: this.contextId,
      authenticated: this._authenticated,
      uptime: new Date() - this.establishedAt,
      lastHeartbeat: this.lastHeartbeat,
      needsHeartbeat: this.needsHeartbeat(),
      needsKeyRotation: this.needsKeyRotation(),
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      totalMessages: this.messagesSent + this.messagesReceived
    };
  }

  /**
   * Terminates security context
   */
  terminate() {
    this._authenticated = false;
    this.encryptionKey = null;

    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    if (this._keyRotationTimer) {
      clearInterval(this._keyRotationTimer);
      this._keyRotationTimer = null;
    }
  }

  /**
   * Starts heartbeat monitoring
   * @private
   */
  _startHeartbeat() {
    // Check heartbeat every 60 seconds
    this._heartbeatTimer = setInterval(() => {
      if (this.needsHeartbeat()) {
        // Could emit event or call callback here
        console.warn('SecurityContext heartbeat overdue:', this.contextId);
      }
    }, 60000);
  }

  /**
   * Starts encryption key rotation
   * @private
   */
  _startKeyRotation() {
    // Rotate key every 24 hours
    this._keyRotationTimer = setInterval(() => {
      if (this.needsKeyRotation()) {
        this.rotateEncryptionKey();
      }
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Converts context to JSON representation
   * @returns {Object} JSON object (excludes sensitive data)
   */
  toJSON() {
    return {
      contextId: this.contextId,
      extensionId: this.extensionId,
      processId: this.processId,
      establishedAt: this.establishedAt.toISOString(),
      lastHeartbeat: this.lastHeartbeat.toISOString(),
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      // Exclude encryptionKey for security
      hasEncryptionKey: !!this.encryptionKey
    };
  }

  /**
   * Creates SecurityContext from JSON data
   * @param {Object} json - JSON object
   * @returns {SecurityContext} New SecurityContext instance
   */
  static fromJSON(json) {
    return new SecurityContext({
      ...json,
      establishedAt: new Date(json.establishedAt),
      lastHeartbeat: new Date(json.lastHeartbeat),
      // Don't restore encryption key from JSON for security
      encryptionKey: null
    });
  }

  /**
   * Creates new security context
   * @param {string} extensionId - Extension identifier
   * @param {number} processId - Process identifier
   * @returns {SecurityContext} New context instance
   */
  static create(extensionId, processId) {
    const context = new SecurityContext();
    context.establish(extensionId, processId);
    return context;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SecurityContext };
}

if (typeof window !== 'undefined') {
  window.SecurityContext = SecurityContext;
}