const { v4: uuidv4 } = require('uuid');

/**
 * APIRequest model for tracking device API commands
 */
class APIRequest {
  constructor(data = {}) {
    this.requestId = data.requestId || uuidv4();
    this.sessionId = data.sessionId || '';
    this.method = data.method || '';
    this.parameters = data.parameters || {};
    this.timestamp = data.timestamp || new Date();
    this.status = data.status || 'pending'; // 'pending' | 'processing' | 'completed' | 'failed'
    this.response = data.response || null;
    this.error = data.error || null;

    // Internal tracking
    this._startTime = new Date();
    this._timeout = data.timeout || 30000; // 30 seconds default
    this._timer = null;
  }

  /**
   * Validates request data
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // Validate requestId (UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!this.requestId || !uuidRegex.test(this.requestId)) {
      errors.push('RequestId must be a valid UUID');
    }

    // Validate sessionId
    if (!this.sessionId) {
      errors.push('SessionId is required');
    }

    // Validate method
    const validMethods = ['enumerate', 'connect', 'read', 'write', 'disconnect', 'heartbeat'];
    if (!validMethods.includes(this.method)) {
      errors.push(`Method must be one of: ${validMethods.join(', ')}`);
    }

    // Validate parameters based on method
    const paramErrors = this._validateParameters();
    errors.push(...paramErrors);

    // Validate status
    if (!['pending', 'processing', 'completed', 'failed'].includes(this.status)) {
      errors.push('Status must be pending, processing, completed, or failed');
    }

    // Validate timestamp
    if (!(this.timestamp instanceof Date)) {
      errors.push('Timestamp must be a Date');
    }

    // Validate response/error state
    if (this.status === 'completed' && !this.response) {
      errors.push('Completed requests must have response data');
    }

    if (this.status === 'failed' && !this.error) {
      errors.push('Failed requests must have error information');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates method-specific parameters
   * @private
   * @returns {string[]} Validation errors
   */
  _validateParameters() {
    const errors = [];
    const params = this.parameters;

    switch (this.method) {
      case 'enumerate':
        if (params.type && !['usb', 'serial', 'bluetooth', 'all'].includes(params.type)) {
          errors.push('Enumerate type must be usb, serial, bluetooth, or all');
        }
        if (params.includeDisconnected && typeof params.includeDisconnected !== 'boolean') {
          errors.push('includeDisconnected must be boolean');
        }
        break;

      case 'connect':
        if (!params.deviceId) {
          errors.push('Connect requires deviceId parameter');
        }
        if (params.options) {
          if (params.options.timeout && typeof params.options.timeout !== 'number') {
            errors.push('Connection timeout must be number');
          }
          if (params.options.baudRate && typeof params.options.baudRate !== 'number') {
            errors.push('Baud rate must be number');
          }
        }
        break;

      case 'read':
        if (params.length !== undefined) {
          if (typeof params.length !== 'number' || params.length < 1 || params.length > 65536) {
            errors.push('Read length must be number between 1 and 65536');
          }
        }
        if (params.timeout && typeof params.timeout !== 'number') {
          errors.push('Read timeout must be number');
        }
        break;

      case 'write':
        if (!params.data) {
          errors.push('Write requires data parameter');
        } else if (typeof params.data !== 'string') {
          errors.push('Write data must be base64 string');
        } else {
          // Validate base64
          try {
            Buffer.from(params.data, 'base64');
          } catch (e) {
            errors.push('Write data must be valid base64');
          }
        }
        if (params.timeout && typeof params.timeout !== 'number') {
          errors.push('Write timeout must be number');
        }
        break;

      case 'disconnect':
        // No parameters required for disconnect
        break;

      case 'heartbeat':
        // No parameters required for heartbeat
        break;
    }

    return errors;
  }

  /**
   * Starts processing the request
   */
  startProcessing() {
    if (this.status === 'pending') {
      this.status = 'processing';
      this._startTime = new Date();
      this._setupTimeout();
    }
  }

  /**
   * Completes the request with response data
   * @param {*} response - Response data
   */
  complete(response) {
    if (['pending', 'processing'].includes(this.status)) {
      this.status = 'completed';
      this.response = response;
      this._clearTimeout();
    }
  }

  /**
   * Fails the request with error
   * @param {Error|string} error - Error information
   */
  fail(error) {
    if (['pending', 'processing'].includes(this.status)) {
      this.status = 'failed';
      this.error = error instanceof Error ? error.message : error;
      this._clearTimeout();
    }
  }

  /**
   * Gets request duration in milliseconds
   * @returns {number} Duration since request started
   */
  getDuration() {
    return new Date() - this._startTime;
  }

  /**
   * Checks if request has timed out
   * @returns {boolean} Whether request has exceeded timeout
   */
  hasTimedOut() {
    return this.getDuration() > this._timeout;
  }

  /**
   * Sets up timeout timer
   * @private
   */
  _setupTimeout() {
    this._timer = setTimeout(() => {
      if (['pending', 'processing'].includes(this.status)) {
        this.fail(`Request timed out after ${this._timeout}ms`);
      }
    }, this._timeout);
  }

  /**
   * Clears timeout timer
   * @private
   */
  _clearTimeout() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Gets request statistics
   * @returns {Object} Request statistics
   */
  getStats() {
    return {
      requestId: this.requestId,
      method: this.method,
      status: this.status,
      duration: this.getDuration(),
      timedOut: this.hasTimedOut(),
      hasResponse: !!this.response,
      hasError: !!this.error
    };
  }

  /**
   * Converts request to JSON representation
   * @returns {Object} JSON object
   */
  toJSON() {
    return {
      requestId: this.requestId,
      sessionId: this.sessionId,
      method: this.method,
      parameters: { ...this.parameters },
      timestamp: this.timestamp.toISOString(),
      status: this.status,
      response: this.response,
      error: this.error
    };
  }

  /**
   * Creates APIRequest from JSON data
   * @param {Object} json - JSON object
   * @returns {APIRequest} New APIRequest instance
   */
  static fromJSON(json) {
    return new APIRequest({
      ...json,
      timestamp: new Date(json.timestamp)
    });
  }

  /**
   * Creates new API request
   * @param {string} sessionId - Session ID
   * @param {string} method - API method name
   * @param {Object} parameters - Method parameters
   * @param {number} timeout - Request timeout in ms
   * @returns {APIRequest} New request instance
   */
  static create(sessionId, method, parameters = {}, timeout = 30000) {
    return new APIRequest({
      sessionId,
      method,
      parameters,
      timeout
    });
  }
}

module.exports = APIRequest;