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
    this.nativeRequestMeta = new Map();
    this.isInitialized = false;
    this.connections = new Map(); // Tab ID -> connection info
    this.permissions = new Map(); // `${origin}:${deviceId}` -> Set(capabilities)
    this.permissionMeta = new Map();
    this.permissionStorageKey = 'd4ab_worker_permissions';
    this.permissionMetaStorageKey = 'd4ab_worker_permission_meta';
    this.telemetryStorageKey = 'd4ab_worker_telemetry';
    this.telemetryLimit = 300;
    this.telemetry = [];
    this.chooserRequests = new Map();
    this.chooserScopeToRequest = new Map();
    this.chooserWindowToRequest = new Map();
    this.chooserTimeoutMs = 180000;
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
      await this.loadPermissionMeta();
      await this.loadTelemetry();

      // Initialize native messaging connection
      await this.initializeNativeMessaging();

      this.isInitialized = true;
      this.recordTelemetry('info', 'worker', 'Background worker initialized', {
        nativeConnected: !!this.nativePort
      });
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
        this.recordTelemetry('warn', 'native', 'Native messaging disconnected');
      });

      // Send initialization message
      console.log('Sending initialization message to native host...');
      this.sendNativeMessage({
        jsonrpc: '2.0',
        method: 'heartbeat',
        id: 'init-heartbeat-check'
      });

      console.log('Native messaging initialized');
      this.recordTelemetry('info', 'native', 'Native messaging initialized');

    } catch (error) {
      console.error('Failed to initialize native messaging:', error);
      this.nativePort = null;
      this.recordTelemetry('error', 'native', 'Failed to initialize native messaging', {
        error: error.message
      });
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
      const requestMeta = this.nativeRequestMeta.get(id);
      this.pendingNativeRequests.delete(id);
      this.nativeRequestMeta.delete(id);

      clearTimeout(pending.timeout);

      if (requestMeta) {
        this.recordTelemetry(error ? 'error' : 'info', 'native', 'Native request settled', {
          requestId: id,
          method: requestMeta.method,
          durationMs: Date.now() - requestMeta.startedAt,
          origin: requestMeta.origin,
          success: !error
        });
      }

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
          this.recordTelemetry('info', 'device', 'Device connected', message.params);
          this.showDeviceNotification('Device connected', message.params);
          break;

        case 'device_disconnected':
          this.broadcastDeviceEvent('disconnected', message.params);
          this.recordTelemetry('warn', 'device', 'Device disconnected', message.params);
          this.showDeviceNotification('Device disconnected', message.params);
          break;

        case 'device_error':
          this.broadcastDeviceEvent('error', message.params);
          this.recordTelemetry('error', 'device', 'Device error', message.params);
          this.showDeviceNotification('Device error', message.params);
          break;

        case 'ready':
          console.log('Native bridge ready:', message.params);
          this.recordTelemetry('info', 'native', 'Native bridge ready', message.params);
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
      this.nativeRequestMeta.delete(requestId);
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

    if (chrome.windows && chrome.windows.onRemoved) {
      chrome.windows.onRemoved.addListener((windowId) => {
        this.handleChooserWindowClosed(windowId);
      });
    }
  }

  /**
   * Computes runtime response timeout for a content-script message.
   * Bluetooth requestDevice may perform a second scan attempt and needs a larger budget.
   */
  getContentRequestTimeoutMs(message) {
    const defaultTimeout = this.contentRequestTimeoutMs;

    const isRequestDevice =
      message?.type === 'DEVICE_REQUEST' &&
      message?.payload?.method === 'requestDevice';

    if (isRequestDevice) {
      return Math.max(defaultTimeout, this.chooserTimeoutMs + 10000);
    }

    const isBluetoothRequestDevice =
      message?.type === 'DEVICE_REQUEST' &&
      message?.payload?.method === 'requestDevice' &&
      message?.payload?.params?.type === 'bluetooth';

    const isBluetoothUIEnumerate =
      message?.type === 'UI_ENUMERATE' &&
      message?.payload?.type === 'bluetooth';

    if (!isBluetoothRequestDevice && !isBluetoothUIEnumerate) {
      return defaultTimeout;
    }

    const params = message.payload?.params || message.payload || {};

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

        case 'UI_GET_STATE':
          sendResponse({ state: this.getUIState() });
          break;

        case 'UI_GET_LOGS':
          sendResponse({ logs: this.getTelemetryLogs() });
          break;

        case 'UI_CLEAR_LOGS':
          await this.clearTelemetryLogs();
          sendResponse({ success: true });
          break;

        case 'UI_PERMISSION_LIST':
          sendResponse({ permissions: this.listPermissionsSnapshot() });
          break;

        case 'UI_PERMISSION_REVOKE':
          await this.handleUIPermissionRevoke(payload, sendResponse);
          break;

        case 'UI_ENUMERATE':
          await this.handleUIEnumerate(payload, sender, sendResponse);
          break;

        case 'UI_SELECT_DEVICE':
          await this.handleUISelectDevice(payload, sender, sendResponse);
          break;

        case 'UI_GET_CHOOSER_CONTEXT':
          await this.handleUIGetChooserContext(payload, sendResponse);
          break;

        case 'UI_CANCEL_CHOOSER':
          await this.handleUICancelChooser(payload, sendResponse);
          break;

        case 'UI_API_CALL':
          await this.handleUIAPICall(payload, sender, sendResponse);
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
        const selected = await this.handleChooserDeviceRequest(origin, params, sender);
        this.grantPermission(origin, selected.id, ['read', 'write', 'control']);
        this.recordTelemetry('info', 'request', 'requestDevice resolved', {
          origin,
          type: params.type,
          deviceId: selected.id,
          via: 'chooser-ui'
        });

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
      const isChooserFlow = method === 'requestDevice';
      const looksUserAbort = /cancel|timed out/i.test(error.message || '');

      if (isChooserFlow && looksUserAbort) {
        this.recordTelemetry('warn', 'chooser', 'requestDevice aborted', {
          method,
          type: params.type,
          error: error.message
        });
        sendResponse({
          error: error.message,
          code: 'REQUEST_ABORTED',
          method,
          params
        });
        return;
      }

      console.error('D4AB: Native bridge failed:', error.message);
      this.recordTelemetry('error', 'request', 'Native bridge request failed', {
        method,
        type: params.type,
        error: error.message
      });
      sendResponse(this.createNativeErrorResponse(error, method, params));
    }
  }

  async handleChooserDeviceRequest(origin, params = {}, sender = {}) {
    const scopeKey = this.getChooserScopeKey(origin, params, sender);
    const existingChooserId = this.chooserScopeToRequest.get(scopeKey);
    const existingRequest = existingChooserId ? this.chooserRequests.get(existingChooserId) : null;

    if (existingRequest) {
      this.focusChooserRequest(existingRequest);
      this.recordTelemetry('info', 'chooser', 'Chooser reused for repeated request', {
        chooserId: existingRequest.id,
        scopeKey,
        origin,
        type: params.type || 'all'
      });

      return new Promise((resolve, reject) => {
        existingRequest.waiters.push({ resolve, reject });
      });
    }

    if (existingChooserId && !existingRequest) {
      this.chooserScopeToRequest.delete(scopeKey);
    }

    const chooserId = `chooser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectChooserRequest(chooserId, new Error('Device chooser timed out'));
      }, this.chooserTimeoutMs);

      this.chooserRequests.set(chooserId, {
        id: chooserId,
        origin,
        params,
        scopeKey,
        createdAt: Date.now(),
        timeout,
        waiters: [{ resolve, reject }],
        windowId: null
      });
      this.chooserScopeToRequest.set(scopeKey, chooserId);

      this.recordTelemetry('info', 'chooser', 'Chooser opened', {
        chooserId,
        scopeKey,
        origin,
        type: params.type || 'all'
      });

      this.openChooserWindow(chooserId, origin, params).catch((error) => {
        this.rejectChooserRequest(chooserId, error);
      });
    });
  }

  getChooserScopeKey(origin, params = {}, sender = {}) {
    const tabId = sender?.tab?.id;
    const scopeTab = Number.isInteger(tabId) ? String(tabId) : 'global';
    const type = params?.type || 'all';
    return `${scopeTab}|${origin}|${type}`;
  }

  focusChooserRequest(request) {
    if (!request || request.windowId === null || request.windowId === undefined) {
      return;
    }

    if (!chrome.windows || typeof chrome.windows.update !== 'function') {
      return;
    }

    chrome.windows.update(request.windowId, { focused: true }, () => {
      void chrome.runtime.lastError;
    });
  }

  async openChooserWindow(chooserId, origin, params = {}) {
    const query = new URLSearchParams({
      chooserId,
      type: params.type || 'all',
      origin
    });

    if (Array.isArray(params.filters) && params.filters.length > 0) {
      query.set('filters', JSON.stringify(params.filters));
    }

    if (params.acceptAllDevices === true) {
      query.set('acceptAllDevices', '1');
    }

    if (Array.isArray(params.optionalServices) && params.optionalServices.length > 0) {
      query.set('optionalServices', JSON.stringify(params.optionalServices));
    }

    if (params.scanDuration !== undefined) {
      query.set('scanDuration', String(params.scanDuration));
    }

    const chooserUrl = chrome.runtime.getURL(`src/ui/device_center.html?${query.toString()}`);

    const request = this.chooserRequests.get(chooserId);
    if (!request) {
      throw new Error('Chooser request no longer available');
    }

    if (chrome.windows && typeof chrome.windows.create === 'function') {
      const createdWindow = await new Promise((resolve, reject) => {
        chrome.windows.create({
          url: chooserUrl,
          type: 'popup',
          width: 560,
          height: 780,
          focused: true
        }, (windowInfo) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(windowInfo);
        });
      });

      if (createdWindow && createdWindow.id !== undefined && createdWindow.id !== null) {
        request.windowId = createdWindow.id;
        this.chooserWindowToRequest.set(createdWindow.id, chooserId);
      }
      return;
    }

    await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: chooserUrl }, (_tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  handleChooserWindowClosed(windowId) {
    const chooserId = this.chooserWindowToRequest.get(windowId);
    if (!chooserId) {
      return;
    }

    this.rejectChooserRequest(chooserId, new Error('User cancelled device selection'));
  }

  async handleUIGetChooserContext(payload = {}, sendResponse) {
    const chooserId = payload.chooserId;
    if (!chooserId) {
      sendResponse({ error: 'chooserId is required', code: 'INVALID_REQUEST' });
      return;
    }

    const request = this.chooserRequests.get(chooserId);
    if (!request) {
      sendResponse({ error: 'Chooser request not found', code: 'CHOOSER_NOT_FOUND' });
      return;
    }

    sendResponse({
      chooser: {
        chooserId: request.id,
        origin: request.origin,
        params: request.params,
        createdAt: new Date(request.createdAt).toISOString(),
        pending: true
      }
    });
  }

  async handleUICancelChooser(payload = {}, sendResponse) {
    const chooserId = payload.chooserId;
    if (!chooserId) {
      sendResponse({ error: 'chooserId is required', code: 'INVALID_REQUEST' });
      return;
    }

    const cancelled = this.rejectChooserRequest(
      chooserId,
      new Error(payload.reason || 'User cancelled device selection')
    );

    sendResponse({ cancelled });
  }

  resolveChooserRequest(chooserId, device) {
    const request = this.chooserRequests.get(chooserId);
    if (!request) {
      return false;
    }

    clearTimeout(request.timeout);
    this.chooserRequests.delete(chooserId);
    if (request.scopeKey) {
      this.chooserScopeToRequest.delete(request.scopeKey);
    }
    if (request.windowId !== null && request.windowId !== undefined) {
      this.chooserWindowToRequest.delete(request.windowId);
      this.closeChooserWindow(request.windowId);
    }

    for (const waiter of request.waiters || []) {
      waiter.resolve(device);
    }
    this.recordTelemetry('info', 'chooser', 'Chooser request resolved', {
      chooserId,
      origin: request.origin,
      deviceId: device.id,
      type: device.type
    });
    return true;
  }

  rejectChooserRequest(chooserId, error) {
    const request = this.chooserRequests.get(chooserId);
    if (!request) {
      return false;
    }

    clearTimeout(request.timeout);
    this.chooserRequests.delete(chooserId);
    if (request.scopeKey) {
      this.chooserScopeToRequest.delete(request.scopeKey);
    }
    if (request.windowId !== null && request.windowId !== undefined) {
      this.chooserWindowToRequest.delete(request.windowId);
      this.closeChooserWindow(request.windowId);
    }

    for (const waiter of request.waiters || []) {
      waiter.reject(error);
    }
    this.recordTelemetry('warn', 'chooser', 'Chooser request rejected', {
      chooserId,
      origin: request.origin,
      error: error.message
    });
    return true;
  }

  closeChooserWindow(windowId) {
    if (!chrome.windows || typeof chrome.windows.remove !== 'function') {
      return;
    }

    try {
      chrome.windows.remove(windowId, () => {
        void chrome.runtime.lastError;
      });
    } catch (error) {
      void error;
    }
  }

  async handleUIEnumerate(payload = {}, sender, sendResponse) {
    const origin = this.getSenderOrigin(sender);
    const chooserRequest = payload.chooserId ? this.chooserRequests.get(payload.chooserId) : null;
    if (payload.chooserId && !chooserRequest) {
      sendResponse({ error: 'Chooser request is no longer active', code: 'CHOOSER_NOT_FOUND' });
      return;
    }

    const type = chooserRequest?.params?.type || payload.type || 'all';
    const params = this.buildEnumerateParams({
      type,
      includeDisconnected: payload.includeDisconnected,
      scanDuration: payload.scanDuration,
      hardTimeoutMs: payload.hardTimeoutMs
    });

    try {
      const result = await this.sendNativeRequest('enumerate', params, origin);
      const devices = Array.isArray(result?.devices) ? result.devices : [];

      this.recordTelemetry('info', 'ui', 'UI enumerate completed', {
        type,
        count: devices.length
      });

      sendResponse({
        devices,
        metadata: result?.metadata || null
      });
    } catch (error) {
      this.recordTelemetry('error', 'ui', 'UI enumerate failed', {
        type,
        error: error.message
      });
      sendResponse({
        error: error.message,
        code: 'UI_ENUMERATE_FAILED'
      });
    }
  }

  async handleUISelectDevice(payload = {}, sender, sendResponse) {
    const origin = this.getSenderOrigin(sender);
    const chooserRequest = payload.chooserId ? this.chooserRequests.get(payload.chooserId) : null;
    if (payload.chooserId && !chooserRequest) {
      sendResponse({ error: 'Chooser request is no longer active', code: 'CHOOSER_NOT_FOUND' });
      return;
    }

    const targetOrigin = chooserRequest?.origin || payload.targetOrigin;
    const deviceId = payload.deviceId;
    const type = chooserRequest?.params?.type || payload.type || 'all';
    const capabilities = Array.isArray(payload.capabilities) && payload.capabilities.length > 0
      ? payload.capabilities
      : ['read', 'write', 'control'];

    if (!deviceId) {
      sendResponse({ error: 'deviceId is required', code: 'INVALID_REQUEST' });
      return;
    }

    try {
      const result = await this.sendNativeRequest('enumerate', this.buildEnumerateParams({
        type,
        includeDisconnected: true,
        scanDuration: payload.scanDuration,
        hardTimeoutMs: payload.hardTimeoutMs
      }), origin);

      const devices = Array.isArray(result?.devices) ? result.devices : [];
      const selected = devices.find((device) => device.id === deviceId);

      if (!selected) {
        sendResponse({ error: `Device ${deviceId} not found`, code: 'DEVICE_NOT_FOUND' });
        return;
      }

      const filters = Array.isArray(chooserRequest?.params?.filters)
        ? chooserRequest.params.filters
        : [];
      if (filters.length > 0) {
        const matches = filters.some((filter) => this.matchesDeviceFilter(selected, filter));
        if (!matches) {
          sendResponse({
            error: 'Selected device does not match requested filters',
            code: 'FILTER_MISMATCH'
          });
          return;
        }
      }

      this.grantPermission(origin, selected.id, capabilities);
      if (targetOrigin && targetOrigin !== origin) {
        this.grantPermission(targetOrigin, selected.id, capabilities);
      }

      this.recordTelemetry('info', 'ui', 'UI selected device', {
        origin,
        targetOrigin,
        type: selected.type,
        deviceId: selected.id,
        chooserId: payload.chooserId || null
      });

      if (payload.chooserId) {
        const resolved = this.resolveChooserRequest(payload.chooserId, selected);
        if (!resolved) {
          sendResponse({ error: 'Chooser request is no longer active', code: 'CHOOSER_NOT_FOUND' });
          return;
        }
      }

      sendResponse({
        device: selected,
        granted: true,
        fulfilledChooser: !!payload.chooserId
      });
    } catch (error) {
      this.recordTelemetry('error', 'ui', 'UI select device failed', {
        deviceId,
        error: error.message
      });
      sendResponse({ error: error.message, code: 'UI_SELECT_DEVICE_FAILED' });
    }
  }

  async handleUIAPICall(payload = {}, sender, sendResponse) {
    const origin = this.getSenderOrigin(sender);
    const method = payload.method;
    const params = payload.params || {};
    const deviceId = payload.deviceId;

    if (!method || !deviceId) {
      sendResponse({
        error: 'method and deviceId are required',
        code: 'INVALID_REQUEST'
      });
      return;
    }

    try {
      const capability = this.getRequiredCapability(method);
      if (!this.hasPermission(origin, deviceId, capability)) {
        this.grantPermission(origin, deviceId, ['read', 'write', 'control']);
      }

      // These calls configure WebUSB client-side state and are no-ops for the native bridge.
      if (method === 'selectConfiguration' || method === 'claimInterface') {
        sendResponse({ success: true });
        return;
      }

      const normalizedRequest = this.normalizeAPICall(method, params);
      const nativeParams = { ...normalizedRequest.params, deviceId };
      const result = await this.sendNativeRequest(normalizedRequest.method, nativeParams, origin);

      this.recordTelemetry('info', 'ui', 'UI API call completed', {
        method,
        deviceId
      });

      sendResponse(this.normalizeAPIResponse(method, result));
    } catch (error) {
      this.recordTelemetry('error', 'ui', 'UI API call failed', {
        method,
        deviceId,
        error: error.message
      });
      sendResponse(this.createNativeErrorResponse(error, method, { ...params, deviceId }));
    }
  }

  async handleUIPermissionRevoke(payload = {}, sendResponse) {
    const key = payload.key || this.getPermissionKey(payload.origin, payload.deviceId);
    if (!key) {
      sendResponse({ error: 'key or origin/deviceId are required', code: 'INVALID_REQUEST' });
      return;
    }

    const permissionMeta = this.permissionMeta.get(key);
    const revoked = this.permissions.delete(key);
    this.permissionMeta.delete(key);
    await this.savePermissions();
    await this.savePermissionMeta();

    if (revoked) {
      this.recordTelemetry('info', 'permission', 'Permission revoked from UI', {
        key,
        origin: permissionMeta?.origin || payload.origin || null,
        deviceId: permissionMeta?.deviceId || payload.deviceId || null
      });
    }

    sendResponse({ revoked });
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

    if (filter.usbVendorId !== undefined && filter.usbVendorId !== device.vendorId) {
      return false;
    }

    if (filter.productId !== undefined && filter.productId !== device.productId) {
      return false;
    }

    if (filter.usbProductId !== undefined && filter.usbProductId !== device.productId) {
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

    if (Array.isArray(filter.services) && filter.services.length > 0) {
      const deviceUuids = Array.isArray(device.uuids) ? device.uuids.map((item) => String(item).toLowerCase()) : [];
      const hasAllServices = filter.services.every((service) => {
        return deviceUuids.includes(String(service).toLowerCase());
      });

      if (!hasAllServices) {
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
    const startedAt = Date.now();
    const timeout = setTimeout(() => {
      this.pendingNativeRequests.delete(requestId);
      this.nativeRequestMeta.delete(requestId);
      this.recordTelemetry('error', 'native', 'Native request timeout', {
        requestId,
        method,
        origin,
        durationMs: Date.now() - startedAt
      });
      reject(new Error('Native request timeout'));
    }, this.nativeRequestTimeoutMs);

    this.pendingNativeRequests.set(requestId, { resolve, reject, timeout });
    this.nativeRequestMeta.set(requestId, {
      method,
      origin,
      startedAt
    });

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
      this.nativeRequestMeta.delete(requestId);
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
    this.permissionMeta.set(key, { origin, deviceId });
    this.savePermissions();
    this.savePermissionMeta();
    this.recordTelemetry('info', 'permission', 'Permission granted', {
      origin,
      deviceId,
      capabilities
    });
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

  async loadPermissionMeta() {
    try {
      const result = await chrome.storage.local.get(this.permissionMetaStorageKey);
      const serialized = result?.[this.permissionMetaStorageKey] || {};

      this.permissionMeta.clear();
      for (const [key, value] of Object.entries(serialized)) {
        if (value && typeof value.origin === 'string' && typeof value.deviceId === 'string') {
          this.permissionMeta.set(key, {
            origin: value.origin,
            deviceId: value.deviceId
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load worker permission metadata:', error.message);
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

  async savePermissionMeta() {
    try {
      const serialized = {};
      for (const [key, value] of this.permissionMeta.entries()) {
        serialized[key] = value;
      }

      await chrome.storage.local.set({
        [this.permissionMetaStorageKey]: serialized
      });
    } catch (error) {
      console.warn('Failed to persist worker permission metadata:', error.message);
    }
  }

  listPermissionsSnapshot() {
    const permissions = [];
    for (const [key, capabilities] of this.permissions.entries()) {
      const meta = this.permissionMeta.get(key);

      permissions.push({
        key,
        origin: meta?.origin || '(unknown origin)',
        deviceId: meta?.deviceId || key,
        capabilities: Array.from(capabilities)
      });
    }

    return permissions;
  }

  getUIState() {
    return {
      nativeConnected: !!this.nativePort,
      connectedTabs: this.connections.size,
      pendingNativeRequests: this.pendingNativeRequests.size,
      pendingChoosers: this.chooserRequests.size,
      permissionCount: this.permissions.size,
      logCount: this.telemetry.length,
      lastEvent: this.telemetry.length ? this.telemetry[this.telemetry.length - 1] : null,
      timestamp: new Date().toISOString()
    };
  }

  recordTelemetry(level, category, message, details = null) {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details: details || null
    };

    this.telemetry.push(entry);
    if (this.telemetry.length > this.telemetryLimit) {
      this.telemetry.splice(0, this.telemetry.length - this.telemetryLimit);
    }

    this.saveTelemetry();
  }

  getTelemetryLogs() {
    return [...this.telemetry].reverse();
  }

  async clearTelemetryLogs() {
    this.telemetry = [];
    await this.saveTelemetry();
  }

  async loadTelemetry() {
    try {
      const result = await chrome.storage.local.get(this.telemetryStorageKey);
      const entries = result?.[this.telemetryStorageKey];
      if (Array.isArray(entries)) {
        this.telemetry = entries.slice(-this.telemetryLimit);
      }
    } catch (error) {
      console.warn('Failed to load worker telemetry:', error.message);
    }
  }

  async saveTelemetry() {
    try {
      await chrome.storage.local.set({
        [this.telemetryStorageKey]: this.telemetry
      });
    } catch (error) {
      console.warn('Failed to persist worker telemetry:', error.message);
    }
  }

  showDeviceNotification(title, deviceData = {}) {
    if (!chrome.notifications || typeof chrome.notifications.create !== 'function') {
      return;
    }

    const label = deviceData.name || deviceData.productName || deviceData.id || 'Unknown device';
    const message = `${label} (${deviceData.type || 'hardware'})`;

    chrome.notifications.create(`d4ab_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title,
      message
    });
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