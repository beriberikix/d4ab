/**
 * D4AB Hardware Bridge - Background Service Worker
 * Handles Native Messaging communication and permission management
 */

// Simplified implementation without ES modules for Firefox compatibility

class BackgroundServiceWorker {
  constructor() {
    this.nativePort = null;
    this.pendingNativeRequests = new Map();
    this.nativeMessageId = 0;
    this.isInitialized = false;
    this.connections = new Map(); // Tab ID -> connection info
    this.permissions = new Map(); // `${origin}:${deviceId}` -> Set(capabilities)
    this.permissionStorageKey = 'd4ab_worker_permissions';
    this.contentRequestTimeoutMs = 28000;
    this.nativeRequestTimeoutMs = 20000;
  }

  /**
   * Initializes the service worker
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Set up message handlers
      this.setupMessageHandlers();

      // Restore permission state after service worker restart.
      await this.loadPermissions();

      // Initialize native messaging connection
      await this.initializeNativeMessaging();

      this.isInitialized = true;
      console.log('D4AB Background Service Worker initialized');

    } catch (error) {
      console.error('Service Worker initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initializes native messaging connection
   */
  async initializeNativeMessaging() {
    try {
      console.log('Attempting to connect to native host: com.d4ab.hardware_bridge');

      // Connect to native messaging host
      this.nativePort = chrome.runtime.connectNative('com.d4ab.hardware_bridge');

      // Check immediately for connection errors
      if (chrome.runtime.lastError) {
        console.error('Immediate connection error:', chrome.runtime.lastError.message);
        this.nativePort = null;
        return;
      }

      console.log('Native port created, setting up listeners...');

      this.nativePort.onMessage.addListener((message) => {
        console.log('Received native message:', message);
        this.handleNativeMessage(message);
      });

      this.nativePort.onDisconnect.addListener(() => {
        console.warn('Native messaging disconnected');

        if (chrome.runtime.lastError) {
          console.error('Native messaging error:', chrome.runtime.lastError.message);

          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes('host not found') || errorMsg.includes('No such native application')) {
            console.error('Native messaging host not found. Verify host registration for this browser profile.');
          } else if (errorMsg.includes('failed to start')) {
            console.error('Native messaging host failed to start. Verify dependencies and executable permissions.');
          } else {
            console.error('Unknown native messaging error:', errorMsg);
          }
        } else {
          console.error('Native messaging disconnected without error message');
        }

        this.nativePort = null;
        this.rejectPendingNativeRequests('Native bridge disconnected');
      });

      // Send initialization message
      console.log('Sending initialization message to native host...');
      this.sendNativeMessage({
        jsonrpc: '2.0',
        method: 'heartbeat',
        id: 'init-heartbeat-check'
      });

      console.log('Native messaging initialized');

    } catch (error) {
      console.error('Failed to initialize native messaging:', error);
      this.nativePort = null;
    }
  }

  /**
   * Sends message to native bridge
   */
  sendNativeMessage(message) {
    if (this.nativePort) {
      this.nativePort.postMessage(message);
      return true;
    } else {
      console.error('Native messaging not available');
      return false;
    }
  }

  /**
   * Handles messages from native bridge
   */
  handleNativeMessage(message) {
    console.log('Received from native bridge:', message);

    const { id, method, result, error } = message;

    // Handle responses to our requests
    if (id && this.pendingNativeRequests && this.pendingNativeRequests.has(id)) {
      const pending = this.pendingNativeRequests.get(id);
      this.pendingNativeRequests.delete(id);

      clearTimeout(pending.timeout);

      if (error) {
        pending.reject(new Error(error.message || 'Native bridge error'));
      } else {
        pending.resolve(result);
      }
      return;
    }

    // Handle notifications from native bridge
    if (method) {
      switch (method) {
        case 'device_connected':
          this.broadcastDeviceEvent('connected', message.params);
          break;

        case 'device_disconnected':
          this.broadcastDeviceEvent('disconnected', message.params);
          break;

        case 'device_error':
          this.broadcastDeviceEvent('error', message.params);
          break;

        case 'ready':
          console.log('Native bridge ready:', message.params);
          break;
      }
    }
  }

  /**
   * Rejects all pending native requests with a shared reason.
   * @param {string} reason - Rejection reason
   */
  rejectPendingNativeRequests(reason) {
    for (const [requestId, pending] of this.pendingNativeRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
      this.pendingNativeRequests.delete(requestId);
    }
  }

  /**
   * Sets up Chrome extension message handlers
   */
  setupMessageHandlers() {
    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      let responded = false;
      const responseTimeoutMs = this.getContentRequestTimeoutMs(message);
      const deadline = setTimeout(() => {
        safeSendResponse({
          error: 'Background request timeout',
          code: 'BACKGROUND_TIMEOUT',
          type: message?.type || 'unknown'
        });
      }, responseTimeoutMs);

      const safeSendResponse = (payload) => {
        if (responded) {
          return;
        }

        responded = true;
        clearTimeout(deadline);
        try {
          sendResponse(payload);
        } catch (error) {
          console.error('Failed to send runtime response:', error.message);
        }
      };

      this.handleContentScriptMessage(message, sender, safeSendResponse).catch((error) => {
        console.error('Unhandled content script message error:', error);
        safeSendResponse({
          error: error.message || 'Unhandled content message error',
          code: 'CONTENT_MESSAGE_UNHANDLED'
        });
      });

      return true; // Keep channel open for async response
    });

    // Handle connection from content scripts
    chrome.runtime.onConnect.addListener((port) => {
      this.handlePortConnection(port);
    });

    // Handle tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
      if (changeInfo.status === 'loading') {
        // Clean up any existing connections for this tab
        this.cleanupTabConnection(tabId);
      }
    });

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTabConnection(tabId);
    });
  }

  /**
   * Computes runtime response timeout for a content-script message.
   * Bluetooth requestDevice may perform a second scan attempt and needs a larger budget.
   */
  getContentRequestTimeoutMs(message) {
    const defaultTimeout = this.contentRequestTimeoutMs;

    if (message?.type !== 'DEVICE_REQUEST' || message?.payload?.method !== 'requestDevice') {
      return defaultTimeout;
    }

    const params = message.payload?.params || {};
    if (params.type !== 'bluetooth') {
      return defaultTimeout;
    }

    const requestedScanDuration = Number(params.scanDuration);
    const scanDuration = Number.isFinite(requestedScanDuration)
      ? Math.min(Math.max(requestedScanDuration, 3000), 20000)
      : 10000;

    // First scan + optional retry + small scheduling margin.
    const estimatedBluetoothRequestMs = (scanDuration + 5000) * 2 + 5000;
    return Math.min(Math.max(estimatedBluetoothRequestMs, defaultTimeout), 70000);
  }

  /**
   * Sets up Native Messaging event handlers
   */
  setupNativeMessagingHandlers() {
    console.log('Native messaging handlers setup');
  }

  /**
   * Handles messages from content scripts
   * @param {Object} message - Message from content script
   * @param {Object} sender - Message sender info
   * @param {Function} sendResponse - Response callback
   */
  async handleContentScriptMessage(message, sender, sendResponse) {
    try {
      const { type, payload } = message;

      switch (type) {
        case 'DEVICE_REQUEST':
          await this.handleDeviceRequest(payload, sender, sendResponse);
          break;

        case 'PERMISSION_REQUEST':
          {
            const origin = this.getSenderOrigin(sender);
            const deviceId = payload?.deviceId;
            const capability = payload?.capability || 'read';
            const granted = !!(origin && deviceId && this.hasPermission(origin, deviceId, capability));

          sendResponse({
            granted,
            permission: {
                id: granted ? `perm_${Date.now()}` : null,
                origin,
                deviceId,
                capability
            }
          });
          }
          break;

        case 'API_CALL':
          await this.handleAPICall(payload, sender, sendResponse);
          break;

        case 'HEALTH_CHECK':
          sendResponse({
            status: 'healthy',
            nativeConnected: !!this.nativePort,
            timestamp: new Date().toISOString()
          });
          break;

        default:
          sendResponse({
            error: `Unknown message type: ${type}`
          });
      }
    } catch (error) {
      console.error('Content script message handling error:', error);
      sendResponse({
        error: error.message
      });
    }
  }

  /**
   * Handles device enumeration/discovery requests
   * @param {Object} payload - Request payload
   * @param {Object} sender - Message sender
   * @param {Function} sendResponse - Response callback
   */
  async handleDeviceRequest(payload, sender, sendResponse) {
    const { method, params = {} } = payload;
    const origin = this.getSenderOrigin(sender);

    console.log('D4AB: Handling device request:', method, params);

    try {
      if (method === 'requestDevice') {
        const enumerateParams = this.buildEnumerateParams(params);
        let enumerateResult = await this.sendNativeRequest('enumerate', enumerateParams, origin);
        let selected = this.selectDeviceFromEnumeration(enumerateResult, params);

        // Bluetooth discovery can be bursty; retry once with a broader scan window.
        const shouldRetryBluetoothScan =
          params.type === 'bluetooth' && (enumerateParams.scanDuration || 0) < 12000;

        if (!selected && shouldRetryBluetoothScan) {
          const retryParams = this.buildEnumerateParams({
            ...params,
            includeDisconnected: true,
            scanDuration: Math.max(enumerateParams.scanDuration || 0, 12000)
          });
          enumerateResult = await this.sendNativeRequest('enumerate', retryParams, origin);
          selected = this.selectDeviceFromEnumeration(enumerateResult, params);
        }

        if (!selected) {
          const requestedType = params.type || 'matching';
          const bluetoothHint = requestedType === 'bluetooth'
            ? ' Ensure the device is powered on and in pairing/advertising mode, then retry.'
            : '';
          sendResponse({ error: `No ${requestedType} device found.${bluetoothHint}` });
          return;
        }

        this.grantPermission(origin, selected.id, ['read', 'write', 'control']);

        sendResponse({ device: selected });
        return;
      }

      if (method === 'enumerate' && params.type === 'bluetooth') {
        const enumerateParams = this.buildEnumerateParams(params);
        const result = await this.sendNativeRequest(method, enumerateParams, origin);
        sendResponse(result);
        return;
      }

      const result = await this.sendNativeRequest(method, params, origin);
      sendResponse(result);

    } catch (error) {
      console.error('D4AB: Native bridge failed:', error.message);
      sendResponse(this.createNativeErrorResponse(error, method, params));
    }
  }

  /**
   * Builds native enumerate parameters with safe bounds.
   */
  buildEnumerateParams(requestParams = {}) {
    const type = requestParams.type || 'all';
    const enumerateParams = {
      type,
      includeDisconnected: !!requestParams.includeDisconnected
    };

    if (type === 'bluetooth') {
      const requestedScanDuration = Number(requestParams.scanDuration);
      const scanDuration = Number.isFinite(requestedScanDuration)
        ? Math.min(Math.max(requestedScanDuration, 3000), 20000)
        : 10000;

      const requestedHardTimeout = Number(requestParams.hardTimeoutMs);
      const hardTimeoutMs = Number.isFinite(requestedHardTimeout)
        ? Math.min(Math.max(requestedHardTimeout, scanDuration + 1000), 30000)
        : Math.min(scanDuration + 5000, 30000);

      enumerateParams.scanDuration = scanDuration;
      enumerateParams.hardTimeoutMs = hardTimeoutMs;
    }

    return enumerateParams;
  }

  /**
   * Creates a structured error response for native bridge failures
   */
  createNativeErrorResponse(error, method, params = {}) {
    return {
      error: error.message || 'Native bridge unavailable',
      code: 'NATIVE_BRIDGE_ERROR',
      method,
      params
    };
  }

  getSenderOrigin(sender) {
    try {
      if (!sender?.url) return 'unknown';
      return new URL(sender.url).origin;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Selects a device using request filters from an enumerate response.
   */
  selectDeviceFromEnumeration(enumerateResult, requestParams = {}) {
    const devices = Array.isArray(enumerateResult?.devices) ? enumerateResult.devices : [];
    if (devices.length === 0) {
      return null;
    }

    const expectedType = requestParams.type;
    const typedDevices = expectedType ? devices.filter((device) => device.type === expectedType) : devices;
    if (typedDevices.length === 0) {
      return null;
    }

    const filters = Array.isArray(requestParams.filters) ? requestParams.filters : [];
    if (filters.length === 0) {
      return typedDevices[0];
    }

    return typedDevices.find((device) => {
      return filters.some((filter) => {
        return this.matchesDeviceFilter(device, filter);
      });
    }) || null;
  }

  /**
   * Matches a device against a request filter used by requestDevice.
   */
  matchesDeviceFilter(device, filter = {}) {
    if (filter.vendorId !== undefined && filter.vendorId !== device.vendorId) {
      return false;
    }

    if (filter.productId !== undefined && filter.productId !== device.productId) {
      return false;
    }

    if (filter.deviceId !== undefined && filter.deviceId !== device.id) {
      return false;
    }

    if (filter.serialNumber !== undefined && filter.serialNumber !== device.serialNumber) {
      return false;
    }

    if (filter.name !== undefined && filter.name !== device.name) {
      return false;
    }

    if (filter.namePrefix !== undefined) {
      if (typeof device.name !== 'string' || !device.name.startsWith(filter.namePrefix)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sends request to native bridge and waits for response
   */
  async sendNativeRequest(method, params, origin = 'extension') {
    return new Promise((resolve, reject) => {
      if (!this.nativePort) {
        // Try to reconnect once
        this.initializeNativeMessaging().then(() => {
          if (!this.nativePort) {
            reject(new Error('Native bridge not connected and reconnection failed'));
            return;
          }
          // Retry the request
          this._sendNativeRequestInternal(method, params, origin, resolve, reject);
        }).catch(() => {
          reject(new Error('Native bridge not connected and reconnection failed'));
        });
        return;
      }

      this._sendNativeRequestInternal(method, params, origin, resolve, reject);
    });
  }

  /**
   * Internal method to send native request
   */
  _sendNativeRequestInternal(method, params, origin, resolve, reject) {
    const requestId = `bg_${++this.nativeMessageId}`;
    const timeout = setTimeout(() => {
      this.pendingNativeRequests.delete(requestId);
      reject(new Error('Native request timeout'));
    }, this.nativeRequestTimeoutMs);

    this.pendingNativeRequests.set(requestId, { resolve, reject, timeout });

    const message = {
      jsonrpc: '2.0',
      method,
      params,
      origin,
      id: requestId
    };

    const sent = this.sendNativeMessage(message);
    if (!sent) {
      clearTimeout(timeout);
      this.pendingNativeRequests.delete(requestId);
      reject(new Error('Native bridge unavailable'));
    }
  }

  /**
   * Handles API calls that require device communication
   * @param {Object} payload - API call data
   * @param {Object} sender - Message sender
   * @param {Function} sendResponse - Response callback
   */
  async handleAPICall(payload, sender, sendResponse) {
    const { method, params, deviceId } = payload;

    console.log('D4AB: Handling API call:', method, params, deviceId);

    try {
      const origin = this.getSenderOrigin(sender);
      const requiredCapability = this.getRequiredCapability(method);
      if (!this.hasPermission(origin, deviceId, requiredCapability)) {
        sendResponse({
          error: `Permission denied for ${requiredCapability} on device ${deviceId}`,
          code: 'PERMISSION_DENIED',
          method,
          deviceId
        });
        return;
      }

      // These calls configure WebUSB client-side state and are no-ops for the native bridge.
      if (method === 'selectConfiguration' || method === 'claimInterface') {
        sendResponse({ success: true });
        return;
      }

      const normalizedRequest = this.normalizeAPICall(method, params || {});
      const nativeParams = { ...normalizedRequest.params, deviceId };

      const result = await this.sendNativeRequest(normalizedRequest.method, nativeParams, origin);
      sendResponse(this.normalizeAPIResponse(method, result));

    } catch (error) {
      console.error('D4AB: Native bridge failed for API call:', error.message);
      sendResponse(this.createNativeErrorResponse(error, method, { ...(params || {}), deviceId }));
    }
  }

  /**
   * Maps frontend API calls to backend bridge methods and payload shape
   */
  normalizeAPICall(method, params) {
    switch (method) {
      case 'open':
        return { method: 'connect', params };
      case 'close':
        return { method: 'disconnect', params };
      case 'transferOut':
      case 'controlTransferOut':
      case 'write':
        return {
          method: 'write',
          params: {
            ...params,
            data: this.encodeDataToBase64(params.data || [])
          }
        };
      case 'transferIn':
      case 'controlTransferIn':
      case 'read':
        return { method: 'read', params };
      default:
        return { method, params };
    }
  }

  /**
   * Normalizes backend responses into frontend-friendly shape
   */
  normalizeAPIResponse(originalMethod, result) {
    if (originalMethod === 'transferIn' || originalMethod === 'controlTransferIn' || originalMethod === 'read') {
      const bytes = this.decodeBase64ToArray(result?.data);
      return {
        ...result,
        data: bytes,
        bytesRead: result?.bytesRead ?? bytes.length
      };
    }

    return result;
  }

  encodeDataToBase64(data) {
    if (typeof data === 'string') {
      return data;
    }

    if (!Array.isArray(data)) {
      data = [];
    }

    const byteArray = Uint8Array.from(data);
    let binary = '';
    for (let i = 0; i < byteArray.length; i++) {
      binary += String.fromCharCode(byteArray[i]);
    }
    return btoa(binary);
  }

  decodeBase64ToArray(base64Data) {
    if (!base64Data || typeof base64Data !== 'string') {
      return [];
    }

    try {
      const binary = atob(base64Data);
      const bytes = new Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      console.warn('Failed to decode base64 native response:', error.message);
      return [];
    }
  }

  /**
   * Handles port connections from content scripts
   * @param {Object} port - Chrome runtime port
   */
  handlePortConnection(port) {
    if (port.name === 'd4ab-hardware-bridge') {
      const tabId = port.sender.tab?.id;

      if (tabId) {
        // Store connection info
        this.connections.set(tabId, {
          port,
          origin: this.getSenderOrigin(port.sender),
          connected: true,
          lastActivity: new Date()
        });

        // Handle port disconnect
        port.onDisconnect.addListener(() => {
          this.cleanupTabConnection(tabId);
        });

        // Handle port messages
        port.onMessage.addListener((message) => {
          this.handlePortMessage(message, tabId);
        });
      }
    }
  }

  /**
   * Handles messages from port connections
   * @param {Object} message - Port message
   * @param {number} tabId - Tab ID
   */
  handlePortMessage(message, tabId) {
    const connection = this.connections.get(tabId);
    if (!connection) return;

    connection.lastActivity = new Date();

    // Handle different message types
    switch (message.type) {
      case 'KEEP_ALIVE':
        connection.port.postMessage({ type: 'PONG' });
        break;

      case 'DEVICE_EVENT':
        // Forward device events to other tabs if needed
        this.broadcastDeviceEvent(message.payload, tabId);
        break;
    }
  }

  /**
   * Broadcasts device events to connected tabs
   * @param {string} event - Event type
   * @param {Object} data - Event data
   * @param {number} excludeTabId - Tab to exclude from broadcast
   */
  broadcastDeviceEvent(event, data, excludeTabId = null) {
    for (const [tabId, connection] of this.connections) {
      if (tabId !== excludeTabId && connection.connected) {
        connection.port.postMessage({
          type: 'DEVICE_EVENT',
          event,
          data
        });
      }
    }
  }

  /**
   * Cleans up connection for a tab
   * @param {number} tabId - Tab ID to clean up
   */
  cleanupTabConnection(tabId) {
    const connection = this.connections.get(tabId);
    if (connection) {
      connection.connected = false;
      this.connections.delete(tabId);
    }
  }

  /**
   * Gets required capability for API method
   * @param {string} method - API method name
   * @returns {string} Required capability
   */
  getRequiredCapability(method) {
    switch (method) {
      case 'read':
        return 'read';
      case 'write':
        return 'write';
      case 'connect':
      case 'disconnect':
        return 'control';
      default:
        return 'read';
    }
  }

  getPermissionKey(origin, deviceId) {
    return `${origin}:${deviceId}`;
  }

  grantPermission(origin, deviceId, capabilities = ['read']) {
    if (!origin || !deviceId) return;

    const key = this.getPermissionKey(origin, deviceId);
    this.permissions.set(key, new Set(capabilities));
    this.savePermissions();
  }

  hasPermission(origin, deviceId, capability) {
    if (!origin || !deviceId) {
      return false;
    }

    const key = this.getPermissionKey(origin, deviceId);
    const capabilities = this.permissions.get(key);
    return !!(capabilities && capabilities.has(capability));
  }

  async loadPermissions() {
    try {
      const result = await chrome.storage.local.get(this.permissionStorageKey);
      const serialized = result?.[this.permissionStorageKey] || {};

      this.permissions.clear();
      for (const [key, capabilities] of Object.entries(serialized)) {
        if (Array.isArray(capabilities) && capabilities.length > 0) {
          this.permissions.set(key, new Set(capabilities));
        }
      }
    } catch (error) {
      console.warn('Failed to load worker permissions:', error.message);
    }
  }

  async savePermissions() {
    try {
      const serialized = {};
      for (const [key, capabilities] of this.permissions.entries()) {
        serialized[key] = Array.from(capabilities);
      }

      await chrome.storage.local.set({
        [this.permissionStorageKey]: serialized
      });
    } catch (error) {
      console.warn('Failed to persist worker permissions:', error.message);
    }
  }
}

// Initialize service worker when script loads
const serviceWorker = new BackgroundServiceWorker();

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  serviceWorker.initialize();
});

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  serviceWorker.initialize();
});

// Initialize immediately if service worker is already running
serviceWorker.initialize();

// No exports needed for basic implementation