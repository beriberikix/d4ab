/**
 * Error Handling and Logging Service
 * Centralized error management, logging, and reporting for the hardware bridge
 */

const fs = require('fs').promises;
const path = require('path');

class ErrorHandler {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info';
    this.logFile = options.logFile || path.join(process.cwd(), 'logs', 'bridge.log');
    this.errorFile = options.errorFile || path.join(process.cwd(), 'logs', 'errors.log');
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = options.maxLogFiles || 5;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.errorQueue = [];
    this.logQueue = [];
    this.isProcessing = false;
    this.errorCounts = new Map();
    this.startTime = new Date();
  }

  /**
   * Initialize error handler
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.logFile);
      await this.ensureDirectory(logDir);

      // Set up unhandled error listeners
      this.setupGlobalErrorHandlers();

      // Start log processing
      this.startLogProcessing();

      await this.log('info', 'ErrorHandler initialized', {
        logLevel: this.logLevel,
        logFile: this.logFile,
        pid: process.pid
      });

    } catch (error) {
      console.error('ErrorHandler initialization failed:', error);
      throw error;
    }
  }

  /**
   * Logs a message with specified level
   * @param {string} level - Log level (error, warn, info, debug)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @param {Error} error - Optional error object
   */
  async log(level, message, metadata = {}, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      metadata,
      pid: process.pid,
      uptime: Date.now() - this.startTime.getTime()
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      };
    }

    // Add to appropriate queue
    if (level === 'error') {
      this.errorQueue.push(logEntry);
      this.updateErrorCounts(error || new Error(message));
    } else {
      this.logQueue.push(logEntry);
    }

    // Console output
    if (this.enableConsole && this.shouldLog(level)) {
      this.writeToConsole(logEntry);
    }

    // Process queues
    this.processQueues();
  }

  /**
   * Logs error with full context
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  async error(error, context = {}) {
    await this.log('error', error.message, context, error);
  }

  /**
   * Logs warning message
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  async warn(message, metadata = {}) {
    await this.log('warn', message, metadata);
  }

  /**
   * Logs info message
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  async info(message, metadata = {}) {
    await this.log('info', message, metadata);
  }

  /**
   * Logs debug message
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional metadata
   */
  async debug(message, metadata = {}) {
    await this.log('debug', message, metadata);
  }

  /**
   * Handles hardware-specific errors with categorization
   * @param {Error} error - Hardware error
   * @param {string} deviceType - Device type (usb, serial, bluetooth)
   * @param {string} deviceId - Device identifier
   * @param {string} operation - Operation being performed
   */
  async handleHardwareError(error, deviceType, deviceId, operation) {
    const context = {
      category: 'hardware',
      deviceType,
      deviceId,
      operation,
      errorCode: this.categorizeHardwareError(error),
      timestamp: new Date().toISOString()
    };

    await this.error(error, context);

    // Return standardized error for JSON-RPC response
    return {
      code: context.errorCode,
      message: this.sanitizeErrorMessage(error.message),
      data: {
        deviceType,
        operation,
        originalError: error.name
      }
    };
  }

  /**
   * Handles JSON-RPC protocol errors
   * @param {Error} error - Protocol error
   * @param {Object} request - Original request
   */
  async handleProtocolError(error, request = null) {
    const context = {
      category: 'protocol',
      request: request ? {
        method: request.method,
        id: request.id,
        hasParams: !!request.params
      } : null
    };

    await this.error(error, context);

    // Return standardized JSON-RPC error
    if (error.message.includes('parse')) {
      return { code: -32700, message: 'Parse error' };
    }
    if (error.message.includes('request')) {
      return { code: -32600, message: 'Invalid Request' };
    }
    if (error.message.includes('method')) {
      return { code: -32601, message: 'Method not found' };
    }
    if (error.message.includes('params')) {
      return { code: -32602, message: 'Invalid params' };
    }

    return { code: -32603, message: 'Internal error' };
  }

  /**
   * Handles native messaging errors
   * @param {Error} error - Native messaging error
   * @param {string} direction - 'incoming' or 'outgoing'
   */
  async handleNativeMessagingError(error, direction) {
    const context = {
      category: 'native_messaging',
      direction,
      errorType: this.categorizeNativeMessagingError(error)
    };

    await this.error(error, context);
  }

  /**
   * Creates error report for debugging
   * @param {string} operation - Operation that failed
   * @param {Object} context - Error context
   * @returns {Object} Error report
   */
  createErrorReport(operation, context = {}) {
    const recentErrors = this.getRecentErrors(50);
    const errorStats = this.getErrorStatistics();

    return {
      operation,
      timestamp: new Date().toISOString(),
      context,
      recentErrors: recentErrors.map(entry => ({
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        category: entry.metadata.category,
        errorCode: entry.metadata.errorCode
      })),
      statistics: errorStats,
      systemInfo: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
        uptime: Date.now() - this.startTime.getTime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Gets recent error entries
   * @param {number} count - Number of recent errors
   * @returns {Array} Recent error entries
   */
  getRecentErrors(count = 10) {
    return this.errorQueue.slice(-count);
  }

  /**
   * Gets error statistics
   * @returns {Object} Error statistics
   */
  getErrorStatistics() {
    const stats = {
      totalErrors: this.errorQueue.length,
      errorTypes: {},
      errorCodes: {},
      categories: {},
      hourlyCount: new Array(24).fill(0)
    };

    // Process error queue for statistics
    for (const entry of this.errorQueue) {
      // Count by error type
      const errorType = entry.error?.name || 'Unknown';
      stats.errorTypes[errorType] = (stats.errorTypes[errorType] || 0) + 1;

      // Count by error code
      const errorCode = entry.metadata.errorCode || 'unknown';
      stats.errorCodes[errorCode] = (stats.errorCodes[errorCode] || 0) + 1;

      // Count by category
      const category = entry.metadata.category || 'uncategorized';
      stats.categories[category] = (stats.categories[category] || 0) + 1;

      // Count by hour
      const hour = new Date(entry.timestamp).getHours();
      stats.hourlyCount[hour]++;
    }

    return stats;
  }

  /**
   * Categorizes hardware errors for consistent error codes
   * @param {Error} error - Hardware error
   * @returns {number} Error code
   */
  categorizeHardwareError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('not found') || message.includes('no device')) {
      return -1002; // Device not found
    }
    if (message.includes('permission') || message.includes('access denied')) {
      return -1001; // Permission denied
    }
    if (message.includes('busy') || message.includes('in use')) {
      return -1003; // Device busy
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return -1004; // Timeout
    }
    if (message.includes('disconnect') || message.includes('connection')) {
      return -1005; // Connection error
    }
    if (message.includes('invalid') || message.includes('bad')) {
      return -1006; // Invalid operation
    }

    return -1000; // Generic hardware error
  }

  /**
   * Categorizes native messaging errors
   * @param {Error} error - Native messaging error
   * @returns {string} Error type
   */
  categorizeNativeMessagingError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('connection')) return 'connection_error';
    if (message.includes('timeout')) return 'timeout_error';
    if (message.includes('parse')) return 'parse_error';
    if (message.includes('protocol')) return 'protocol_error';
    if (message.includes('permission')) return 'permission_error';

    return 'unknown_error';
  }

  /**
   * Sanitizes error messages for public consumption
   * @param {string} message - Original error message
   * @returns {string} Sanitized message
   */
  sanitizeErrorMessage(message) {
    // Remove sensitive information like file paths, system details
    return message
      .replace(/\/[^\s]*\/[^\s]*/g, '[PATH]') // Remove file paths
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]') // Remove IP addresses
      .replace(/pid:\s*\d+/gi, 'pid:[PID]') // Remove process IDs
      .substring(0, 200); // Limit length
  }

  /**
   * Sets up global error handlers
   */
  setupGlobalErrorHandlers() {
    // Unhandled exceptions
    process.on('uncaughtException', (error) => {
      this.error(error, { category: 'uncaught_exception' });

      // Allow some time for logging before exit
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.error(error, {
        category: 'unhandled_rejection',
        promise: promise.toString()
      });
    });

    // Process warnings
    process.on('warning', (warning) => {
      this.warn(warning.message, {
        category: 'process_warning',
        name: warning.name,
        stack: warning.stack
      });
    });
  }

  /**
   * Determines if message should be logged based on level
   * @param {string} level - Log level
   * @returns {boolean} Should log
   */
  shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = levels[this.logLevel] || 2;
    const messageLevel = levels[level] || 2;

    return messageLevel <= currentLevel;
  }

  /**
   * Writes log entry to console
   * @param {Object} logEntry - Log entry
   */
  writeToConsole(logEntry) {
    const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [${logEntry.level}]`;

    if (logEntry.level === 'ERROR') {
      console.error(prefix, logEntry.message, logEntry.error ? logEntry.error.stack : '');
    } else if (logEntry.level === 'WARN') {
      console.warn(prefix, logEntry.message);
    } else {
      console.log(prefix, logEntry.message);
    }
  }

  /**
   * Starts log queue processing
   */
  startLogProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => {
      this.processQueues();
    }, 1000); // Process every second
  }

  /**
   * Processes log and error queues
   */
  async processQueues() {
    if (this.isProcessing || !this.enableFile) return;

    this.isProcessing = true;

    try {
      // Process error queue
      if (this.errorQueue.length > 0) {
        const errors = this.errorQueue.splice(0);
        await this.writeToFile(this.errorFile, errors);
      }

      // Process log queue
      if (this.logQueue.length > 0) {
        const logs = this.logQueue.splice(0);
        await this.writeToFile(this.logFile, logs);
      }

    } catch (error) {
      console.error('Log processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Writes entries to log file
   * @param {string} filePath - Log file path
   * @param {Array} entries - Log entries
   */
  async writeToFile(filePath, entries) {
    try {
      // Check if rotation is needed
      await this.rotateLogIfNeeded(filePath);

      // Format entries
      const lines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';

      // Append to file
      await fs.appendFile(filePath, lines, 'utf8');

    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Rotates log file if it exceeds size limit
   * @param {string} filePath - Log file path
   */
  async rotateLogIfNeeded(filePath) {
    try {
      const stats = await fs.stat(filePath);

      if (stats.size > this.maxLogSize) {
        // Rotate existing files
        for (let i = this.maxLogFiles - 1; i > 0; i--) {
          const oldPath = `${filePath}.${i}`;
          const newPath = `${filePath}.${i + 1}`;

          try {
            await fs.rename(oldPath, newPath);
          } catch (error) {
            // File might not exist, ignore
          }
        }

        // Move current log to .1
        await fs.rename(filePath, `${filePath}.1`);
      }

    } catch (error) {
      // File might not exist yet, ignore
    }
  }

  /**
   * Ensures directory exists
   * @param {string} dirPath - Directory path
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Updates error counts for tracking
   * @param {Error} error - Error to count
   */
  updateErrorCounts(error) {
    const key = `${error.name}:${error.message.substring(0, 50)}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Process remaining queues
    await this.processQueues();

    await this.info('ErrorHandler shutting down');
  }
}

module.exports = { ErrorHandler };