/**
 * Native Messaging Service
 * Handles communication between browser extension and native bridge
 */

import { SecurityContext } from '../models/security_context.js';

export class NativeMessaging {
  constructor() {
    this.port = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 10000;
    this.maxQueueSize = 200;
    this.maxPendingRequests = 500;
    this.maxMessageBytes = 1024 * 1024; // 1 MiB
    this.requestTimeoutMs = 10000;
    this.messageQueue = [];
    this.pendingRequests = new Map();
    this.eventListeners = new Map();
    this.securityContext = null;
    this.heartbeatInterval = null;
    this.heartbeatTimeout = 30000; // 30 seconds
  }

  /**
   * Connects to the native bridge application
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) return;

    try {
      // Initialize security context
      this.securityContext = SecurityContext.create(
        chrome.runtime.id,
        `extension_${Date.now()}`
      );

      // Connect to native application
      this.port = chrome.runtime.connectNative('com.d4ab.hardware_bridge');

      if (!this.port) {
        throw new Error('Failed to connect to native bridge');
      }

      this.setupPortHandlers();
      this.connected = true;
      this.reconnectAttempts = 0;

      // Start heartbeat monitoring
      this.startHeartbeat();

      // Process queued messages
      await this.processMessageQueue();

      this.emit('connected');

    } catch (error) {
      console.error('Native Messaging connection failed:', error);
      await this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Disconnects from the native bridge
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.connected) return;

    this.stopHeartbeat();
    this.connected = false;

    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }

    // Clear pending requests
    for (const [, request] of this.pendingRequests) {
      request.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    this.emit('disconnected');
  }

  /**
   * Sets up port event handlers
   */
  setupPortHandlers() {
    this.port.onMessage.addListener((message) => {
      this.handleMessage(message);
    });

    this.port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      console.warn('Native bridge disconnected:', error?.message || 'Unknown reason');

      this.connected = false;
      this.port = null;

      // Attempt reconnection
      this.attemptReconnection();

      this.emit('disconnect', error);
    });
  }

  /**
   * Handles incoming messages from native bridge
   * @param {Object} message - Received message
   */
  handleMessage(message) {
    try {
      // Update security context
      if (this.securityContext) {
        this.securityContext.recordReceived();
      }

      // Handle responses to pending requests
      if (message.id && this.pendingRequests.has(message.id)) {
        const request = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          request.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          request.resolve(message.result || message);
        }
        return;
      }

      // Handle notifications and events
      if (message.method) {
        switch (message.method) {
          case 'ready':
            this.handleReadyMessage(message);
            break;

          case 'device_connected':
          case 'device_disconnected':
          case 'device_error':
            this.emit('device_event', {
              type: message.method,
              data: message.params
            });
            break;

          default:
            this.emit('notification', message);
        }
      }

    } catch (error) {
      console.error('Message handling error:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handles ready message from native bridge
   * @param {Object} message - Ready message
   */
  handleReadyMessage(message) {
    const capabilities = message.params?.capabilities || [];
    const version = message.params?.version;

    this.emit('ready', {
      capabilities,
      version,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Sends a message to the native bridge
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from native bridge
   */
  async sendMessage(message) {
    if (!this.connected) {
      throw new Error('Not connected to native bridge');
    }

    if (this.pendingRequests.size >= this.maxPendingRequests) {
      throw new Error('Too many in-flight requests');
    }

    // Generate unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const request = {
      jsonrpc: '2.0',
      method: message.method,
      params: message.params || {},
      id: requestId
    };

    this.validateMessageSize(request);

    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set timeout for request
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, this.requestTimeoutMs);

      // Clear timeout when request completes
      const originalResolve = resolve;
      const originalReject = reject;

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          originalResolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        }
      });

      try {
        // Update security context
        if (this.securityContext) {
          this.securityContext.recordActivity();
        }

        // Send message
        this.port.postMessage(request);

      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  /**
   * Attempts to reconnect to native bridge
   */
  async attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Maximum reconnection attempts exceeded'));
      return;
    }

    this.reconnectAttempts++;
    const exponentialDelay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitter = Math.floor(Math.random() * 250);
    const retryDelay = exponentialDelay + jitter;

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.attemptReconnection();
      }
    }, retryDelay);
  }

  /**
   * Handles connection errors
   * @param {Error} error - Connection error
   */
  async handleConnectionError(error) {
    this.emit('error', error);

    // Queue any pending messages for retry
    if (this.messageQueue.length === 0) {
      return;
    }

    // Attempt reconnection for certain error types
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('not found') || errorMessage.includes('permission')) {
      // Don't retry for missing bridge or permission errors
      return;
    }

    this.attemptReconnection();
  }

  /**
   * Processes queued messages after connection
   */
  async processMessageQueue() {
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const queuedMessage of queue) {
      try {
        const response = await this.sendMessage(queuedMessage.message);
        queuedMessage.resolve(response);
      } catch (error) {
        queuedMessage.reject(error);
      }
    }
  }

  /**
   * Starts heartbeat monitoring
   */
  startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.sendMessage({
          method: 'heartbeat',
          params: {
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.warn('Heartbeat failed:', error);
        // Connection will be handled by disconnect event
      }
    }, this.heartbeatTimeout);
  }

  /**
   * Stops heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Checks if connected to native bridge
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected && this.port !== null;
  }

  /**
   * Gets connection statistics
   * @returns {Object} Connection stats
   */
  getConnectionStats() {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size,
      queuedMessages: this.messageQueue.length,
      securityContext: this.securityContext?.toJSON() || null
    };
  }

  /**
   * Event listener management
   */
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  off(event, listener) {
    if (!this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event);
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event);
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    }
  }

  /**
   * Queues a message for sending when connected
   * @param {Object} message - Message to queue
   * @returns {Promise<Object>} Promise that resolves when message is sent
   */
  queueMessage(message) {
    return new Promise((resolve, reject) => {
      if (this.messageQueue.length >= this.maxQueueSize) {
        reject(new Error('Message queue is full'));
        return;
      }

      this.messageQueue.push({
        message,
        resolve,
        reject,
        timestamp: new Date()
      });

      // Attempt connection if not connected
      if (!this.connected) {
        this.connect().catch(reject);
      }
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.stopHeartbeat();
    await this.disconnect();
    this.eventListeners.clear();
    this.messageQueue = [];
  }

  /**
   * Validates message size to avoid unbounded memory and oversized native payloads.
   * @param {Object} request - JSON-RPC request body
   */
  validateMessageSize(request) {
    const size = new TextEncoder().encode(JSON.stringify(request)).length;
    if (size > this.maxMessageBytes) {
      throw new Error(`Request payload too large (${size} bytes)`);
    }
  }
}