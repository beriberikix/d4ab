const { v4: uuidv4 } = require('uuid');

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * BridgeSession model for active communication channels
 */
class BridgeSession {
  constructor(data = {}) {
    this.sessionId = data.sessionId || uuidv4();
    this.origin = data.origin || '';
    this.deviceId = data.deviceId || '';
    this.startedAt = data.startedAt || new Date();
    this.lastActivity = data.lastActivity || new Date();
    this.status = data.status || 'active'; // 'active' | 'idle' | 'closed' | 'error'
    this.messageCount = data.messageCount || 0;
    this.bytesSent = data.bytesSent || 0;
    this.bytesReceived = data.bytesReceived || 0;
    this.idleTimeoutMs = data.idleTimeoutMs || Number(process.env.D4AB_SESSION_IDLE_TIMEOUT_MS || DEFAULT_IDLE_TIMEOUT_MS);

    // Internal state
    this._idleTimer = null;
    this._device = null;
  }

  /**
   * Validates session data
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // Validate sessionId (UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!this.sessionId || !uuidRegex.test(this.sessionId)) {
      errors.push('SessionId must be a valid UUID');
    }

    // Validate origin
    if (!this.origin) {
      errors.push('Origin is required');
    }

    // Validate deviceId
    if (!this.deviceId) {
      errors.push('DeviceId is required');
    }

    // Validate status
    if (!['active', 'idle', 'closed', 'error'].includes(this.status)) {
      errors.push('Status must be active, idle, closed, or error');
    }

    // Validate dates
    if (!(this.startedAt instanceof Date)) {
      errors.push('StartedAt must be a Date');
    }

    if (!(this.lastActivity instanceof Date)) {
      errors.push('LastActivity must be a Date');
    }

    if (this.startedAt && this.lastActivity && this.lastActivity < this.startedAt) {
      errors.push('LastActivity cannot be before StartedAt');
    }

    // Validate counters
    if (typeof this.messageCount !== 'number' || this.messageCount < 0) {
      errors.push('MessageCount must be non-negative number');
    }

    if (typeof this.bytesSent !== 'number' || this.bytesSent < 0) {
      errors.push('BytesSent must be non-negative number');
    }

    if (typeof this.bytesReceived !== 'number' || this.bytesReceived < 0) {
      errors.push('BytesReceived must be non-negative number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Updates session activity and resets idle timer
   * @param {number} bytesTransferred - Number of bytes in this activity
   */
  recordActivity(bytesTransferred = 0) {
    this.lastActivity = new Date();
    this.messageCount++;

    if (bytesTransferred > 0) {
      this.bytesSent += bytesTransferred;
    }

    if (this.status === 'idle') {
      this.status = 'active';
    }

    this._resetIdleTimer();
  }

  /**
   * Records received data
   * @param {number} bytesReceived - Number of bytes received
   */
  recordReceived(bytesReceived) {
    this.lastActivity = new Date();
    this.bytesReceived += bytesReceived;
    this._resetIdleTimer();
  }

  /**
   * Checks if session is idle (no activity for 5 minutes)
   * @returns {boolean} Whether session is idle
   */
  isIdle() {
    return (new Date() - this.lastActivity) > this.idleTimeoutMs;
  }

  /**
   * Transitions session to idle status
   */
  markIdle() {
    if (this.status === 'active') {
      this.status = 'idle';
    }
  }

  /**
   * Closes the session
   * @param {string} reason - Reason for closing
   */
  close(reason = 'normal') {
    this.status = 'closed';
    this.lastActivity = new Date();

    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }

    // Cleanup device reference
    this._device = null;
  }

  /**
   * Marks session as error state
   * @param {Error|string} error - Error that occurred
   */
  markError(error) {
    this.status = 'error';
    this.lastActivity = new Date();
    this._error = error instanceof Error ? error.message : error;
  }

  /**
   * Gets session duration in milliseconds
   * @returns {number} Duration since session started
   */
  getDuration() {
    return new Date() - this.startedAt;
  }

  /**
   * Gets session statistics
   * @returns {Object} Session statistics
   */
  getStats() {
    return {
      sessionId: this.sessionId,
      duration: this.getDuration(),
      messageCount: this.messageCount,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      totalBytes: this.bytesSent + this.bytesReceived,
      status: this.status,
      isIdle: this.isIdle()
    };
  }

  /**
   * Sets up idle timer (private method)
   * @private
   */
  _resetIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
    }

    // Set idle timer using configured threshold.
    this._idleTimer = setTimeout(() => {
      this.markIdle();
    }, this.idleTimeoutMs);

    if (this._idleTimer && typeof this._idleTimer.unref === 'function') {
      this._idleTimer.unref();
    }
  }

  /**
   * Converts session to JSON representation
   * @returns {Object} JSON object
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      origin: this.origin,
      deviceId: this.deviceId,
      startedAt: this.startedAt.toISOString(),
      lastActivity: this.lastActivity.toISOString(),
      status: this.status,
      messageCount: this.messageCount,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived
    };
  }

  /**
   * Creates BridgeSession from JSON data
   * @param {Object} json - JSON object
   * @returns {BridgeSession} New BridgeSession instance
   */
  static fromJSON(json) {
    return new BridgeSession({
      ...json,
      startedAt: new Date(json.startedAt),
      lastActivity: new Date(json.lastActivity)
    });
  }

  /**
   * Creates new session for device connection
   * @param {string} origin - Requesting origin
   * @param {string} deviceId - Target device ID
   * @returns {BridgeSession} New session instance
   */
  static create(origin, deviceId) {
    const session = new BridgeSession({
      origin,
      deviceId,
      startedAt: new Date(),
      lastActivity: new Date(),
      status: 'active'
    });

    session._resetIdleTimer();
    return session;
  }
}

module.exports = BridgeSession;